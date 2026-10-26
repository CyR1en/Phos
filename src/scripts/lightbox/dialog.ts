import type { CreateDialog } from './types'

export const createDialog: CreateDialog = (ctx, deps) => {
  const { root, stage, closeBtn, prevBtn, nextBtn } = ctx.els
  const { state } = ctx
  let controller: AbortController | null = null
  let active = false
  let closing = false
  let fallback = false
  let previousAriaModal: string | null = null
  let lockedBody: HTMLElement | null = null
  let previousOverflow = ''
  let focusFrame: number | null = null
  let cancelEnter: (() => void) | null = null
  let cancelExit: (() => void) | null = null
  let lastArrowAt = -Infinity
  let downOnBackdrop = false
  let controlsObserver: MutationObserver | null = null

  function waitForAnimation(duration: number, done: () => void): () => void {
    let pending = true
    const timer = window.setTimeout(finish, duration)

    function cancel() {
      pending = false
      window.clearTimeout(timer)
      root.removeEventListener('animationend', onAnimationEnd)
    }

    function finish() {
      if (!pending) return
      cancel()
      done()
    }

    function onAnimationEnd(event: Event) {
      if (event.target === root) finish()
    }

    root.addEventListener('animationend', onAnimationEnd)
    return cancel
  }

  function cancelFocus() {
    if (focusFrame !== null) window.cancelAnimationFrame(focusFrame)
    focusFrame = null
  }

  function focusCloseNextFrame() {
    cancelFocus()
    focusFrame = window.requestAnimationFrame(() => {
      focusFrame = null
      if (root.open && !closing) closeBtn.focus({ preventScroll: true })
    })
  }

  function focusAfterDisabled(control: HTMLElement) {
    cancelFocus()
    focusFrame = window.requestAnimationFrame(() => {
      focusFrame = null
      if (!root.open || closing) return
      const other = control === prevBtn ? nextBtn : control === nextBtn ? prevBtn : null
      const target = other && !other.disabled ? other : closeBtn
      target.focus({ preventScroll: true })
    })
  }

  function clearAnimations() {
    cancelEnter?.()
    cancelExit?.()
    cancelEnter = null
    cancelExit = null
    root.classList.remove('lightbox-enter', 'lightbox-exit')
  }

  function returnFocus() {
    const opener = state.opener
    const tile = ctx.tileFor(state.index)
    const target = tile && document.contains(tile) ? tile
      : opener && document.contains(opener) ? opener : document.body
    if (target !== document.body) {
      const rect = target.getBoundingClientRect()
      if (rect.top < 0 || rect.left < 0 || rect.bottom > window.innerHeight || rect.right > window.innerWidth) {
        target.scrollIntoView({ block: 'nearest' })
      }
    }
    // Body and legacy div tiles need a temporary tabindex to accept programmatic focus.
    const addTabIndex = target.tabIndex < 0 && !target.hasAttribute('tabindex')
    if (addTabIndex) target.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })
    if (addTabIndex) target.removeAttribute('tabindex')
  }

  function finishClose() {
    if (!active && !root.open) return
    // Clear ownership before close(), which can dispatch a synchronous close event.
    active = false
    closing = false
    downOnBackdrop = false
    cancelFocus()
    clearAnimations()
    if (root.open) {
      if (typeof root.close === 'function') root.close()
      else root.removeAttribute('open')
    }
    if (fallback) {
      if (previousAriaModal === null) root.removeAttribute('aria-modal')
      else root.setAttribute('aria-modal', previousAriaModal)
      fallback = false
    }
    if (lockedBody) lockedBody.style.overflow = previousOverflow
    lockedBody = null
    window.__lenis?.start()
    state.open = false
    returnFocus()
    deps.onClosed()
  }

  function open(opener: HTMLElement | null, { immediate = false }: { immediate?: boolean } = {}) {
    state.opener = opener
    if (root.open) {
      if (closing) {
        closing = false
        clearAnimations()
        lastArrowAt = -Infinity
        downOnBackdrop = false
        state.open = true
        focusCloseNextFrame()
      } else if (immediate) clearAnimations()
      return
    }
    // A native close event may still be queued when a new open arrives.
    if (active) finishClose()
    fallback = typeof root.showModal !== 'function'
    if (fallback) {
      previousAriaModal = root.getAttribute('aria-modal')
      root.setAttribute('open', '')
      root.setAttribute('aria-modal', 'true')
    } else {
      root.showModal()
    }
    active = true
    lockedBody = document.body
    previousOverflow = lockedBody.style.overflow
    lockedBody.style.overflow = 'hidden'
    window.__lenis?.stop()
    lastArrowAt = -Infinity
    downOnBackdrop = false
    clearAnimations()
    if (!immediate) {
      root.classList.add('lightbox-enter')
      cancelEnter = waitForAnimation(300, () => {
        cancelEnter = null
        root.classList.remove('lightbox-enter')
      })
    }
    focusCloseNextFrame()
    state.open = true
  }

  function close({ immediate = false }: { immediate?: boolean } = {}) {
    if (!root.open || (closing && !immediate)) return
    closing = true
    cancelFocus()
    clearAnimations()
    if (immediate || ctx.reducedMotion()) finishClose()
    else {
      root.classList.add('lightbox-exit')
      cancelExit = waitForAnimation(250, finishClose)
    }
  }

  function trapFallbackTab(event: KeyboardEvent) {
    const controls = Array.from(root.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, [tabindex]',
    )).filter((el) => el.tabIndex >= 0 && !el.matches(':disabled') && !el.closest('[hidden], [inert]'))
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (!first || !last) {
      event.preventDefault()
      closeBtn.focus({ preventScroll: true })
      return
    }
    const focused = document.activeElement
    const outsideControls = !controls.some((control) => control === focused)
    if (outsideControls || (event.shiftKey ? focused === first : focused === last)) {
      event.preventDefault()
      const target = event.shiftKey ? last : first
      target.focus({ preventScroll: true })
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!root.open || closing) return
    if (fallback && event.key === 'Tab') {
      trapFallbackTab(event)
      return
    }
    if (fallback && event.key === 'Escape') {
      event.preventDefault()
      if (!deps.onCancel()) close()
      return
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const now = performance.now()
    if (event.repeat && now - lastArrowAt < 150) return
    lastArrowAt = now
    deps.onArrow(event.key === 'ArrowLeft' ? -1 : 1)
  }

  function attach() {
    if (controller) return
    controller = new AbortController()
    const { signal } = controller
    root.addEventListener('cancel', (event) => {
      if (!event.cancelable) {
        // The UA is closing the dialog regardless (no user activation to consume): skip the exit
        // animation and the reverse morph; the native 'close' event drives finishClose() → onClosed().
        closing = true
        return
      }
      event.preventDefault()
      if (root.open && !closing && !deps.onCancel()) close()
    }, { signal })
    document.addEventListener('keydown', onKeyDown, { signal })
    root.addEventListener('close', () => {
      if (!root.open) finishClose()
    }, { signal })
    root.addEventListener('pointerdown', (event) => {
      downOnBackdrop = event.target === root || event.target === stage
    }, { signal, capture: true })
    root.addEventListener('click', (event) => {
      const startedOnBackdrop = downOnBackdrop
      downOnBackdrop = false
      if (!startedOnBackdrop || performance.now() < (state.suppressClickUntil ?? 0)) return
      if (event.target !== root && event.target !== stage) return
      if (root.open && !closing && !deps.onCancel()) close()
    }, { signal })
    root.addEventListener('focusout', (event) => {
      if (root.open && !closing && event.target instanceof HTMLElement && event.target.matches(':disabled')) {
        focusAfterDisabled(event.target)
      }
    }, { signal })
    if (typeof MutationObserver === 'function') {
      controlsObserver = new MutationObserver(() => {
        const focused = document.activeElement
        if (focused === prevBtn && prevBtn.disabled) focusAfterDisabled(prevBtn)
        else if (focused === nextBtn && nextBtn.disabled) focusAfterDisabled(nextBtn)
      })
      controlsObserver.observe(prevBtn, { attributes: true, attributeFilter: ['disabled'] })
      controlsObserver.observe(nextBtn, { attributes: true, attributeFilter: ['disabled'] })
    }
    closeBtn.addEventListener('click', () => {
      if (!root.open || closing) return
      if (deps.onRequestClose) deps.onRequestClose()
      else close()
    }, { signal })
  }

  function detach() {
    controller?.abort()
    controller = null
    controlsObserver?.disconnect()
    controlsObserver = null
    finishClose()
    cancelFocus()
    clearAnimations()
  }

  return { open, close, isOpen: () => root.open, attach, detach }
}
