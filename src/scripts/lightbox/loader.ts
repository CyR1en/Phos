import type { CreateLoader, LightboxPhoto } from './types'

export const createLoader: CreateLoader = (ctx) => {
  const displayWidth = (photo: LightboxPhoto): number => {
    const { stage } = ctx.els
    const style = getComputedStyle(stage)
    const width = Math.max(0, stage.clientWidth
      - (parseFloat(style.paddingLeft) || 0)
      - (parseFloat(style.paddingRight) || 0))
    const height = Math.max(0, stage.clientHeight
      - (parseFloat(style.paddingTop) || 0)
      - (parseFloat(style.paddingBottom) || 0))

    if (!photo.width || !photo.height) return Math.round(width)
    return Math.round(Math.min(width, height * photo.width / photo.height, photo.width))
  }

  const fit = (img: HTMLImageElement, photo: LightboxPhoto): void => {
    if (photo.width && photo.height) {
      img.style.aspectRatio = `${photo.width} / ${photo.height}`
      img.style.width = `min(100cqw, 100cqh * ${photo.width / photo.height}, ${photo.width}px)`
    } else {
      img.style.aspectRatio = ''
      img.style.width = ''
    }
  }

  const setHdSource = (img: HTMLImageElement, photo: LightboxPhoto, sizes: string): void => {
    if (photo.srcset) {
      img.sizes = sizes
      img.srcset = photo.srcset
    } else if (photo.full) {
      img.src = photo.full
    }
  }

  const load = async (img: HTMLImageElement, photo: LightboxPhoto, token: number, firstPaintSrc?: string) => {
    const isCurrent = () => ctx.state.navToken === token
    if (!isCurrent()) return { hd: false, aborted: true }

    img.removeAttribute('srcset')
    img.removeAttribute('sizes')
    fit(img, photo)
    // Prefer a rendition the grid already decoded (2x/3x screens load the 1100w tier, not thumb).
    img.src = firstPaintSrc || photo.thumb
    img.alt = photo.description || (photo.titleIsAuto ? '' : photo.title)
      || `${photo.category ? photo.category + ' ' : ''}photograph`
    ctx.els.error.hidden = true

    const thumbShown = await img.decode().then(() => true, () => false)
    if (!isCurrent()) return { hd: false, aborted: true }

    const sizes = `${displayWidth(photo)}px`
    const hd = new Image()
    setHdSource(hd, photo, sizes)

    // The HD rendition decodes off-screen and is swapped in whenever it arrives, as long as this
    // request is still current. The thumb is usually cached from the grid, so the caller can start
    // its crossfade as soon as the thumb has painted instead of waiting for the HD download.
    const hdReady = hd.decode().then(() => {
      if (!isCurrent()) return false
      const currentWidth = parseFloat(img.sizes)
      setHdSource(img, photo, /^\d+(?:\.\d+)?px$/.test(img.sizes) && currentWidth > parseFloat(sizes)
        ? img.sizes : sizes)
      return true
    }, () => false)

    if (thumbShown) {
      void hdReady
      return { hd: false }
    }

    // Thumb failed: HD is the first paint. If that fails too, surface the error.
    const hdOk = await hdReady
    if (!isCurrent()) return { hd: false, aborted: true }
    if (!hdOk) {
      ctx.els.error.hidden = false
      throw new Error('lightbox: HD failed after the thumbnail failed')
    }
    return { hd: true }
  }

  const upgrade = async (img: HTMLImageElement, photo: LightboxPhoto, cssWidth: number): Promise<void> => {
    if (!photo.srcset) return

    const sizes = `${Math.ceil(cssWidth)}px`
    const hd = new Image()
    setHdSource(hd, photo, sizes)
    setHdSource(img, photo, sizes)
    await hd.decode().catch(() => {})
  }

  const preloadNeighbors = (index: number): void => {
    for (const neighbor of [index - 1, index + 1]) {
      const photo = ctx.state.photos[neighbor]
      if (!photo) continue
      new Image().src = photo.thumb
      setHdSource(new Image(), photo, `${displayWidth(photo)}px`)
    }
  }

  return { displayWidth, fit, load, upgrade, preloadNeighbors }
}
