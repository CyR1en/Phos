/**
 * Lightbox module contracts (Phase 3).
 *
 * The lightbox is composed from small modules that each own one concern. Every module is a
 * factory `createX(ctx, deps)` that returns the interface below. Modules never reach into each
 * other directly: cross-module calls go through the `deps` callbacks the orchestrator wires up
 * in `index.ts`. Keep this file free of DOM side effects; it is types and tiny pure helpers only.
 */

/** One photo as serialised into `<script type="application/json" id="lightbox-data">`. */
export interface LightboxPhoto {
  filename: string
  category?: string
  /** Authored title, or a filename-derived title ("Sample 03") when `titleIsAuto` is true. */
  title: string
  /** Auto titles are NEVER shown in captions. Alt text is description || authoredTitle ||
   *  '<category> photograph' (or 'photograph' when there is no category). */
  titleIsAuto?: boolean
  description?: string
  /** 800px-wide grid thumbnail, usually already cached by the page. Painted first. */
  thumb: string
  /** Responsive ladder for the stage: immersive-mobile 1100w / immersive 2200w / hd ≤3840w. */
  srcset: string
  /** Original file. Only used as a last-resort `src` when `srcset` is empty. */
  full?: string
  width: number | null
  height: number | null
}

/** +1 = forward (next), -1 = backward (prev), 0 = no direction (open / filter reset). */
export type NavDirection = 1 | -1 | 0

/** Stable key for history hashes and tile lookup: "category/filename-without-extension". */
export function photoKey(photo: Pick<LightboxPhoto, 'category' | 'filename'>): string {
  const base = photo.filename.replace(/\.[^.]+$/, '')
  return photo.category ? `${photo.category}/${base}` : base
}

/** DOM hooks. Ids are the contract between `Lightbox.astro` and the modules. */
export interface LightboxElements {
  /** `<dialog id="lightbox">` */
  root: HTMLDialogElement
  /** `#lightbox-stage`: the photo area. Size container, `overflow: hidden`, `touch-action: none`. */
  stage: HTMLElement
  /** `#lightbox-img-a` and `#lightbox-img-b`: two stacked `<img>` layers inside the stage.
   *  `data-swiped-out` means gestures animated the layer off-screen; navigation must skip its
   *  leaving animation and clear the attribute. */
  layers: [HTMLImageElement, HTMLImageElement]
  /** `#lightbox-error` */
  error: HTMLElement
  /** `#lightbox-title` (hidden when the title is filename-derived or empty) */
  title: HTMLElement
  /** `#lightbox-description` */
  description: HTMLElement
  /** `#lightbox-counter` ("3 / 16", tabular numerals) */
  counter: HTMLElement
  /** `#lightbox-live`: visually hidden `aria-live="polite"` region announcing "Photo 3 of 16, <title>" */
  live: HTMLElement
  /** `#lightbox-close`, `#lightbox-prev`, `#lightbox-next`, `#lightbox-zoom` (all 44px targets) */
  closeBtn: HTMLButtonElement
  prevBtn: HTMLButtonElement
  nextBtn: HTMLButtonElement
  zoomBtn: HTMLButtonElement
  /** `<script type="application/json" id="lightbox-data">` */
  data: HTMLScriptElement
}

export interface LightboxState {
  photos: LightboxPhoto[]
  index: number
  open: boolean
  zoomed: boolean
  /** Bumped on every navigation / open / filter reset. Async work compares its captured token
   *  against this value and abandons itself when they differ ("newest request wins"). */
  navToken: number
  /** Which layer is in front: 0 → layers[0], 1 → layers[1]. */
  front: 0 | 1
  /** The element that opened the lightbox (a grid tile), for focus return and the morph. */
  opener: HTMLElement | null
  /** performance.now() timestamp: ignore synthetic backdrop clicks until this time after a drag. */
  suppressClickUntil: number
}

export interface LightboxContext {
  els: LightboxElements
  state: LightboxState
  reducedMotion(): boolean
  /** `(hover: hover) and (pointer: fine)` */
  finePointer(): boolean
  frontLayer(): HTMLImageElement
  backLayer(): HTMLImageElement
  /** Flip `state.front`; the caller has already made the back layer visible. */
  swapLayers(): void
  /** Current photo or null. */
  current(): LightboxPhoto | null
  /** Find the grid tile for a photo index in the page (`[data-index="i"]`), or null. */
  tileFor(index: number): HTMLElement | null
}

/* ---------------------------------------------------------------------------------------- */
/* loader.ts                                                                                */
/* ---------------------------------------------------------------------------------------- */

