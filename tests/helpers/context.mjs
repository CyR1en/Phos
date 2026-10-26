import { makeWorld } from './world.mjs'
import { bundle } from './bundle.mjs'

const { createLoader } = await bundle('src/scripts/lightbox/loader.ts')
const { createNavigation } = await bundle('src/scripts/lightbox/navigation.ts')

export function fixture(opts = {}) {
  const w = makeWorld(opts)
  const ids = {
    stage: 'stage',
    error: 'error',
    title: 'title',
    description: 'description',
    counter: 'counter',
    live: 'live',
    closeBtn: 'close',
    prevBtn: 'prev',
    nextBtn: 'next',
    zoomBtn: 'zoom',
    data: 'data'
  }
  const layers = [w.$('lightbox-img-a'), w.$('lightbox-img-b')]
  const els = { root: w.root, layers }
  for (const [name, id] of Object.entries(ids)) els[name] = w.$('lightbox-' + id)
  const state = {
    photos: w.photos,
    index: 0,
    open: true,
    zoomed: false,
    navToken: 0,
    front: 0,
    opener: null,
    suppressClickUntil: 0
  }
  const ctx = {
    els,
    state,
    reducedMotion: () => w.W.reducedMotion,
    finePointer: () => w.W.finePointer,
    frontLayer: () => layers[state.front],
    backLayer: () => layers[1 - state.front],
    current: () => state.photos[state.index] || null,
    tileFor: (i) => w.tiles[i] || null,
    swapLayers() {
      state.front = 1 - state.front
      this.frontLayer().dataset.layer = 'front'
      this.frontLayer().removeAttribute('aria-hidden')
      this.backLayer().dataset.layer = 'back'
      this.backLayer().setAttribute('aria-hidden', 'true')
      this.backLayer().alt = ''
    }
  }
  layers[0].dataset.layer = 'front'
  layers[1].dataset.layer = 'back'
  layers[0].src = state.photos[0].thumb
  const loader = createLoader(ctx)
  const after = []
  const nav = createNavigation(ctx, { loader, beforeShow() {}, afterShow: (i) => after.push(i) })
  return { w, ctx, loader, nav, after }
}
