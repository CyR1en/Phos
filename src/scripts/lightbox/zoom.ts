import type { CreateZoom } from './types'

const zoomTransition = 'transform 420ms cubic-bezier(.16,1,.3,1)'
const dragThreshold = 6
const doubleTapDelay = 300
const doubleTapDistance = 24

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export const createZoom: CreateZoom = (ctx, deps) => {
  let controller: AbortController | null = null
  let layer: HTMLImageElement | null = null
  let bounds: DOMRect | null = null
  let scale = 1
  let originX = 0.5
  let originY = 0.5
  let tx = 0
  let ty = 0
  let zoomToken = 0
  let pointer: {
    id: number
    x: number
    y: number
    moved: boolean
    fine: boolean
    layer: HTMLImageElement
    token: number
  } | null = null
  let lastTap: {
    x: number
    y: number
    time: number
    layer: HTMLImageElement
    token: number
  } | null = null
  const restorations = new Map<HTMLImageElement, {
    frame: number
    transition: string
  }>()

  function restoreTransition(img: HTMLImageElement) {
    const restoration = restorations.get(img)
    if (!restoration) return
    cancelAnimationFrame(restoration.frame)
    if (img.style.transition === 'none') img.style.transition = restoration.transition
    restorations.delete(img)
  }

  function setTransition(img: HTMLImageElement, transition: string) {
    restoreTransition(img)
    img.style.transition = transition
  }

  function withoutTransition(img: HTMLImageElement) {
    restoreTransition(img)
    const restoration = { frame: 0, transition: img.style.transition }
    img.style.transition = 'none'
    restorations.set(img, restoration)
    // Leave one painted frame without a transition, even when reset runs just before rAF.
    restoration.frame = requestAnimationFrame(() => {
      restoration.frame = requestAnimationFrame(() => {
        if (img.style.transition === 'none') img.style.transition = restoration.transition
        restorations.delete(img)
      })
    })
  }

  function activeLayer() {
    return ctx.state.zoomed && layer === ctx.frontLayer() && zoomToken === ctx.state.navToken
      && ctx.current() ? layer : null
  }

  function zoomIn(clientX?: number, clientY?: number) {
    const photo = ctx.current()
    if (!photo || ctx.state.zoomed) return
    const img = ctx.frontLayer()
    const rect = img.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const nextScale = Math.min(Math.max((photo.width ?? rect.width * 2) / rect.width, 1.75), 3)
    const nextOriginX = clientX === undefined ? 0.5 : clamp((clientX - rect.left) / rect.width, 0, 1)
    const nextOriginY = clientY === undefined ? 0.5 : clamp((clientY - rect.top) / rect.height, 0, 1)
    const token = ctx.state.navToken
    layer = img
    bounds = rect
    scale = nextScale
    originX = nextOriginX
    originY = nextOriginY
    tx = 0
    ty = 0
    zoomToken = token
    setTransition(img, ctx.reducedMotion() ? 'none' : zoomTransition)
    img.style.transformOrigin = `${originX * 100}% ${originY * 100}%`
    img.style.transform = `scale(${scale})`
    ctx.state.zoomed = true
    ctx.els.root.dataset.zoomed = ''
    ctx.els.zoomBtn.setAttribute('aria-pressed', 'true')
    // Decoding only improves fidelity; completion must never reapply zoom after a reset.
    void deps.loader.upgrade(img, photo, rect.width * nextScale).catch(() => {})
  }

  function reset(animated = true) {
    pointer = null
    lastTap = null
    if (ctx.state.zoomed) {
      const layers = new Set([ctx.frontLayer()])
      if (layer) layers.add(layer)
      for (const img of layers) {
        if (animated) setTransition(img, ctx.reducedMotion() ? 'none' : zoomTransition)
        else withoutTransition(img)
        img.style.transform = 'none'
        img.style.transformOrigin = ''
        img.style.translate = ''
      }
    }
    layer = null
    bounds = null
    scale = 1
    tx = 0
    ty = 0
    ctx.state.zoomed = false
    delete ctx.els.root.dataset.zoomed
    ctx.els.zoomBtn.setAttribute('aria-pressed', 'false')
  }

  function toggleAt(clientX?: number, clientY?: number) {
    if (ctx.state.zoomed) reset()
    else zoomIn(clientX, clientY)
  }

  function panBy(dx: number, dy: number) {
    const img = activeLayer()
    if (!img || !bounds || !Number.isFinite(dx) || !Number.isFinite(dy)) return
    const stage = ctx.els.stage
    const rect = stage.getBoundingClientRect()
    const styles = getComputedStyle(stage)
    const paddingLeft = parseFloat(styles.paddingLeft) || 0
    const paddingRight = parseFloat(styles.paddingRight) || 0
    const paddingTop = parseFloat(styles.paddingTop) || 0
    const paddingBottom = parseFloat(styles.paddingBottom) || 0
    const left = rect.left + stage.clientLeft + paddingLeft
    const top = rect.top + stage.clientTop + paddingTop
    const width = Math.max(0, stage.clientWidth - paddingLeft - paddingRight)
    const height = Math.max(0, stage.clientHeight - paddingTop - paddingBottom)
    const imageLeft = bounds.left + (1 - scale) * originX * bounds.width
    const imageTop = bounds.top + (1 - scale) * originY * bounds.height
    const scaledWidth = bounds.width * scale
    const scaledHeight = bounds.height * scale

    // An axis that remains letterboxed cannot cover the stage; keep it centred instead.
    tx = scaledWidth <= width
      ? left + (width - scaledWidth) / 2 - imageLeft
      : clamp(tx + dx, left + width - imageLeft - scaledWidth, left - imageLeft)
    ty = scaledHeight <= height
      ? top + (height - scaledHeight) / 2 - imageTop
      : clamp(ty + dy, top + height - imageTop - scaledHeight, top - imageTop)
    setTransition(img, 'none')
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`
  }

  function followPointer(clientX: number, clientY: number) {
    const img = activeLayer()
    if (!img || !bounds || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return
    originX = clamp((clientX - bounds.left) / bounds.width, 0, 1)
    originY = clamp((clientY - bounds.top) / bounds.height, 0, 1)
    setTransition(img, ctx.reducedMotion() ? 'none' : `${zoomTransition}, transform-origin 120ms linear`)
    img.style.transformOrigin = `${originX * 100}% ${originY * 100}%`
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0 || event.isPrimary === false || event.target !== ctx.frontLayer() || !ctx.current()) {
      pointer = null
      lastTap = null
      return
    }
    pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      fine: ctx.finePointer() && event.pointerType !== 'touch',
      layer: ctx.frontLayer(),
      token: ctx.state.navToken
    }
  }

  function onPointerMove(event: PointerEvent) {
    if (pointer && pointer.id === event.pointerId
      && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > dragThreshold) {
      pointer.moved = true
      lastTap = null
    }
    // Mouse movement always explores via the origin; only touch and pen drags translate.
    if (ctx.finePointer() && event.pointerType === 'mouse') {
      followPointer(event.clientX, event.clientY)
    }
  }

  function onPointerUp(event: PointerEvent) {
    if (!pointer || pointer.id !== event.pointerId) return
    const start = pointer
    pointer = null
    if (start.moved || Math.hypot(event.clientX - start.x, event.clientY - start.y) > dragThreshold
      || start.layer !== ctx.frontLayer() || start.token !== ctx.state.navToken || !ctx.current()) {
      lastTap = null
      return
    }
    if (start.fine) {
      lastTap = null
      toggleAt(event.clientX, event.clientY)
      return
    }
    const tap = lastTap
    lastTap = null
    if (tap && tap.layer === start.layer && tap.token === start.token
      && event.timeStamp - tap.time >= 0 && event.timeStamp - tap.time <= doubleTapDelay
      && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) <= doubleTapDistance) {
      toggleAt(event.clientX, event.clientY)
    } else {
      lastTap = {
        x: event.clientX,
        y: event.clientY,
        time: event.timeStamp,
        layer: start.layer,
        token: start.token
      }
    }
  }

  function cancelPointer(event: PointerEvent) {
    if (!pointer || pointer.id !== event.pointerId) return
    pointer = null
    lastTap = null
  }

  function attach() {
    if (controller) return
    controller = new AbortController()
    const options = { signal: controller.signal, capture: true }
    const stage = ctx.els.stage
    stage.addEventListener('pointerdown', onPointerDown, options)
    stage.addEventListener('pointermove', onPointerMove, options)
    stage.addEventListener('pointerup', onPointerUp, options)
    stage.addEventListener('pointercancel', cancelPointer, options)
    stage.addEventListener('lostpointercapture', cancelPointer, options)
    stage.addEventListener('pointerleave', cancelPointer, options)
    ctx.els.zoomBtn.addEventListener('click', () => {
      const rect = stage.getBoundingClientRect()
      toggleAt(rect.left + rect.width / 2, rect.top + rect.height / 2)
    }, { signal: controller.signal })
  }

  function detach() {
    controller?.abort()
    controller = null
    reset(false)
  }

  return {
    isZoomed: () => ctx.state.zoomed,
    toggleAt,
    zoomIn,
    reset,
    panBy,
    followPointer,
    attach,
    detach
  }
}
