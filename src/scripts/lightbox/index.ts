import { createLoader } from './loader'
import { createNavigation } from './navigation'
import { createZoom } from './zoom'
import { createGestures } from './gestures'
import { createHistory } from './history'
import { createDialog } from './dialog'
import { createMorph } from './morph'
import type {
  LightboxContext,
  LightboxController,
  LightboxElements,
  LightboxPhoto,
  LightboxState,
  NavDirection,
} from './types'

interface LifecycleOptions {
  silent?: boolean
}

export function createLightbox(root: HTMLDialogElement): LightboxController {
  function element<T extends HTMLElement>(id: string): T {
    const el = root.querySelector<T>(`#${id}`)
    if (!el) throw new Error(`Missing lightbox element: ${id}`)
    return el
  }

  const els: LightboxElements = {
    root,
    stage: element('lightbox-stage'),
    layers: [element<HTMLImageElement>('lightbox-img-a'), element<HTMLImageElement>('lightbox-img-b')],
    error: element('lightbox-error'),
    title: element('lightbox-title'),
    description: element('lightbox-description'),
    counter: element('lightbox-counter'),
    live: element('lightbox-live'),
    closeBtn: element<HTMLButtonElement>('lightbox-close'),
    prevBtn: element<HTMLButtonElement>('lightbox-prev'),
    nextBtn: element<HTMLButtonElement>('lightbox-next'),
    zoomBtn: element<HTMLButtonElement>('lightbox-zoom'),
    data: element<HTMLScriptElement>('lightbox-data'),
  }
  const state: LightboxState = {
    photos: [],
    index: 0,
    open: false,
    zoomed: false,
    navToken: 0,
    front: 0,
    opener: null,
    suppressClickUntil: 0,
  }
  let destroyed = false
  let opening = false
  let closing = false
  // Dialog clears state.open before onClosed; retain ownership for native-close history cleanup.
  let opened = false
  let lifecycleToken = 0

  try {
    const photos: unknown = JSON.parse(els.data.textContent || '[]')
    if (Array.isArray(photos)) state.photos = photos as LightboxPhoto[]
  } catch {
    state.photos = []
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
  const ctx: LightboxContext = {
    els,
    state,
    // Teardown also uses the instant path so a route swap never leaves a modal or scroll lock.
    reducedMotion: () => destroyed || reducedMotion.matches,
    finePointer: () => finePointer.matches,
    frontLayer: () => els.layers[state.front],
    backLayer: () => els.layers[state.front === 0 ? 1 : 0],
    swapLayers() {
      state.front = state.front === 0 ? 1 : 0
      els.layers[state.front].dataset.layer = 'front'
      els.layers[state.front].removeAttribute('aria-hidden')
      const back = els.layers[state.front === 0 ? 1 : 0]
      back.dataset.layer = 'back'
      back.setAttribute('aria-hidden', 'true')
      back.alt = ''
    },
    current: () => state.photos[state.index] ?? null,
    tileFor: (index) => {
      const tiles = Array.from(document.querySelectorAll<HTMLElement>(`[data-index="${index}"]`))
      return tiles.find(tile => tile.checkVisibility ? tile.checkVisibility() : tile.offsetParent !== null)
        ?? tiles[0] ?? null
    },
  }
  els.layers[0].dataset.layer = 'front'
  els.layers[0].removeAttribute('aria-hidden')
  els.layers[1].dataset.layer = 'back'
  els.layers[1].setAttribute('aria-hidden', 'true')
  els.layers[1].alt = ''

  const loader = createLoader(ctx)
  const zoom = createZoom(ctx, { loader })
  const nav = createNavigation(ctx, {
    loader,
    beforeShow: () => { if (zoom.isZoomed()) zoom.reset(false) },
    afterShow: (index) => history.onNavigate(index),
  })
  const history = createHistory(ctx, {
    openSilently: (index) => { void openAt(index, null, { silent: true }) },
    closeSilently: () => { void closeNow({ silent: true }) },
  })
  const dialog = createDialog(ctx, {
    // Escape / backdrop: unzoom first; otherwise run the controller's close (reverse morph + history).
    onCancel: () => {
      if (zoom.isZoomed()) { zoom.reset(); return true }
      close()
      return true
    },
    onRequestClose: close,
    onArrow: (direction: NavDirection) => direction > 0 ? nav.next() : nav.prev(),
    onClosed() {
      const wasOpen = opened
      opened = false
      state.open = false
      state.navToken++
      zoom.reset(false)
      gestures.detach()
      for (const layer of els.layers) {
        layer.removeAttribute('src')
        layer.removeAttribute('srcset')
        layer.removeAttribute('sizes')
        layer.alt = ''
        layer.style.width = ''
        layer.style.aspectRatio = ''
        layer.style.transform = ''
        layer.style.opacity = ''
        layer.removeAttribute('data-swiped-out')
      }
      delete root.dataset.error
      els.live.textContent = ''
      root.style.removeProperty('--lb-backdrop')
      // Native cancel, close-button, and backdrop paths may close through the dialog module.
      if (wasOpen && !closing && !destroyed) {
        lifecycleToken++
        history.onClose()
      }
      closing = false
    },
  })
  const gestures = createGestures(ctx, {
    zoom,
    next: nav.next,
    prev: nav.prev,
    canNext: nav.canNext,
    canPrev: nav.canPrev,
    close,
  })
  const morph = createMorph(ctx)

  async function openAt(index: number, opener: HTMLElement | null = null, options: LifecycleOptions = {}) {
    if (destroyed || !Number.isInteger(index) || index < 0 || index >= state.photos.length) return
    // Already open (history traversal between photos): just show the photo, no morph or dialog work.
    if (state.open && !closing) {
      await nav.show(index, 0, { instant: true })
      return
    }
    const token = ++lifecycleToken
    opening = true
    closing = false
    state.opener = opener ?? ctx.tileFor(index)
    state.index = index
    if (!options.silent) history.onOpen(index)
    const tileImg = state.opener?.querySelector('img')
    const firstPaintSrc = tileImg && tileImg.complete && tileImg.naturalWidth > 0 ? tileImg.currentSrc || tileImg.src : undefined
    await morph.open(state.opener, (morphing) => {
      if (destroyed || token !== lifecycleToken) return
      dialog.open(state.opener, { immediate: morphing })
      state.open = true
      opening = false
      opened = true
      // Swipes must work during the morph, not only after it settles.
      gestures.attach()
      // A synchronous grid filter may have remapped the index while the morph was starting.
      return nav.show(state.index, 0, { instant: true, firstPaintSrc })
    })
  }

  async function closeNow(options: LifecycleOptions = {}) {
    if (destroyed || closing || (!state.open && !opening)) return
    if (!state.open) {
      // Back can arrive before the View Transition invokes the pending open callback.
      opening = false
      lifecycleToken++
      state.navToken++
      if (!options.silent) history.onClose()
      return
    }
    const token = ++lifecycleToken
    closing = true
    state.navToken++
    state.opener = ctx.tileFor(state.index) ?? state.opener
    if (zoom.isZoomed()) zoom.reset(false)
    await morph.close(ctx.tileFor(state.index), (morphing) => {
      if (destroyed || token !== lifecycleToken) return
      dialog.close({ immediate: morphing })
      // Same-document traversal inside the callback does not disturb the View Transition, and a
      // reopen during the reverse morph must never land on top of a stale #photo= entry.
      if (!options.silent) history.onClose()
    })
  }

  function open(index: number, opener?: HTMLElement | null) {
    void openAt(index, opener)
  }

  function close() {
    void closeNow()
  }

  function next() {
    if (!destroyed) nav.next()
  }

  function prev() {
    if (!destroyed) nav.prev()
  }

  function setPhotos(photos: LightboxPhoto[]) {
    if (destroyed) return
    nav.setPhotos(photos)
    els.data.textContent = JSON.stringify(photos).replace(/</g, '\\u003c')
  }

  // Claim plain tile clicks before Astro's bubble-phase router can navigate to the original.
  function onDocumentClick(event: MouseEvent) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (!(event.target instanceof Element)) return
    const tile = event.target.closest<HTMLElement>('[data-index]')
    if (!tile) return
    const index = parseInt(tile.dataset.index || '', 10)
    if (Number.isNaN(index) || index < 0 || index >= state.photos.length) return
    event.preventDefault()
    open(index, tile)
  }

  function onBeforeSwap() {
    controller.destroy()
  }

  const controller: LightboxController = {
    open,
    close,
    next,
    prev,
    setPhotos,
    isOpen: () => state.open,
    destroy() {
      if (destroyed) return
      destroyed = true
      lifecycleToken++
      state.navToken++
      gestures.detach()
      zoom.reset(false)
      if (state.open || dialog.isOpen()) dialog.close()
      zoom.detach()
      history.detach()
      dialog.detach()
      if (root.open) root.close()
      state.open = false
      opening = false
      opened = false
      closing = false
      root.classList.remove('lightbox-enter', 'lightbox-exit')
      for (const el of [root, ...els.layers]) {
        el.getAnimations().forEach((animation) => animation.cancel())
      }
      document.removeEventListener('click', onDocumentClick, true)
      document.removeEventListener('astro:before-swap', onBeforeSwap)
      els.prevBtn.removeEventListener('click', prev)
      els.nextBtn.removeEventListener('click', next)
      if (window.__updateLightboxData === setPhotos) delete window.__updateLightboxData
      if (window.__phosLightbox === controller) delete window.__phosLightbox
    },
  }

  zoom.attach()
  history.attach()
  dialog.attach()
  els.prevBtn.addEventListener('click', prev)
  els.nextBtn.addEventListener('click', next)
  document.addEventListener('click', onDocumentClick, true)
  document.addEventListener('astro:before-swap', onBeforeSwap, { once: true })
  window.__updateLightboxData = setPhotos

  // Deep link: open and let history adopt the current entry (it never pushes for a hash it already owns).
  const index = history.indexFromHash()
  if (index !== null) void openAt(index, ctx.tileFor(index))

  return controller
}

export function initLightbox(): void {
  window.__phosLightbox?.destroy()
  const root = document.getElementById('lightbox') as HTMLDialogElement | null
  if (!root) return
  window.__phosLightbox = createLightbox(root)
}