export interface Loader {
  /** CSS px the photo will display at inside the stage (stage content box, aspect-fitted,
   *  never larger than the photo's own width). */
  displayWidth(photo: LightboxPhoto): number
  /** Size the `<img>` box to the photo's aspect inside the stage so thumb and HD paint at the
   *  same size (inline `aspect-ratio` + `width: min(100cqw, 100cqh * ratio, <width>px)`). */
  fit(img: HTMLImageElement, photo: LightboxPhoto): void
  /**
   * Thumb-first load into `img`: paints `thumb` immediately, then decodes the HD rendition
   * (`srcset` + `sizes = displayWidth(photo)px`) off-screen and swaps it in. Resolves as soon as
   * SOMETHING is painted (thumb, or HD if the thumb failed). Rejects only when both fail.
   * Abandons silently (resolves `{ aborted: true }`) when `ctx.state.navToken !== token`.
   */
  load(img: HTMLImageElement, photo: LightboxPhoto, token: number, firstPaintSrc?: string): Promise<{ hd: boolean; aborted?: boolean }>
  /** Re-request a larger rendition for zoom: sets `sizes` to `cssWidth`px and resolves once
   *  decoded (or immediately if nothing larger exists). Never changes `src`. */
  upgrade(img: HTMLImageElement, photo: LightboxPhoto, cssWidth: number): Promise<void>
  /** Warm the thumb + HD of index-1 and index+1. */
  preloadNeighbors(index: number): void
}
export type CreateLoader = (ctx: LightboxContext) => Loader

/* ---------------------------------------------------------------------------------------- */
/* navigation.ts                                                                            */
/* ---------------------------------------------------------------------------------------- */

export interface NavigationDeps {
  loader: Loader
  /** Called before a new photo starts loading (reset zoom, cancel gestures). */
  beforeShow(): void
  /** Called once the new photo is on screen (history replaceState, etc.). */
  afterShow(index: number): void
}

export interface Navigation {
  /**
   * Show `index`. Newest request wins: bumps `state.navToken`; abandoned requests never touch
   * the DOM. Keeps the OUTGOING photo visible until the incoming thumb has painted, then runs a
   * directional crossfade with WAAPI (incoming: opacity 0→1 + translateX(dir*24px→0) 320ms
   * cubic-bezier(.16,1,.3,1); outgoing: opacity 1→0 + translateX(0→-dir*24px) 220ms
   * cubic-bezier(.4,0,1,1)), then swaps layers and clears the old layer. Instant swap under
   * reduced motion or with `instant`, after the thumb has painted. `dir = 0` means "no slide"
   * (open or filter reset): fade only unless `instant` is set.
   */
  /** `firstPaintSrc`: an already-decoded URL for this photo (the opener tile's `currentSrc`), painted
   *  instead of `thumb` so an open under a View Transition never waits on the network. */
  show(index: number, dir: NavDirection, opts?: { instant?: boolean; firstPaintSrc?: string }): Promise<void>
  next(): void
  prev(): void
  canNext(): boolean
  canPrev(): boolean
  /** Update title/description/counter/live region and the prev/next `disabled` state. */
  announce(): void
  /** Replace the photo list (grid filter), preserving the current photo by photoKey when possible.
   *  If open, re-shows the preserved index (or 0) instantly with `dir = 0`. */
  setPhotos(photos: LightboxPhoto[]): void
}
export type CreateNavigation = (ctx: LightboxContext, deps: NavigationDeps) => Navigation

/* ---------------------------------------------------------------------------------------- */
/* zoom.ts                                                                                  */
/* ---------------------------------------------------------------------------------------- */

export interface ZoomDeps {
  loader: Loader
}

export interface Zoom {
  isZoomed(): boolean
  /** Toggle zoom anchored at a client point (click / double-tap / button → stage centre). */
  toggleAt(clientX?: number, clientY?: number): void
  /**
   * Zoom in at a point: scale = min(max(photo.width / rect.width, 1.75), 3), `transform-origin`
   * at the point, `transition: transform 420ms cubic-bezier(.16,1,.3,1)`. Scales immediately and calls
   * `loader.upgrade(img, photo, rect.width * scale)` in the background so the larger tier swaps in
   * when it arrives (never block the zoom on the network).
   */
  zoomIn(clientX?: number, clientY?: number): void
  /** Back to scale 1 (animated unless `animated === false`), clears translate/origin. */
  reset(animated?: boolean): void
  /** Pan the zoomed image by a delta in client px, clamped so the image never leaves the stage. */
  panBy(dx: number, dy: number): void
  /** Mouse: move the transform origin to follow the pointer while zoomed. */
  followPointer(clientX: number, clientY: number): void
  attach(): void
  detach(): void
}
export type CreateZoom = (ctx: LightboxContext, deps: ZoomDeps) => Zoom

/* ---------------------------------------------------------------------------------------- */
/* gestures.ts                                                                              */
/* ---------------------------------------------------------------------------------------- */

export interface GesturesDeps {
  zoom: Zoom
  next(): void
  prev(): void
  canNext(): boolean
  canPrev(): boolean
  close(): void
}

