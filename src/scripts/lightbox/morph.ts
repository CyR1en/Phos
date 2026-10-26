import type { CreateMorph } from './types'

const MORPH_NAME = 'lb-photo'
const MORPH_TIMEOUT = 1200

// Shared across controllers so teardown/reinitialisation cannot overlap two morphs.
let inFlight: Promise<void> | null = null

export const createMorph: CreateMorph = ctx => {
  async function morph(
    tile: HTMLElement | null,
    apply: (morphing: boolean) => void | Promise<void>,
    opening: boolean
  ): Promise<void> {
    const root = document.documentElement
    const activeTransition = (document as Document & {
      activeViewTransition?: ViewTransition | null
    }).activeViewTransition

    if (
      typeof document.startViewTransition !== 'function'
      || ctx.reducedMotion()
      || !tile
      || root.hasAttribute('data-astro-transition')
      || activeTransition
      || inFlight
    ) {
      await apply(false)
      return
    }

    const tileImg = tile.querySelector('img')
    const rect = tile.getBoundingClientRect()
    if (
      !tileImg
      || rect.right <= rect.left
      || rect.bottom <= rect.top
      || rect.right <= 0
      || rect.bottom <= 0
      || rect.left >= window.innerWidth
      || rect.top >= window.innerHeight
    ) {
      await apply(false)
      return
    }

    const photo = ctx.current()
    const imageRect = tileImg.getBoundingClientRect()
    const photoAspect = photo?.width && photo.height ? photo.width / photo.height : 0
    const imageAspect = imageRect.width / imageRect.height
    if (!photo?.width || !photo.height || photo.width <= 0 || photo.height <= 0
      || imageRect.width <= 0 || imageRect.height <= 0
      || !Number.isFinite(photoAspect) || !Number.isFinite(imageAspect)
      || imageAspect < photoAspect * 0.98 || imageAspect > photoAspect * 1.02) {
      await apply(false)
      return
    }

    let finishFlight!: () => void
    const flight = new Promise<void>(resolve => { finishFlight = resolve })
    inFlight = flight

    const source = opening ? tileImg : ctx.frontLayer()
    const named = new Set([source])
    let application: Promise<void> | undefined
    const applyOnce = (morphing: boolean) => application ??= Promise.resolve().then(() => apply(morphing))
    let active = true
    let transition: ViewTransition | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let timedOut = false

    try {
      root.classList.add('lightbox-morphing')
      if (!opening) root.classList.add('lightbox-morph-closing')
      source.style.viewTransitionName = MORPH_NAME
      transition = document.startViewTransition(async () => {
        // A skipped transition may invoke its callback after our timeout cleanup.
        if (!active) {
          await applyOnce(false)
          return
        }
        source.style.viewTransitionName = ''
        await applyOnce(true)
        if (!active) return
        const target = opening ? ctx.frontLayer() : tileImg
        named.add(target)
        target.style.viewTransitionName = MORPH_NAME
      })

      // `ready` can reject independently when another transition supersedes ours.
      void transition.ready.catch(() => {})
      void transition.updateCallbackDone.catch(() => {})
      await Promise.race([
        transition.finished.catch(() => {}),
        new Promise<void>(resolve => {
          timer = setTimeout(() => {
            timedOut = true
            resolve()
          }, MORPH_TIMEOUT)
        })
      ])
    } catch {
      // Starting a transition can fail before its update callback ever runs.
    } finally {
      active = false
      if (timer !== undefined) clearTimeout(timer)
      if (timedOut) {
        try { transition?.skipTransition?.() } catch {}
      }
      for (const image of named) image.style.viewTransitionName = ''
      root.classList.remove('lightbox-morphing')
      root.classList.remove('lightbox-morph-closing')
    }

    const releaseFlight = () => {
      finishFlight()
      if (inFlight === flight) inFlight = null
    }

    // Also covers failures/skips that never invoked the update callback.
    const applied = applyOnce(false)
    if (timedOut) {
      // Bound the morph even if image loading stalls, retaining the guard until apply settles.
      void applied.then(releaseFlight, releaseFlight)
      return
    }
    try {
      await applied
    } finally {
      releaseFlight()
    }
  }

  return {
    open: (tile, apply) => morph(tile, apply, true),
    close: (tile, apply) => morph(tile, apply, false)
  }
}
