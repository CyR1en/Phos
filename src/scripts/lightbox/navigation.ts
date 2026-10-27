import { photoKey, type CreateNavigation } from './types'
import { easing } from '../motion'

export const createNavigation: CreateNavigation = (ctx, deps) => {
  let finishCrossfade: (() => void) | null = null
  let lastAnnouncement = ''

  const clearLayer = (layer: HTMLImageElement): void => {
    layer.removeAttribute('src')
    layer.removeAttribute('srcset')
    layer.removeAttribute('sizes')
    layer.removeAttribute('data-swiped-out')
    layer.alt = ''
    layer.style.width = ''
    layer.style.aspectRatio = ''
    layer.style.opacity = ''
    layer.style.transform = ''
  }

  const updateCaption = (): string => {
    const { photos, index } = ctx.state
    const photo = photos[index]
    const authored = photo && !photo.titleIsAuto ? photo.title : ''
    const description = photo?.description || ''

    ctx.els.title.textContent = authored
    ctx.els.title.hidden = !authored
    ctx.els.description.textContent = description
    ctx.els.description.hidden = !description
    ctx.els.counter.textContent = `${photo ? index + 1 : 0} / ${photos.length}`
    ctx.els.prevBtn.disabled = !photo || index === 0
    ctx.els.nextBtn.disabled = !photo || index === photos.length - 1
    return photo
      ? `Photo ${index + 1} of ${photos.length}${authored ? ', ' + authored : ''}`
      : 'No photos'
  }

  const writeAnnouncement = (message: string): void => {
    if (message === lastAnnouncement && ctx.els.live.textContent === message) return
    ctx.els.live.textContent = message
    lastAnnouncement = message
  }

  const announce = (): void => writeAnnouncement(updateCaption())

  const show: ReturnType<CreateNavigation>['show'] = async (index, dir, opts = {}) => {
    // Commit the painted incoming photo before reusing either layer for another request.
    finishCrossfade?.()
    const photo = ctx.state.photos[index]
    if (!photo) return

    const token = ++ctx.state.navToken
    deps.beforeShow()
    const incoming = ctx.backLayer()
    const outgoing = ctx.frontLayer()
    ctx.state.index = index
    updateCaption()

    try {
      const result = await deps.loader.load(incoming, photo, token, opts.firstPaintSrc)
      if (result.aborted || ctx.state.navToken !== token) return
    } catch {
      if (ctx.state.navToken !== token) return
      // Retain the outgoing photo, but identify and announce the photo that failed to load.
      ctx.els.root.dataset.error = ''
      updateCaption()
      writeAnnouncement(`Photo ${index + 1} of ${ctx.state.photos.length} couldn't be loaded`)
      return
    }

    delete ctx.els.root.dataset.error
    const animations: Animation[] = []
    const finish = (): void => {
      if (finishCrossfade === finish) finishCrossfade = null
      const current = ctx.state.navToken === token
      if (current) ctx.swapLayers()
      for (const animation of animations) animation.cancel()
      if (!current) return
      incoming.style.opacity = ''
      incoming.style.transform = ''
      clearLayer(outgoing)
      announce()
      deps.loader.preloadNeighbors(index)
      deps.afterShow(index)
    }

    const swipedOut = outgoing.dataset.swipedOut !== undefined
      || parseFloat(getComputedStyle(outgoing).opacity) === 0
    if (swipedOut) {
      clearLayer(outgoing)
      outgoing.style.opacity = '0'
    }

    if (!opts.instant && !ctx.reducedMotion()
      && typeof incoming.animate === 'function'
      && typeof outgoing.animate === 'function') {
      const entering = incoming.animate(dir === 0
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ opacity: 0, transform: `translateX(${dir * 24}px)` }, { opacity: 1, transform: 'none' }], {
        duration: 320,
        easing: easing('out-expo'),
        fill: 'forwards',
      })
      animations.push(entering)
      if (!swipedOut) {
        animations.push(outgoing.animate(dir === 0
          ? [{ opacity: 1 }, { opacity: 0 }]
          : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * 24}px)` }], {
          duration: 220,
          easing: easing('exit'),
          fill: 'forwards',
        }))
      }
      finishCrossfade = finish
      await Promise.all(animations.map(animation => animation.finished.catch(() => {})))
      if (finishCrossfade !== finish) return
    }

    finish()
  }

  const canNext = (): boolean => ctx.state.index < ctx.state.photos.length - 1
  const canPrev = (): boolean => ctx.state.index > 0 && ctx.state.index < ctx.state.photos.length
  const next = (): void => {
    if (canNext()) void show(ctx.state.index + 1, 1)
  }
  const prev = (): void => {
    if (canPrev()) void show(ctx.state.index - 1, -1)
  }

  const setPhotos: ReturnType<CreateNavigation>['setPhotos'] = (photos) => {
    finishCrossfade?.()
    const current = ctx.current()
    const key = current ? photoKey(current) : null
    const found = key === null ? -1 : photos.findIndex(photo => photoKey(photo) === key)
    ctx.state.photos = photos
    ctx.state.index = found >= 0 ? found : 0
    if (ctx.state.open && photos.length) {
      void show(ctx.state.index, 0, { instant: true })
    } else {
      // An empty list or a closed filter reset must also invalidate pending loads.
      ctx.state.navToken++
      if (ctx.state.open) announce()
    }
  }

  return { show, next, prev, canNext, canPrev, announce, setPhotos }
}