/** Pointer Events on the stage: 1:1 horizontal swipe (0.3× resistance past the ends), commit
 *  when |dx| > 18% of innerWidth or fling > 0.45 px/ms (animate the current layer out
 *  translateX(±100vw) 260ms cubic-bezier(.32,.72,0,1), then call next/prev), otherwise spring
 *  back 300ms; drag-down to dismiss (translateY(dy) scale(1 - dy/2000), backdrop fades with
 *  dy/500, close when dy > 120); when zoomed, drags pan instead. Fine pointers never swipe. */
export interface Gestures {
  attach(): void
  detach(): void
  /** True while a pointer drag is in progress (navigation should ignore keyboard repeats). */
  isDragging(): boolean
}
export type CreateGestures = (ctx: LightboxContext, deps: GesturesDeps) => Gestures

/* ---------------------------------------------------------------------------------------- */
/* history.ts                                                                               */
/* ---------------------------------------------------------------------------------------- */

export interface HistoryDeps {
  /** Open at index without pushing a new entry (used for hash-on-load and popstate forward). */
  openSilently(index: number): void
  /** Close without touching history (used on popstate back). */
  closeSilently(): void
}

/**
 * URL state: `#photo=<photoKey>`. `onOpen` pushes `{ ...history.state, phosLightbox: key }`;
 * `onNavigate` replaces; `onClose` goes back one entry if the current entry is ours, else
 * replaces the hash away. A CAPTURE-phase `popstate` listener on `window` handles our entries
 * and calls `stopImmediatePropagation()` so Astro's `<ClientRouter />` popstate handler never
 * sees them (the router would otherwise re-navigate to the current URL).
 */
export interface LightboxHistory {
  onOpen(index: number): void
  onNavigate(index: number): void
  onClose(): void
  /** Index of the photo named by `location.hash` in `state.photos`, or null. */
  indexFromHash(): number | null
  attach(): void
  detach(): void
}
export type CreateHistory = (ctx: LightboxContext, deps: HistoryDeps) => LightboxHistory

/* ---------------------------------------------------------------------------------------- */
/* dialog.ts                                                                                */
/* ---------------------------------------------------------------------------------------- */

export interface DialogDeps {
  /** Escape pressed (dialog `cancel`) or backdrop click: return true if handled (zoom reset, or the
   *  owner started its own close path), false to let the dialog close itself. */
  onCancel(): boolean
  /** Close button: the owner runs its full close path (reverse morph, history) and must close the
   *  dialog itself. When absent the dialog closes directly. */
  onRequestClose?(): void
  onArrow(dir: NavDirection): void
  /** Called after the dialog has closed and focus was returned. */
  onClosed(): void
}

/**
 * `<dialog>` lifecycle: `showModal()` (top layer, inert page, native focus containment),
 * body scroll lock, enter/exit animation hooks (`.lightbox-enter` /
 * `.lightbox-exit` classes), initial focus on the close button, focus return to the opener.
 */
export interface Dialog {
  /** `immediate` skips the enter class animation for a View Transition morph.
   *  Opening during a pending exit cancels that exit and keeps the dialog open. */
  open(opener: HTMLElement | null, opts?: { immediate?: boolean }): void
  /** `immediate` skips the exit class animation for a View Transition morph. */
  close(opts?: { immediate?: boolean }): void
  isOpen(): boolean
  attach(): void
  detach(): void
}
export type CreateDialog = (ctx: LightboxContext, deps: DialogDeps) => Dialog

/* ---------------------------------------------------------------------------------------- */
/* morph.ts                                                                                 */
/* ---------------------------------------------------------------------------------------- */

/**
 * Same-document View Transition that grows the photo out of its grid tile on open and back
 * into it on close (`view-transition-name: lb-photo` on the tile `<img>` and the front layer;
 * group duration 460ms cubic-bezier(.32,.72,0,1)). Falls back to running `apply()` directly
 * when `document.startViewTransition` is missing, under reduced motion, or when `tile` is
 * null / off-screen.
 */
export interface Morph {
  /** `morphing` is true when a View Transition actually runs. */
  open(tile: HTMLElement | null, apply: (morphing: boolean) => void | Promise<void>): Promise<void>
  /** `morphing` is true when a View Transition actually runs. */
  close(tile: HTMLElement | null, apply: (morphing: boolean) => void): Promise<void>
}
export type CreateMorph = (ctx: LightboxContext) => Morph

/* ---------------------------------------------------------------------------------------- */
/* index.ts (orchestrator)                                                                  */
/* ---------------------------------------------------------------------------------------- */

export interface LightboxController {
  open(index: number, opener?: HTMLElement | null): void
  close(): void
  next(): void
  prev(): void
  setPhotos(photos: LightboxPhoto[]): void
  isOpen(): boolean
  /** Remove every listener and global hook; safe to call twice. */
  destroy(): void
}

declare global {
  interface Window {
    /** Set by the orchestrator; pages with filters call it with the filtered list. */
    __updateLightboxData?: (photos: LightboxPhoto[]) => void
    /** The live controller (one per page), used for teardown across client-side navigations. */
    __phosLightbox?: LightboxController
  }
}
