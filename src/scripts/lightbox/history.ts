import { photoKey, type CreateHistory } from './types'

export const createHistory: CreateHistory = (ctx, deps) => {
  let controller: AbortController | null = null
  let active = false
  let page = location.pathname + location.search
  let pushed = false
  let closingViaBack = false

  const pageUrl = () => location.pathname + location.search
  const photoUrl = (key: string) => `${pageUrl()}#photo=${encodeURIComponent(key)}`

  const keyFromHash = (): string | null => {
    if (!location.hash.startsWith('#photo=')) return null

    try {
      return decodeURIComponent(location.hash.slice('#photo='.length))
    } catch {
      return null
    }
  }

  // Resolve against the current list: a filter can remove a historical photo.
  const indexForKey = (key: unknown): number | null => {
    if (typeof key !== 'string') return null

    const index = ctx.state.photos.findIndex(photo => photoKey(photo) === key)
    return index === -1 ? null : index
  }

  const onPopState = (event: PopStateEvent) => {
    if (closingViaBack) {
      closingViaBack = false
      active = false
      event.stopImmediatePropagation()
      return
    }

    const index = indexForKey(event.state?.phosLightbox)
    if (index !== null) {
      // Astro's window listener is non-capturing (router.js:413).
      event.stopImmediatePropagation()
      const reopening = !active
      active = true
      page = pageUrl()
      if (reopening || !ctx.state.open || ctx.state.index !== index) deps.openSilently(index)
      return
    }

    if (active) {
      active = false
      if (pageUrl() === page) event.stopImmediatePropagation()
      deps.closeSilently()
    }
  }

  return {
    onOpen() {
      const photo = ctx.state.photos[ctx.state.index]
      if (!photo || closingViaBack) return

      const key = photoKey(photo)
      active = true
      page = pageUrl()
      if (history.state?.phosLightbox === key) return

      // Adopt a direct hash without adding an identical URL to the stack.
      if (keyFromHash() === key) {
        history.replaceState({ ...history.state, phosLightbox: key }, '', photoUrl(key))
        pushed = false
        return
      }

      history.pushState({ ...history.state, phosLightbox: key }, '', photoUrl(key))
      pushed = true
    },

    onNavigate(index) {
      const photo = ctx.state.photos[index]
      if (!active || !ctx.state.open || !photo || closingViaBack) return

      const key = photoKey(photo)
      history.replaceState({ ...history.state, phosLightbox: key }, '', photoUrl(key))
    },

    onClose() {
      active = false
      if (closingViaBack) return

      if (pushed && indexForKey(history.state?.phosLightbox) !== null) {
        // The dialog is already closed; consume exactly the resulting traversal.
        closingViaBack = true
        history.back()
        return
      }

      pushed = false
      history.replaceState({ ...history.state, phosLightbox: undefined }, '', pageUrl())
    },

    indexFromHash() {
      return indexForKey(keyFromHash())
    },

    attach() {
      if (controller) return

      controller = new AbortController()
      window.addEventListener('popstate', onPopState, { capture: true, signal: controller.signal })
    },

    detach() {
      controller?.abort()
      controller = null
      active = false
      pushed = false
      closingViaBack = false
    }
  }
}
