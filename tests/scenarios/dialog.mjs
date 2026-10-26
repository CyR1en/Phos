import assert from 'node:assert/strict'
import { bundle } from '../helpers/bundle.mjs'

const { createDialog } = await bundle('src/scripts/lightbox/dialog.ts')

export function register(test) {
  class FakeEvent {
    constructor(type, options = {}) {
      Object.assign(
        this,
        {
          type,
          bubbles: false,
          cancelable: false,
          defaultPrevented: false,
          target: null,
          repeat: false,
          shiftKey: false
        },
        options
      )
    }
    preventDefault() {
      if (this.cancelable) this.defaultPrevented = true
    }
  }

  class FakeElement {
    constructor(tagName = 'div') {
      this.tagName = tagName.toUpperCase()
      this.parentNode = null
      this.children = []
      this.attributes = new Map()
      this.listeners = new Map()
      this.style = { overflow: '' }
      this.disabled = false
      this.hidden = false
      this.open = false
      const classes = new Set()
      this.classList = {
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        contains: (name) => classes.has(name)
      }
    }
    close() {
      this.open = false
    }
    getBoundingClientRect() {
      return this.rect ?? { left: 0, top: 0, right: 100, bottom: 100 }
    }
    scrollIntoView(options) {
      this.scrolled = options
    }
    get tabIndex() {
      const attr = this.getAttribute('tabindex')
      return attr === null
        ? ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A'].includes(this.tagName)
          ? 0
          : -1
        : Number(attr)
    }
    setAttribute(name, value) {
      this.attributes.set(name, value)
      if (name === 'open') this.open = true
    }
    getAttribute(name) {
      return this.attributes.get(name) ?? null
    }
    hasAttribute(name) {
      return this.attributes.has(name)
    }
    removeAttribute(name) {
      this.attributes.delete(name)
      if (name === 'open') this.open = false
    }
    append(...nodes) {
      for (const node of nodes) {
        node.parentNode = this
        this.children.push(node)
      }
    }
    remove() {
      if (this.parentNode?.children)
        this.parentNode.children = this.parentNode.children.filter((node) => node !== this)
      this.parentNode = null
    }
    focus() {
      if (this.disabled) return
      if (this.tabIndex < 0 && !this.hasAttribute('tabindex') && this.tagName !== 'DIALOG') return
      document.activeElement = this
    }
    matches(selector) {
      return selector === ':disabled' && this.disabled
    }
    closest() {
      let node = this
      while (node instanceof FakeElement) {
        if (node.hidden || node.hasAttribute('hidden') || node.hasAttribute('inert')) return node
        node = node.parentNode
      }
      return null
    }
    querySelectorAll() {
      const nodes = []
      const visit = (node) => {
        for (const child of node.children) {
          if (
            ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(child.tagName) ||
            child.hasAttribute('tabindex') ||
            (child.tagName === 'A' && child.hasAttribute('href'))
          )
            nodes.push(child)
          visit(child)
        }
      }
      visit(this)
      return nodes
    }
    addEventListener(type, handler, options = {}) {
      if (options.signal?.aborted) return
      const entries = this.listeners.get(type) ?? []
      if (entries.some((entry) => entry.handler === handler)) return
      entries.push({ handler, once: options.once })
      this.listeners.set(type, entries)
      options.signal?.addEventListener('abort', () => this.removeEventListener(type, handler), {
        once: true
      })
    }
    removeEventListener(type, handler) {
      this.listeners.set(
        type,
        (this.listeners.get(type) ?? []).filter((entry) => entry.handler !== handler)
      )
    }
    dispatchEvent(event) {
      if (!event.target) event.target = this
      event.currentTarget = this
      for (const entry of [...(this.listeners.get(event.type) ?? [])]) {
        if (entry.once) this.removeEventListener(event.type, entry.handler)
        entry.handler(event)
      }
      if (event.bubbles && this.parentNode instanceof FakeElement)
        this.parentNode.dispatchEvent(event)
      return !event.defaultPrevented
    }
  }

  function setup(options = {}) {
    globalThis.HTMLElement = FakeElement
    const timers = new Map()
    const frames = new Map()
    let serial = 0
    const clock = { now: 0 }
    const stats = {
      shown: 0,
      closed: 0,
      onClosed: 0,
      cancelCalls: 0,
      arrows: [],
      handled: false,
      reduced: false
    }
    const body = new FakeElement('body')
    body.style.overflow = 'scroll'
    const doc = Object.assign(new FakeElement('document'), {
      body,
      activeElement: body,
      contains(node) {
        for (let current = node; current; current = current.parentNode)
          if (current === this) return true
        return false
      }
    })
    body.parentNode = doc
    globalThis.document = doc
    globalThis.window = {
      innerWidth: 1024,
      innerHeight: 768,
      setTimeout(callback, duration) {
        const id = ++serial
        timers.set(id, { callback, due: clock.now + duration })
        return id
      },
      clearTimeout(id) {
        timers.delete(id)
      },
      requestAnimationFrame(callback) {
        const id = ++serial
        frames.set(id, callback)
        return id
      },
      cancelAnimationFrame(id) {
        frames.delete(id)
      }
    }
    Object.defineProperty(globalThis, 'performance', {
      value: { now: () => clock.now },
      configurable: true
    })
    const root = new FakeElement('dialog')
    const stage = new FakeElement()
    const closeBtn = new FakeElement('button')
    const prevBtn = new FakeElement('button')
    const nextBtn = new FakeElement('button')
    const zoomBtn = new FakeElement('button')
    const img = new FakeElement('img')
    const caption = new FakeElement()
    const opener = new FakeElement('a')
    const tile = new FakeElement('a')
    stage.append(img)
    root.append(stage, closeBtn, prevBtn, nextBtn, zoomBtn, caption)
    body.append(root, opener, tile)
    root.showModal = () => {
      stats.shown++
      root.open = true
      nextBtn.focus()
    }
    root.close = () => {
      stats.closed++
      root.open = false
      const event = new FakeEvent('close')
      if (options.queuedClose) window.setTimeout(() => root.dispatchEvent(event), 0)
      else root.dispatchEvent(event)
    }
    const state = {
      photos: [],
      index: 2,
      open: false,
      zoomed: false,
      navToken: 0,
      front: 0,
      opener: null,
      suppressClickUntil: 0
    }
    const ctx = {
      els: { root, stage, closeBtn, prevBtn, nextBtn, zoomBtn },
      state,
      reducedMotion: () => stats.reduced,
      tileFor: (index) => {
        assert.equal(index, 2)
        return tile
      }
    }
    const dialog = createDialog(ctx, {
      onCancel() {
        stats.cancelCalls++
        return stats.handled
      },
      onArrow(dir) {
        stats.arrows.push(dir)
      },
      ...(options.onRequestClose ? { onRequestClose: options.onRequestClose } : {}),
      onClosed() {
        stats.onClosed++
        assert.equal(state.open, false)
        assert.notEqual(document.activeElement, root)
      }
    })
    dialog.attach()
    function advance(duration) {
      const end = clock.now + duration
      while (true) {
        const entry = [...timers]
          .filter(([, timer]) => timer.due <= end)
          .sort((a, b) => a[1].due - b[1].due)[0]
        if (!entry) break
        timers.delete(entry[0])
        clock.now = entry[1].due
        entry[1].callback()
      }
      clock.now = end
    }
    function frame() {
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach((callback) => callback(clock.now))
    }
    function event(target, type, options = {}) {
      const e = new FakeEvent(type, { bubbles: true, cancelable: true, ...options })
      target.dispatchEvent(e)
      return e
    }
    return {
      root,
      stage,
      closeBtn,
      prevBtn,
      nextBtn,
      zoomBtn,
      img,
      caption,
      opener,
      tile,
      state,
      stats,
      dialog,
      advance,
      frame,
      event,
      frames,
      timers
    }
  }

  const cases = [
    [
      'open uses showModal, locks scroll, focuses next frame, and clears only root enter animation',
      () => {
        const e = setup()
        e.dialog.open(e.opener)
        assert.equal(e.stats.shown, 1)
        assert.equal(document.body.style.overflow, 'hidden')
        assert.equal(e.state.open, true)
        assert.equal(e.dialog.isOpen(), true)
        assert.equal(document.activeElement, e.nextBtn)
        assert(e.root.classList.contains('lightbox-enter'))
        e.frame()
        assert.equal(document.activeElement, e.closeBtn)
        e.event(e.img, 'animationend')
        assert(e.root.classList.contains('lightbox-enter'))
        e.event(e.root, 'animationend')
        assert(!e.root.classList.contains('lightbox-enter'))
        e.dialog.open(e.tile)
        assert.equal(e.state.opener, e.tile)
        assert.equal(e.stats.shown, 1)
        e.dialog.detach()
      }
    ],
    [
      'Escape prevents native cancel, animates exit, restores focus/overflow, and closes once',
      () => {
        const e = setup()
        e.dialog.open(e.opener)
        e.frame()
        const cancel = e.event(e.root, 'cancel')
        assert(cancel.defaultPrevented)
        assert.equal(e.stats.cancelCalls, 1)
        assert(e.root.classList.contains('lightbox-exit'))
        assert(!e.root.classList.contains('lightbox-enter'))
        assert.equal(e.stats.closed, 0)
        e.dialog.close()
        e.event(e.img, 'animationend')
        assert.equal(e.stats.closed, 0)
        e.event(e.root, 'animationend')
        assert.equal(e.stats.closed, 1)
        assert.equal(document.body.style.overflow, 'scroll')
        assert.equal(e.state.open, false)
        assert.equal(document.activeElement, e.tile)
        assert.equal(e.stats.onClosed, 1)
        assert(!e.root.classList.contains('lightbox-exit'))
        e.advance(1000)
        e.event(e.root, 'close')
        e.dialog.close()
        e.dialog.detach()
        assert.equal(e.stats.onClosed, 1)
      }
    ],
    [
      'handled Escape stays open',
      () => {
        const e = setup()
        e.stats.handled = true
        e.dialog.open(e.opener)
        assert(e.event(e.root, 'cancel').defaultPrevented)
        e.advance(500)
        assert(e.root.open)
        assert.equal(e.stats.closed, 0)
        assert.equal(e.stats.onClosed, 0)
        e.dialog.detach()
      }
    ],
    [
      'held arrows are prevented and throttled to 150ms while distinct presses remain responsive',
      () => {
        const e = setup()
        e.dialog.open(e.opener)
        assert(e.event(e.root, 'keydown', { key: 'ArrowRight' }).defaultPrevented)
        for (let i = 0; i < 10; i++) {
          e.advance(10)
          assert(e.event(e.root, 'keydown', { key: 'ArrowRight', repeat: true }).defaultPrevented)
        }
        assert.deepEqual(e.stats.arrows, [1])
        e.advance(50)
        e.event(e.root, 'keydown', { key: 'ArrowRight', repeat: true })
        e.event(e.root, 'keydown', { key: 'ArrowLeft' })
        assert.deepEqual(e.stats.arrows, [1, 1, -1])
        e.dialog.detach()
      }
    ],
    [
      'stage click dismisses, while image, caption, and other buttons do not',
      () => {
        const e = setup()
        e.dialog.open(e.opener)
        for (const target of [e.img, e.caption, e.nextBtn]) e.event(target, 'click')
        assert(!e.root.classList.contains('lightbox-exit'))
        e.event(e.stage, 'pointerdown')
        e.event(e.stage, 'click')
        assert(e.root.classList.contains('lightbox-exit'))
        e.advance(249)
        assert(e.root.open)
        e.advance(1)
        assert(!e.root.open)
        assert.equal(e.stats.onClosed, 1)
      }
    ],
    [
      'root backdrop and close-button child clicks dismiss',
      () => {
        for (const button of [false, true]) {
          const e = setup()
          e.dialog.open(e.opener)
          const icon = new FakeElement('svg')
          e.closeBtn.append(icon)
          e.event(button ? icon : e.root, 'pointerdown')
          e.event(button ? icon : e.root, 'click')
          e.advance(250)
          assert(!e.root.open)
          assert.equal(e.stats.onClosed, 1)
        }
      }
    ],
    [
      'detach immediately cleans up, cancels pending work, aborts listeners, and is idempotent',
      () => {
        const e = setup()
        e.dialog.open(e.opener)
        e.dialog.close()
        e.dialog.detach()
        assert(!e.root.open)
        assert.equal(document.body.style.overflow, 'scroll')
        assert.equal(document.activeElement, e.tile)
        assert.equal(e.frames.size, 0)
        assert.equal(e.timers.size, 0)
        assert(!e.event(e.root, 'cancel').defaultPrevented)
        e.dialog.detach()
        e.frame()
        e.advance(1000)
        assert.equal(e.stats.onClosed, 1)
        e.dialog.attach()
        e.dialog.attach()
        e.dialog.open(e.opener)
        e.event(e.root, 'cancel')
        e.advance(250)
        assert.equal(e.stats.cancelCalls, 1)
        assert.equal(e.stats.onClosed, 2)
      }
    ],
    [
      'removed opener returns focus to current tile, then to body if no tile is connected',
      () => {
        for (const removeTile of [false, true]) {
          const e = setup()
          e.dialog.open(e.opener)
          e.opener.remove()
          if (removeTile) e.tile.remove()
          e.stats.reduced = true
          e.dialog.close()
          assert.equal(document.activeElement, removeTile ? document.body : e.tile)
          assert(!document.body.hasAttribute('tabindex'))
          assert.equal(e.stats.onClosed, 1)
        }
      }
    ],
    [
      'native close immediately restores resources exactly once',
      () => {
        const e = setup()
        e.dialog.open(e.opener)
        e.root.close()
        assert.equal(e.stats.closed, 1)
        assert.equal(e.stats.onClosed, 1)
        assert.equal(document.body.style.overflow, 'scroll')
        assert.equal(document.activeElement, e.tile)
        e.dialog.detach()
        assert.equal(e.stats.onClosed, 1)
      }
    ],
    [
      'enter timeout clears at 300ms and reduced motion closes synchronously',
      () => {
        const e = setup()
        e.dialog.open(e.opener)
        e.advance(299)
        assert(e.root.classList.contains('lightbox-enter'))
        e.advance(1)
        assert(!e.root.classList.contains('lightbox-enter'))
        e.stats.reduced = true
        e.dialog.close()
        assert.equal(e.stats.closed, 1)
        assert.equal(e.stats.onClosed, 1)
        assert.equal(e.timers.size, 0)
        assert.equal(e.frames.size, 0)
      }
    ],
    [
      'disabled arrow focusout uses its enabled sibling, with no Tab trap in native path',
      () => {
        const e = setup()
        e.dialog.open(e.opener)
        e.frame()
        e.nextBtn.focus()
        e.nextBtn.disabled = true
        e.event(e.nextBtn, 'focusout')
        e.frame()
        assert.equal(document.activeElement, e.prevBtn)
        e.zoomBtn.focus()
        assert(!e.event(e.zoomBtn, 'keydown', { key: 'Tab' }).defaultPrevented)
        e.dialog.detach()
      }
    ],
    [
      'fallback sets/restores aria-modal, traps enabled controls, handles Escape, and needs no close method',
      () => {
        const e = setup()
        e.root.showModal = undefined
        e.root.close = undefined
        e.root.setAttribute('aria-modal', 'false')
        e.prevBtn.disabled = true
        e.dialog.open(e.opener)
        assert(e.root.open)
        assert.equal(e.root.getAttribute('aria-modal'), 'true')
        assert.equal(e.stats.shown, 0)
        e.frame()
        e.zoomBtn.focus()
        assert(e.event(e.zoomBtn, 'keydown', { key: 'Tab' }).defaultPrevented)
        assert.equal(document.activeElement, e.closeBtn)
        assert(e.event(e.closeBtn, 'keydown', { key: 'Tab', shiftKey: true }).defaultPrevented)
        assert.equal(document.activeElement, e.zoomBtn)
        e.closeBtn.focus()
        assert(!e.event(e.closeBtn, 'keydown', { key: 'Tab' }).defaultPrevented)
        e.stats.reduced = true
        assert(e.event(e.root, 'keydown', { key: 'Escape' }).defaultPrevented)
        assert(!e.root.open)
        assert.equal(e.root.getAttribute('aria-modal'), 'false')
        assert.equal(document.body.style.overflow, 'scroll')
        assert.equal(e.stats.onClosed, 1)
      }
    ],
    [
      'queued native close from an old session cannot close a reopened dialog',
      () => {
        const e = setup({ queuedClose: true })
        e.dialog.open(e.opener)
        e.root.close()
        e.dialog.open(e.tile)
        assert.equal(e.stats.onClosed, 1)
        e.advance(0)
        assert(e.root.open)
        assert.equal(e.stats.onClosed, 1)
        assert.equal(document.body.style.overflow, 'hidden')
        e.dialog.detach()
        e.advance(0)
        assert.equal(e.stats.onClosed, 2)
      }
    ],
    [
      'legacy nonfocusable tiles receive temporary tabindex',
      () => {
        const e = setup()
        const opener = new FakeElement()
        document.body.append(opener)
        e.tile.remove()
        e.dialog.open(opener)
        e.stats.reduced = true
        e.dialog.close()
        assert.equal(document.activeElement, opener)
        assert(!opener.hasAttribute('tabindex'))
        assert.equal(e.stats.onClosed, 1)
      }
    ]
  ]

  cases.push(
    [
      'document arrows work from body only while open and abort on detach',
      () => {
        const e = setup()
        assert(!e.event(document.body, 'keydown', { key: 'ArrowRight' }).defaultPrevented)
        e.dialog.open(e.opener)
        document.activeElement = document.body
        assert(e.event(document.body, 'keydown', { key: 'ArrowRight' }).defaultPrevented)
        assert.deepEqual(e.stats.arrows, [1])
        e.dialog.close({ immediate: true })
        e.event(document.body, 'keydown', { key: 'ArrowLeft' })
        assert.deepEqual(e.stats.arrows, [1])
        e.dialog.detach()
        assert.equal(document.listeners.get('keydown').length, 0)
      }
    ],
    [
      'immediate open and close skip class animations and timers',
      () => {
        const e = setup()
        e.dialog.open(e.opener, { immediate: true })
        assert(!e.root.classList.contains('lightbox-enter'))
        assert.equal(e.timers.size, 0)
        e.frame()
        assert.equal(document.activeElement, e.closeBtn)
        e.dialog.close({ immediate: true })
        assert(!e.root.open)
        assert(!e.root.classList.contains('lightbox-exit'))
        assert.equal(e.timers.size, 0)
        assert.equal(e.stats.onClosed, 1)
      }
    ],
    [
      'reopen cancels exit timers and animation waits without unlocking scroll',
      () => {
        const e = setup()
        e.dialog.open(e.opener)
        e.dialog.close()
        assert(e.root.classList.contains('lightbox-exit'))
        e.dialog.open(e.tile, { immediate: true })
        assert(e.root.open)
        assert(!e.root.classList.contains('lightbox-exit'))
        assert.equal(e.timers.size, 0)
        e.event(e.root, 'animationend')
        e.advance(1000)
        assert(e.root.open)
        assert.equal(e.stats.onClosed, 0)
        assert.equal(e.stats.shown, 1)
        assert.equal(document.body.style.overflow, 'hidden')
        e.dialog.close()
        e.dialog.close({ immediate: true })
        assert.equal(e.stats.onClosed, 1)
        assert.equal(e.timers.size, 0)
      }
    ],
    [
      'backdrop clicks require backdrop press, respect drag suppression, and reset after every click',
      () => {
        const e = setup()
        e.dialog.open(e.opener)
        e.event(e.img, 'pointerdown')
        e.event(e.stage, 'click')
        assert.equal(e.stats.cancelCalls, 0)
        e.event(e.stage, 'pointerdown')
        e.state.suppressClickUntil = 100
        e.event(e.stage, 'click')
        assert.equal(e.stats.cancelCalls, 0)
        e.advance(100)
        e.event(e.stage, 'click')
        assert.equal(e.stats.cancelCalls, 0)
        e.event(e.stage, 'pointerdown')
        e.event(e.stage, 'click')
        assert.equal(e.stats.cancelCalls, 1)
        e.advance(250)
        assert(!e.root.open)
      }
    ],
    [
      'focus follows current tile and scrolls it into view before focusing',
      () => {
        const e = setup()
        e.tile.rect = { top: 900, bottom: 1000, left: 0, right: 100 }
        const focus = e.tile.focus.bind(e.tile)
        e.tile.focus = () => {
          assert.deepEqual(e.tile.scrolled, { block: 'nearest' })
          focus()
        }
        e.dialog.open(e.opener)
        e.dialog.close({ immediate: true })
        assert.equal(document.activeElement, e.tile)
      }
    ],
    [
      'disabled arrow observer handles no-blur browsers; both disabled fall back to close',
      () => {
        const observers = []
        globalThis.MutationObserver = class {
          constructor(callback) {
            this.callback = callback
            this.targets = []
            observers.push(this)
          }
          observe(target) {
            this.targets.push(target)
          }
          disconnect() {
            this.disconnected = true
          }
        }
        try {
          const e = setup()
          e.dialog.open(e.opener)
          e.frame()
          assert.deepEqual(observers[0].targets, [e.prevBtn, e.nextBtn])
          e.nextBtn.focus()
          e.nextBtn.disabled = true
          observers[0].callback()
          e.frame()
          assert.equal(document.activeElement, e.prevBtn)
          e.prevBtn.disabled = true
          e.event(e.prevBtn, 'focusout')
          e.frame()
          assert.equal(document.activeElement, e.closeBtn)
          e.dialog.detach()
          assert(observers[0].disconnected)
        } finally {
          delete globalThis.MutationObserver
        }
      }
    ],
    [
      'close button delegates the full close path',
      () => {
        let requests = 0
        const e = setup({
          onRequestClose: () => {
            requests++
          }
        })
        e.dialog.open(e.opener)
        e.event(e.closeBtn, 'click')
        assert.equal(requests, 1)
        assert.equal(e.stats.cancelCalls, 0)
        assert(e.root.open)
        e.dialog.detach()
      }
    ]
  )

  for (const [name, run] of cases) test(name, run)
}
