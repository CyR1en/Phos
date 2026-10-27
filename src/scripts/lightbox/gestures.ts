import type { CreateGestures } from './types'
import { easing } from '../motion'

const EASING = easing('sheet')
const BACKDROP = '--lb-backdrop'
const SAMPLE_COUNT = 32

interface Sample {
  x: number
  time: number
}

interface Gesture {
  pointerId: number
  startX: number
  startY: number
  dx: number
  dy: number
  lastDx: number
  lastDy: number
  axis: 'horizontal' | 'vertical' | null
  panning: boolean
  layer: HTMLImageElement
  navToken: number
}

interface LayerStyles {
  layer: HTMLImageElement
  transform: string
  transition: string
}

export const createGestures: CreateGestures = (ctx, deps) => {
  const stage = ctx.els.stage
  const pointers = new Set<number>()
  const draggedPointers = new Set<number>()
  const samples: Sample[] = []
  let sampleIndex = 0
  let sampleCount = 0
  let controller: AbortController | null = null
  let gesture: Gesture | null = null
  let dragging = false
  let animation: Animation | null = null
  let styles: LayerStyles | null = null
  let backdrop: string | null = null

  function sample(x: number, time: number) {
    samples[sampleIndex] = { x, time }
    sampleIndex = (sampleIndex + 1) % SAMPLE_COUNT
    sampleCount = Math.min(sampleCount + 1, SAMPLE_COUNT)
  }

  function velocity() {
    const at = (index: number) => samples[(sampleIndex - sampleCount + index + SAMPLE_COUNT) % SAMPLE_COUNT]!
    if (sampleCount < 2) return 0
    const latest = at(sampleCount - 1)
    const cutoff = latest.time - 80
    let first = at(0)

    for (let i = 1; i < sampleCount; i++) {
      const next = at(i)
      if (next.time > cutoff) {
        if (first.time < cutoff) {
          const progress = (cutoff - first.time) / (next.time - first.time)
          first = { x: first.x + (next.x - first.x) * progress, time: cutoff }
        }
        break
      }
      first = next
    }

    const elapsed = latest.time - first.time
    return elapsed > 0 ? (latest.x - first.x) / elapsed : 0
  }

  function resetBackdrop() {
    if (backdrop === null) return
    if (backdrop) ctx.els.root.style.setProperty(BACKDROP, backdrop)
    else ctx.els.root.style.removeProperty(BACKDROP)
    backdrop = null
  }

  function clearStyles(owned = styles) {
    if (owned && styles === owned) {
      owned.layer.style.transform = owned.transform
      owned.layer.style.transition = owned.transition
      styles = null
    }
    resetBackdrop()
  }

  function cancelAnimation() {
    const current = animation
    animation = null
    current?.cancel()
  }

  function transform(layer: HTMLImageElement, value: string) {
    styles ??= { layer, transform: layer.style.transform, transition: layer.style.transition }
    layer.style.transition = 'none'
    layer.style.transform = value
  }

  function settle(target: string, duration: number, complete?: () => void) {
    cancelAnimation()
    const owned = styles
    const finish = () => {
      if (owned) owned.layer.style.transform = target
      try {
        complete?.()
      } finally {
        clearStyles(owned)
      }
    }

    if (!owned || ctx.reducedMotion()) {
      finish()
      return
    }

    const current = owned.layer.animate([
      { transform: owned.layer.style.transform || 'none' },
      { transform: target }
    ], { duration, easing: EASING, fill: 'forwards' })
    animation = current

    void current.finished.then(() => {
      if (animation !== current) return
      animation = null
      // Keep the exit position when cancelling our fill, before navigation takes ownership.
      current.cancel()
      finish()
    }, () => {
      if (animation !== current) return
      animation = null
      clearStyles(owned)
    })
  }

  function releaseCapture(pointerId: number) {
    try {
      if (stage.hasPointerCapture(pointerId)) stage.releasePointerCapture(pointerId)
    } catch {
      // Capture may already be gone when the stage is removed or a pointer is cancelled.
    }
  }

  function cancelGesture() {
    gesture = null
    dragging = false
    settle('none', 300)
  }

  function suppressClick(pointerId: number) {
    if (draggedPointers.delete(pointerId)) ctx.state.suppressClickUntil = performance.now() + 100
  }

  function onPointerDown(event: PointerEvent) {
    const coarse = event.pointerType === 'touch' || event.pointerType === 'pen'
    if (!coarse) return
    if (pointers.has(event.pointerId)) return
    pointers.add(event.pointerId)

    try {
      stage.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic events and a detached stage may not have an active browser pointer.
    }

    if (pointers.size > 1) {
      cancelGesture()
      return
    }

    cancelAnimation()
    clearStyles()
    sampleIndex = 0
    sampleCount = 0
    sample(event.clientX, event.timeStamp)
    gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      dy: 0,
      lastDx: 0,
      lastDy: 0,
      axis: null,
      panning: deps.zoom.isZoomed(),
      layer: ctx.frontLayer(),
      navToken: ctx.state.navToken
    }
  }

  function onPointerMove(event: PointerEvent) {
    const current = gesture
    if (!current || current.pointerId !== event.pointerId) return
    current.dx = event.clientX - current.startX
    current.dy = event.clientY - current.startY
    sample(event.clientX, event.timeStamp)
    const { dx, dy } = current
    if (!dragging && Math.hypot(dx, dy) <= 6) return

    dragging = true
    draggedPointers.add(event.pointerId)
    current.axis ??= Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'

    if (deps.zoom.isZoomed()) current.panning = true
    if (current.panning) {
      clearStyles()
      if (deps.zoom.isZoomed() && (dx !== current.lastDx || dy !== current.lastDy)) {
        deps.zoom.panBy(dx - current.lastDx, dy - current.lastDy)
      }
    } else if (current.axis === 'horizontal') {
      const atEnd = dx > 0 ? !deps.canPrev() : !deps.canNext()
      transform(current.layer, `translateX(${dx * (atEnd ? 0.3 : 1)}px)`)
    } else if (dy > 0) {
      transform(current.layer, `translateY(${dy}px) scale(${1 - dy / 2000})`)
      backdrop ??= ctx.els.root.style.getPropertyValue(BACKDROP)
      ctx.els.root.style.setProperty(BACKDROP, `${Math.max(0, 0.95 * (1 - dy / 500))}`)
    } else if (styles) {
      transform(current.layer, 'none')
      resetBackdrop()
    }

    current.lastDx = dx
    current.lastDy = dy
  }

  function onPointerUp(event: PointerEvent) {
    pointers.delete(event.pointerId)
    const current = gesture
    if (!current || current.pointerId !== event.pointerId) {
      suppressClick(event.pointerId)
      releaseCapture(event.pointerId)
      return
    }

    onPointerMove(event)
    suppressClick(event.pointerId)
    gesture = null
    const wasDragging = dragging
    dragging = false
    releaseCapture(event.pointerId)

    if (!wasDragging || current.panning || deps.zoom.isZoomed()) {
      clearStyles()
      return
    }

    if (current.axis === 'horizontal') {
      const forward = current.dx < 0
      const navigable = current.dx !== 0 && (forward ? deps.canNext() : deps.canPrev())
      const commit = Math.abs(current.dx) > window.innerWidth * 0.18 || Math.abs(velocity()) > 0.45
      if (navigable && commit) {
        settle(`translateX(${forward ? '-100vw' : '100vw'})`, 260, () => {
          if (ctx.state.navToken !== current.navToken || ctx.frontLayer() !== current.layer) return
          current.layer.style.opacity = '0'
          current.layer.dataset.swipedOut = '1'
          // Navigation now owns this hidden layer; spring-back cleanup must not restore it.
          if (styles?.layer === current.layer) {
            current.layer.style.transition = styles.transition
            styles = null
          }
          if (forward) deps.next()
          else deps.prev()
        })
        return
      }
    } else if (current.dy > 120) {
      deps.close()
      return
    }

    settle('none', 300)
  }

  function onPointerCancel(event: PointerEvent) {
    pointers.delete(event.pointerId)
    suppressClick(event.pointerId)
    if (gesture?.pointerId === event.pointerId) cancelGesture()
    releaseCapture(event.pointerId)
  }

  function onLostPointerCapture(event: PointerEvent) {
    pointers.delete(event.pointerId)
    if (gesture?.pointerId === event.pointerId) cancelGesture()
  }

  return {
    attach() {
      if (controller) return
      controller = new AbortController()
      const options = { signal: controller.signal }
      stage.addEventListener('pointerdown', onPointerDown, options)
      stage.addEventListener('pointermove', onPointerMove, options)
      stage.addEventListener('pointerup', onPointerUp, options)
      stage.addEventListener('pointercancel', onPointerCancel, options)
      stage.addEventListener('lostpointercapture', onLostPointerCapture, options)
    },
    detach() {
      controller?.abort()
      controller = null
      gesture = null
      dragging = false
      cancelAnimation()
      clearStyles()
      for (const pointerId of pointers) releaseCapture(pointerId)
      pointers.clear()
      draggedPointers.clear()
      sampleCount = 0
    },
    isDragging: () => dragging
  }
}
