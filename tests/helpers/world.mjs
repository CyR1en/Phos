// Minimal DOM, history, WAAPI and View Transition model for lightbox regressions.
// advance(ms) moves a deterministic clock; it never waits for real animation time.
import { bundle } from './bundle.mjs'
const realSetImmediate = setImmediate
export const flush = async (n = 3) => {
  for (let i = 0; i < n; i++) await new Promise((r) => realSetImmediate(r))
}

const worlds = []

export function makeWorld(opts = {}) {
  const W = {
    now: 1000,
    timers: [],
    timerId: 0,
    rafs: new Map(),
    rafId: 0,
    lastFrame: 1000,
    animations: [],
    decodes: [],
    log: [],
    suppressed: false,
    reducedMotion: !!opts.reducedMotion,
    finePointer: opts.finePointer ?? true,
    freezeDuringVT: !!opts.freezeDuringVT,
    decodeMode: opts.decodeMode || 'auto',
    failUrls: new Set(),
    vt: opts.vt ?? true,
    vtLog: [],
    touchClickModel: opts.touchClickModel || 'hit',
    captures: new Map()
  }
  const log = (...a) => W.log.push(a.join(' '))

  /* ------------------------------ events ------------------------------ */
  class Target {
    constructor() {
      this._l = []
    }
    addEventListener(type, cb, o = {}) {
      if (!cb) return
      const capture = typeof o === 'boolean' ? o : !!o?.capture
      if (o?.signal?.aborted) return
      if (
        this._l.some((l) => !l.removed && l.type === type && l.cb === cb && l.capture === capture)
      )
        return
      const l = { type, cb, capture, once: !!o?.once, removed: false }
      this._l.push(l)
      o?.signal?.addEventListener('abort', () => this.removeEventListener(type, cb, capture), {
        once: true
      })
    }
    removeEventListener(type, cb, o = {}) {
      const capture = typeof o === 'boolean' ? o : !!o?.capture
      for (const l of this._l)
        if (!l.removed && l.type === type && l.cb === cb && l.capture === capture) l.removed = true
      this._l = this._l.filter((l) => !l.removed)
    }
    count(type, capture) {
      return this._l.filter(
        (l) => !l.removed && l.type === type && (capture === undefined || l.capture === capture)
      ).length
    }
    dispatchEvent(ev) {
      return dispatch(this, ev.type, ev)
    }
  }
  function invoke(node, ev, capture) {
    ev.currentTarget = node
    for (const l of [...node._l]) {
      if (l.removed || l.type !== ev.type || l.capture !== capture) continue
      if (l.once) node.removeEventListener(l.type, l.cb, l.capture)
      typeof l.cb === 'function' ? l.cb.call(node, ev) : l.cb.handleEvent(ev)
      if (ev._stopImm) break
    }
  }
  function dispatch(target, type, init = {}) {
    const ev = Object.assign(
      {
        type,
        target,
        bubbles: true,
        cancelable: true,
        defaultPrevented: false,
        _stop: false,
        _stopImm: false,
        timeStamp: W.now,
        preventDefault() {
          if (this.cancelable) this.defaultPrevented = true
        },
        stopPropagation() {
          this._stop = true
        },
        stopImmediatePropagation() {
          this._stop = true
          this._stopImm = true
        }
      },
      init,
      { type, target }
    )
    const path = []
    for (let n = target; n; n = n.parentNode) path.push(n)
    if (path[path.length - 1] === document && target !== window) path.push(window)
    for (let i = path.length - 1; i > 0; i--) {
      invoke(path[i], ev, true)
      if (ev._stop) return ev
    }
    invoke(target, ev, true)
    if (ev._stop) return ev
    invoke(target, ev, false)
    if (ev.bubbles)
      for (let i = 1; i < path.length; i++) {
        if (ev._stop) break
        invoke(path[i], ev, false)
      }
    return ev
  }

  /* ------------------------------ nodes ------------------------------ */
  const camel2attr = (k) => 'data-' + k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())
  class Style {
    constructor() {
      this._p = {}
    }
    setProperty(k, v) {
      this._p[k] = String(v)
    }
    getPropertyValue(k) {
      return this._p[k] ?? ''
    }
    removeProperty(k) {
      const v = this._p[k] ?? ''
      delete this._p[k]
      return v
    }
  }
  const styleProxy = () =>
    new Proxy(new Style(), {
      get(t, k) {
        if (k in t) return typeof t[k] === 'function' ? t[k].bind(t) : t[k]
        return t._p[k] ?? ''
      },
      set(t, k, v) {
        t._p[k] = v == null ? '' : String(v)
        return true
      }
    })
  class El extends Target {
    constructor(tag, attrs = {}) {
      super()
      this.tagName = tag.toUpperCase()
      this.children = []
      this.parentNode = null
      this._a = new Map()
      this.style = styleProxy()
      this._text = ''
      this.rect = null
      this.classes = new Set()
      const self = this
      this.classList = {
        add: (...n) => n.forEach((x) => self.classes.add(x)),
        remove: (...n) => n.forEach((x) => self.classes.delete(x)),
        contains: (n) => self.classes.has(n),
        toggle: (n, f = !self.classes.has(n)) => (
          f ? self.classes.add(n) : self.classes.delete(n),
          f
        )
      }
      this.dataset = new Proxy(
        {},
        {
          get: (_, k) => (typeof k === 'string' ? self._a.get(camel2attr(k)) : undefined),
          set: (_, k, v) => {
            self._a.set(camel2attr(k), String(v))
            return true
          },
          deleteProperty: (_, k) => {
            self._a.delete(camel2attr(k))
            return true
          },
          has: (_, k) => self._a.has(camel2attr(k))
        }
      )
      for (const [k, v] of Object.entries(attrs)) this.setAttribute(k, v)
    }
    get id() {
      return this._a.get('id') ?? ''
    }
    set id(v) {
      this._a.set('id', v)
    }
    get textContent() {
      return this._text
    }
    set textContent(v) {
      this._text = String(v)
    }
    get hidden() {
      return this._a.has('hidden')
    }
    set hidden(v) {
      v ? this._a.set('hidden', '') : this._a.delete('hidden')
    }
    get disabled() {
      return this._a.has('disabled')
    }
    set disabled(v) {
      v ? this._a.set('disabled', '') : this._a.delete('disabled')
    }
    get tabIndex() {
      if (this._a.has('tabindex')) return Number(this._a.get('tabindex'))
      return ['BUTTON', 'A', 'INPUT'].includes(this.tagName) ? 0 : -1
    }
    setAttribute(k, v) {
      this._a.set(k, String(v))
    }
    getAttribute(k) {
      return this._a.get(k) ?? null
    }
    hasAttribute(k) {
      return this._a.has(k)
    }
    removeAttribute(k) {
      this._a.delete(k)
    }
    append(...cs) {
      for (const c of cs) {
        c.parentNode = this
        this.children.push(c)
      }
      return this
    }
    remove() {
      if (this.parentNode) {
        this.parentNode.children = this.parentNode.children.filter((c) => c !== this)
        this.parentNode = null
      }
    }
    get isConnected() {
      let n = this
      while (n.parentNode) n = n.parentNode
      return n === document
    }
    contains(o) {
      for (let n = o; n; n = n.parentNode) if (n === this) return true
      return false
    }
    *walk() {
      for (const c of this.children) {
        yield c
        yield* c.walk()
      }
    }
    matches(sel) {
      return sel.split(',').some((s) => matchSimple(this, s.trim()))
    }
    closest(sel) {
      for (let n = this; n && n instanceof El; n = n.parentNode) if (n.matches(sel)) return n
      return null
    }
    querySelector(sel) {
      for (const n of this.walk()) if (n.matches(sel)) return n
      return null
    }
    querySelectorAll(sel) {
      return [...this.walk()].filter((n) => n.matches(sel))
    }
    focus() {
      if (this.isConnected) document.activeElement = this
    }
    getBoundingClientRect() {
      if (
        !this.isConnected ||
        this.style.display === 'none' ||
        (this.parentNode && this.parentNode.style?.display === 'none')
      )
        return R(0, 0, 0, 0)
      return this.rect ? R(...this.rect) : R(0, 0, 100, 100)
    }
    get clientWidth() {
      return this.box?.[0] ?? 0
    }
    get clientHeight() {
      return this.box?.[1] ?? 0
    }
    clientLeft = 0
    clientTop = 0
    animate(keyframes, o) {
      return new Anim(this, keyframes, o)
    }
    getAnimations() {
      return W.animations.filter(
        (a) =>
          a.target === this &&
          a.playState !== 'idle' &&
          (a.playState !== 'finished' || ['forwards', 'both'].includes(a.fill))
      )
    }
    setPointerCapture(id) {
      if (!W.pointersDown.has(id))
        throw Object.assign(new Error('NotFoundError'), { name: 'NotFoundError' })
      W.captures.set(id, this)
      log('setPointerCapture', this.id || this.tagName, id)
    }
    releasePointerCapture(id) {
      if (W.captures.get(id) === this) {
        W.captures.delete(id)
        W.pendingLost.push([this, id])
      }
    }
    hasPointerCapture(id) {
      return W.captures.get(id) === this
    }
  }
  const R = (x, y, w, h) => ({
    x,
    y,
    left: x,
    top: y,
    width: w,
    height: h,
    right: x + w,
    bottom: y + h
  })
  function matchSimple(el, s) {
    if (s === ':disabled') return el.disabled
    if (s === '[hidden]') return el.hidden
    let m
    if ((m = s.match(/^#([\w-]+)$/))) return el.id === m[1]
    if ((m = s.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/)))
      return m[2] === undefined ? el.hasAttribute(m[1]) : el.getAttribute(m[1]) === m[2]
    if ((m = s.match(/^\.([\w-]+)$/))) return el.classes.has(m[1])
    if ((m = s.match(/^a\[href\]$/))) return el.tagName === 'A' && el.hasAttribute('href')
    if (/^[a-z]+$/.test(s)) return el.tagName === s.toUpperCase()
    return false
  }

  class Img extends El {
    constructor() {
      super('img')
      this._pending = []
    }
    get src() {
      return this._a.get('src') ?? ''
    }
    set src(v) {
      this._a.set('src', String(v))
      this._srcChanged()
    }
    get srcset() {
      return this._a.get('srcset') ?? ''
    }
    set srcset(v) {
      this._a.set('srcset', String(v))
      this._srcChanged()
    }
    get sizes() {
      return this._a.get('sizes') ?? ''
    }
    set sizes(v) {
      this._a.set('sizes', String(v))
    }
    get alt() {
      return this._a.get('alt') ?? ''
    }
    set alt(v) {
      this._a.set('alt', String(v))
    }
    removeAttribute(k) {
      super.removeAttribute(k)
      if (k === 'src' || k === 'srcset') this._srcChanged()
    }
    _srcChanged() {
      // real browsers reject an in-flight decode() when the source changes
      for (const d of this._pending)
        if (!d.settled) {
          d.reject(
            Object.assign(new Error('EncodingError: src changed'), { name: 'EncodingError' })
          )
        }
      this._pending = []
    }
    get shown() {
      return this.srcset ? `${this.srcset.split(' ')[0]}@sizes=${this.sizes}` : this.src
    }
    decode() {
      const url = this.srcset ? `srcset:${this.srcset}|${this.sizes}` : this.src
      let d
      const p = new Promise((resolve, reject) => {
        d = { img: this, url, resolve, reject, settled: false }
      })
      const wrap = (fn) => (v) => {
        if (d.settled) return
        d.settled = true
        fn(v)
      }
      d.resolve = wrap(d.resolve)
      d.reject = wrap(d.reject)
      this._pending.push(d)
      W.decodes.push(d)
      if (W.decodeMode === 'auto')
        queueMicrotask(() =>
          W.failUrls.has(url) || (W.failUrls.has(this.src) && !this.srcset)
            ? d.reject(new Error('fail ' + url))
            : d.resolve()
        )
      return p
    }
  }
  class Dialog extends El {
    constructor() {
      super('dialog')
      this.open = false
      this.closeEvents = 0
    }
    showModal() {
      if (this.open) return
      this.open = true
      this._a.set('open', '')
      log('showModal')
    }
    close() {
      if (!this.open) return
      this.open = false
      this._a.delete('open')
      log('dialog.close')
      setTimeout_(() => {
        this.closeEvents++
        dispatch(this, 'close', { bubbles: false, cancelable: false })
      }, 0)
    }
  }

  /* ------------------------------ animations ------------------------------ */
  class Anim {
    constructor(target, keyframes, o = {}) {
      Object.assign(this, {
        target,
        keyframes,
        duration: o.duration ?? 0,
        fill: o.fill,
        easing: o.easing,
        elapsed: 0,
        playState: 'running',
        created: W.now
      })
      this.finished = new Promise((res, rej) => {
        this._res = res
        this._rej = rej
      })
      this.finished.catch(() => {})
      W.animations.push(this)
      log('animate', target.id, JSON.stringify(keyframes), o.duration, o.fill || '')
    }
    tick(dt) {
      if (this.playState !== 'running') return
      if (W.freezeDuringVT && W.suppressed) return
      this.elapsed += dt
      if (this.elapsed >= this.duration) {
        this.playState = 'finished'
        this._res(this)
      }
    }
    cancel() {
      if (this.playState === 'idle') return
      const was = this.playState
      this.playState = 'idle'
      if (was === 'running')
        this._rej(Object.assign(new Error('AbortError'), { name: 'AbortError' }))
    }
    value(prop) {
      const p = this.playState === 'finished' ? 1 : Math.min(1, this.elapsed / (this.duration || 1))
      const a = this.keyframes[0]?.[prop],
        b = this.keyframes[this.keyframes.length - 1]?.[prop]
      if (a === undefined) return undefined
      if (typeof a === 'number') return a + (b - a) * p
      return p < 1 ? a : b
    }
  }

  /* ------------------------------ clock ------------------------------ */
  function setTimeout_(fn, ms = 0) {
    const id = ++W.timerId
    W.timers.push({ id, at: W.now + Math.max(0, ms || 0), fn })
    return id
  }
  function clearTimeout_(id) {
    W.timers = W.timers.filter((t) => t.id !== id)
  }
  function raf(fn) {
    const id = ++W.rafId
    W.rafs.set(id, fn)
    return id
  }
  function caf(id) {
    W.rafs.delete(id)
  }
  async function frame() {
    const dt = W.now - W.lastFrame
    W.lastFrame = W.now
    await vtFrame()
    if (!(W.freezeDuringVT && W.suppressed)) {
      const cbs = [...W.rafs.values()]
      W.rafs.clear()
      for (const cb of cbs) cb(W.now)
    }
    for (const a of [...W.animations]) a.tick(dt)
    await flush()
  }
  async function advance(ms) {
    const end = W.now + ms
    await flush()
    while (true) {
      const t = W.timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0]
      const nf = W.lastFrame + 16
      if (t && t.at <= nf) {
        W.now = Math.max(W.now, t.at)
        W.timers = W.timers.filter((x) => x !== t)
        t.fn()
        await flush()
        continue
      }
      if (nf <= end) {
        W.now = nf
        await frame()
        continue
      }
      break
    }
    W.now = end
    await flush()
  }

  /* ------------------------------ view transitions ------------------------------ */
  const vtQueue = []
  function startViewTransition(cb) {
    if (W.vtThrow) throw new Error('InvalidStateError: vt')
    const t = { cb, phase: 'pending-capture', skipped: false }
    t.updateCallbackDone = new Promise((res, rej) => {
      t._ucdRes = res
      t._ucdRej = rej
    })
    t.updateCallbackDone.catch(() => {})
    t.ready = new Promise((res, rej) => {
      t._readyRes = res
      t._readyRej = rej
    })
    t.ready.catch(() => {})
    t.finished = new Promise((res, rej) => {
      t._finRes = res
      t._finRej = rej
    })
    t.finished.catch(() => {})
    t.skipTransition = () => {
      if (t.phase === 'done') return
      W.vtLog.push('skipTransition@' + t.phase)
      t.skipped = true
      if (t.phase === 'pending-capture') callCb(t)
      W.suppressed = false
      t._readyRej(new Error('AbortError: skipped'))
      t.updateCallbackDone.then(
        () => t._finRes(),
        (e) => t._finRej(e)
      )
      t.phase = 'done'
    }
    if (W.vtRejectFinished) {
      t._readyRej(new Error('x'))
      t.updateCallbackDone.then(() => t._finRej(new Error('vt finished rejected')))
    }
    vtQueue.push(t)
    document.activeViewTransition = t
    W.vtLog.push('start')
    return t
  }
  function named() {
    const all = [...document.documentElement.walk()].filter(
      (e) =>
        e.style.viewTransitionName === 'lb-photo' && e.isConnected && e.style.display !== 'none'
    )
    return all.map((e) => e.id || e.parentNode?.id + '>img')
  }
  function callCb(t) {
    if (t.cbCalled) return
    t.cbCalled = true
    t.cbAt = W.now
    Promise.resolve()
      .then(() => t.cb())
      .then(
        (v) => {
          t.cbDoneAt = W.now
          t._ucdRes(v)
        },
        (e) => {
          t.cbDoneAt = W.now
          t._ucdRej(e)
        }
      )
  }
  async function vtFrame() {
    for (const t of [...vtQueue]) {
      if (t.phase === 'done') {
        vtQueue.splice(vtQueue.indexOf(t), 1)
        if (document.activeViewTransition === t) document.activeViewTransition = null
        continue
      }
      if (t.phase === 'pending-capture') {
        t.old = named()
        W.vtLog.push('capture-old ' + JSON.stringify(t.old))
        if (t.old.length > 1) {
          W.vtLog.push('DUPLICATE NAME (old)')
          t.skipTransition()
          continue
        }
        W.suppressed = true
        t.phase = 'callback'
        callCb(t)
        t.updateCallbackDone.then(
          () => {
            if (t.phase === 'callback') t.phase = 'capture-new'
          },
          () => {
            if (t.phase === 'callback') {
              W.suppressed = false
              t.phase = 'done'
              t._readyRej(new Error('cb rejected'))
              t._finRej(new Error('cb rejected'))
            }
          }
        )
      } else if (t.phase === 'callback') {
        if (W.now - t.cbAt > 4000) {
          W.vtLog.push('BROWSER TIMEOUT 4s')
          t.skipTransition()
        }
      } else if (t.phase === 'capture-new') {
        t.new = named()
        W.vtLog.push(
          'capture-new ' + JSON.stringify(t.new) + ' cbTook=' + (t.cbDoneAt - t.cbAt) + 'ms'
        )
        W.suppressed = false
        if (t.new.length > 1) {
          W.vtLog.push('DUPLICATE NAME (new)')
          t.skipTransition()
          continue
        }
        t.phase = 'animating'
        t.animStart = W.now
        t._readyRes()
      } else if (t.phase === 'animating') {
        if (W.now - t.animStart >= 460) {
          t.phase = 'done'
          W.vtLog.push('finished')
          t._finRes()
        }
      }
    }
  }

  /* ------------------------------ globals ------------------------------ */
  const window = new Target()
  const document = new Target()
  document.parentNode = null
  const html = new El('html')
  html.parentNode = document
  const body = new El('body')
  html.append(body)
  document.documentElement = html
  document.body = body
  document.activeElement = body
  document.children = [html]
  document.walk = function* () {
    yield html
    yield* html.walk()
  }
  document.getElementById = (id) => {
    for (const n of document.walk()) if (n.id === id) return n
    return null
  }
  document.querySelector = (sel) => {
    for (const n of document.walk()) if (n.matches(sel)) return n
    return null
  }
  document.querySelectorAll = (sel) => [...document.walk()].filter((n) => n.matches(sel))
  document.contains = (n) => !!n && n.isConnected
  if (W.vt) document.startViewTransition = startViewTransition
  document.activeViewTransition = null

  // history / location
  let url = new URL(opts.url || 'https://phos.test/photos/all/')
  const entries = [
    { state: opts.initialState ?? { index: 0, scrollX: 0, scrollY: 0 }, url: url.href, doc: 'this' }
  ]
  if (opts.prevEntries) entries.unshift(...opts.prevEntries)
  let cursor = entries.length - 1
  const location = {}
  for (const k of ['href', 'pathname', 'search', 'hash'])
    Object.defineProperty(location, k, { get: () => url[k] })
  const hist = {
    get state() {
      return entries[cursor].state
    },
    get length() {
      return entries.length
    },
    pushState(state, _, u) {
      entries.splice(cursor + 1)
      entries.push({ state: structuredClone(state), url: new URL(u, url).href, doc: 'this' })
      cursor++
      url = new URL(u, url)
      W.hist.push('push ' + url.pathname + url.hash + ' ' + JSON.stringify(state))
    },
    replaceState(state, _, u) {
      const nu = u === undefined ? url : new URL(u, url)
      entries[cursor] = { ...entries[cursor], state: structuredClone(state), url: nu.href }
      url = nu
      W.hist.push('replace ' + url.pathname + url.hash + ' ' + JSON.stringify(state))
    },
    back() {
      W.hist.push('back()')
      traverse(-1)
    },
    forward() {
      W.hist.push('forward()')
      traverse(1)
    },
    go(n) {
      traverse(n)
    }
  }
  function traverse(d) {
    setTimeout_(() => {
      const next = cursor + d
      if (next < 0 || next >= entries.length) return
      cursor = next
      url = new URL(entries[cursor].url)
      if (entries[cursor].doc !== 'this') {
        W.navigatedAway = entries[cursor].url
        W.hist.push('LEFT DOCUMENT -> ' + url.href)
        return
      }
      W.hist.push(
        'popstate -> ' + url.pathname + url.hash + ' ' + JSON.stringify(entries[cursor].state)
      )
      dispatch(window, 'popstate', {
        state: structuredClone(entries[cursor].state),
        bubbles: false,
        cancelable: false
      })
    }, 0)
  }
  W.hist = []
  W.entries = () =>
    entries.map(
      (e, i) =>
        (i === cursor ? '*' : ' ') +
        new URL(e.url).pathname +
        new URL(e.url).search +
        new URL(e.url).hash +
        ' ' +
        JSON.stringify(e.state)
    )
  W.cursor = () => cursor

  // the "Astro router" bubble listener
  W.router = []
  window.addEventListener('popstate', (ev) =>
    W.router.push(location.href + ' ' + JSON.stringify(ev.state))
  )

  window.matchMedia = (q) => ({
    matches: q.includes('reduced-motion')
      ? W.reducedMotion
      : q.includes('pointer: fine')
        ? W.finePointer
        : false
  })
  window.innerWidth = 1280
  window.innerHeight = 800
  window.setTimeout = setTimeout_
  window.clearTimeout = clearTimeout_
  window.requestAnimationFrame = raf
  window.cancelAnimationFrame = caf
  window.location = location
  window.history = hist
  window.document = document

  W.pointersDown = new Set()
  W.pendingLost = []

  const g = globalThis
  const saved = {}
  const globals = {
    window,
    document,
    location,
    history: hist,
    Element: El,
    HTMLElement: El,
    HTMLImageElement: Img,
    HTMLDialogElement: Dialog,
    Image: Img,
    setTimeout: setTimeout_,
    clearTimeout: clearTimeout_,
    requestAnimationFrame: raf,
    cancelAnimationFrame: caf,
    getComputedStyle: (el) =>
      el.id === 'lightbox-stage'
        ? { paddingLeft: '80px', paddingRight: '80px', paddingTop: '16px', paddingBottom: '16px' }
        : { paddingLeft: '0px', paddingRight: '0px', paddingTop: '0px', paddingBottom: '0px' },
    performance: { now: () => W.now }
  }
  let installed = false
  W.install = () => {
    if (installed) return
    installed = true
    for (const [k, v] of Object.entries(globals)) {
      saved[k] = Object.getOwnPropertyDescriptor(g, k)
      Object.defineProperty(g, k, { value: v, configurable: true, writable: true })
    }
  }
  W.restore = () => {
    if (!installed) return
    installed = false
    for (const [k, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(g, k, descriptor)
      else delete g[k]
    }
  }
  W.install()

  /* ------------------------------ page ------------------------------ */
  const photos =
    opts.photos ||
    Array.from({ length: 8 }, (_, i) => ({
      filename: `sample-${String(i + 1).padStart(2, '0')}.jpg`,
      category: i < 4 ? 'wedding' : 'street',
      title: `Sample ${i + 1}`,
      titleIsAuto: i % 2 === 0,
      description: i === 3 ? 'desc' : undefined,
      thumb: `/photos/thumbs/p${i}.webp`,
      srcset: `/photos/immersive-mobile/p${i}.webp 1100w, /photos/immersive/p${i}.webp 2200w, /photos/hd/p${i}.webp 3840w`,
      full: `/photos/full/p${i}.jpg`,
      width: 3840,
      height: 2560
    }))
  let main = new El('main')
  body.append(main)
  const tiles = []
  function buildTiles() {
    if (opts.tiles !== false)
      photos.forEach((p, i) => {
        const a = new El('a', {
          'data-index': i,
          'data-astro-reload': '',
          'data-astro-prefetch': 'false',
          href: p.full,
          'data-category': p.category,
          class: 'gallery-item'
        })
        a.classes.add('gallery-item')
        a.id = 'tile' + i
        a.rect = [20 + (i % 4) * 300, 100 + Math.floor(i / 4) * 250, 280, 200]
        if (!(opts.tileWithoutImg && opts.tileWithoutImg.includes(i))) {
          const im = new Img()
          im.id = 'tileimg' + i
          im.src = p.thumb
          im.rect = a.rect
          a.append(im)
        }
        main.append(a)
        tiles.push(a)
      })
  }
  buildTiles()
  let root = null
  function buildLightbox() {
    root = new Dialog()
    root.id = 'lightbox'
    root.classes.add('lightbox')
    const mk = (tag, id, t = El) => {
      const e = t === El ? new El(tag) : new t()
      e.id = id
      return e
    }
    const close = mk('button', 'lightbox-close'),
      prev = mk('button', 'lightbox-prev'),
      next = mk('button', 'lightbox-next'),
      zoomB = mk('button', 'lightbox-zoom')
    prev.disabled = true
    next.disabled = true
    const stage = mk('div', 'lightbox-stage')
    stage.rect = [0, 0, 1280, 756]
    stage.box = [1280, 756]
    const a = mk('img', 'lightbox-img-a', Img),
      b = mk('img', 'lightbox-img-b', Img)
    for (const l of [a, b])
      Object.defineProperty(l, 'rect', {
        get() {
          return layerRect(l)
        },
        set() {}
      })
    const err = mk('div', 'lightbox-error')
    err.hidden = true
    stage.append(a, b, err)
    const cap = new El('div')
    const title = mk('div', 'lightbox-title'),
      desc = mk('div', 'lightbox-description'),
      counter = mk('div', 'lightbox-counter')
    title.hidden = true
    desc.hidden = true
    cap.append(title, desc, counter)
    const live = mk('div', 'lightbox-live')
    const data = mk('script', 'lightbox-data')
    data.setAttribute('type', 'application/json')
    data.textContent = JSON.stringify(photos).replace(/</g, '\\u003c')
    root.append(close, prev, next, zoomB, stage, cap, live, data)
    body.append(root)
  }
  if (opts.lightbox !== false) buildLightbox()
  // simulate a ClientRouter swap: new <main> + optional new lightbox
  function rebuild({ lightbox = true } = {}) {
    main.remove()
    root?.remove()
    tiles.length = 0
    main = new El('main')
    body.append(main)
    buildTiles()
    root = null
    if (lightbox) buildLightbox()
    W.root = root
  }
  W.root = root
  function layerRect(l) {
    const ar = l.style.aspectRatio
    if (!ar) return [80, 16, 1120, 724]
    const [w, h] = ar.split('/').map(Number)
    const width = Math.min(1120, (724 * w) / h, w)
    const height = (width * h) / w
    return [80 + (1120 - width) / 2, 16 + (724 - height) / 2, width, height]
  }

  /* ------------------------------ input helpers ------------------------------ */
  const $ = (id) => document.getElementById(id)
  function click(target, init = {}) {
    return dispatch(target, 'click', { button: 0, clientX: 0, clientY: 0, ...init })
  }
  function key(k, init = {}) {
    const t = document.activeElement || body
    const ev = dispatch(t, 'keydown', { key: k, ...init })
    if (k === 'Escape' && W.root?.open && !ev.defaultPrevented) {
      // the dialog's close watcher: fire cancel; close if not prevented
      const c = dispatch(W.root, 'cancel', { bubbles: false, cancelable: init.cancelable ?? true })
      if (!c.defaultPrevented) W.root.close()
    }
    return ev
  }
  // pointer sequence helper: hit = element under the pointer at down time
  function pointer(type, hit, x, y, init = {}) {
    const id = init.pointerId ?? 1
    if (type === 'pointerdown') W.pointersDown.add(id)
    const cap = W.captures.get(id)
    const target = type !== 'pointerdown' && cap ? cap : hit
    const ev = dispatch(target, type, {
      pointerId: id,
      pointerType: init.pointerType || 'mouse',
      isPrimary: true,
      button: 0,
      clientX: x,
      clientY: y,
      ...init
    })
    if (type === 'pointerup' || type === 'pointercancel') {
      W.pointersDown.delete(id)
      if (W.captures.get(id)) {
        const c = W.captures.get(id)
        W.captures.delete(id)
        W.pendingLost.push([c, id])
      }
    }
    for (const [el, pid] of W.pendingLost.splice(0))
      dispatch(el, 'lostpointercapture', {
        pointerId: pid,
        pointerType: init.pointerType || 'mouse',
        bubbles: true
      })
    return { ev, target }
  }
  // full click with a down/up pair; returns the click target per the browser model
  function pointerClick(hit, x, y, init = {}) {
    const down = pointer('pointerdown', hit, x, y, init)
    const upHit = init.upHit || hit
    const up = pointer('pointerup', upHit, x + (init.dx || 0), y + (init.dy || 0), init)
    let clickTarget
    const touch = (init.pointerType || 'mouse') === 'touch'
    if (touch && W.touchClickModel === 'hit') clickTarget = upHit
    else {
      // common ancestor of pointerdown target and pointerup dispatch target
      clickTarget = down.target
      while (clickTarget && !clickTarget.contains(up.target)) clickTarget = clickTarget.parentNode
    }
    if (touch && Math.hypot(init.dx || 0, init.dy || 0) > 10) return { clickTarget: null }
    click(clickTarget, { clientX: x, clientY: y })
    return { clickTarget }
  }

  // what is visible on the stage right now
  function opacityOf(l) {
    let o = l.style.opacity !== '' ? Number(l.style.opacity) : l.dataset.layer === 'back' ? 0 : 1
    for (const a of W.animations)
      if (
        a.target === l &&
        a.playState !== 'idle' &&
        (a.playState === 'running' || ['forwards', 'both'].includes(a.fill))
      ) {
        const v = a.value('opacity')
        if (v !== undefined) o = v
      }
    return Math.round(o * 100) / 100
  }
  function transformOf(l) {
    let t = l.style.transform || 'none'
    for (const a of W.animations)
      if (
        a.target === l &&
        a.playState !== 'idle' &&
        (a.playState === 'running' || ['forwards', 'both'].includes(a.fill))
      ) {
        const v = a.value('transform')
        if (v !== undefined) t = v
      }
    return t
  }
  function screen() {
    if (!W.root?.open) return '(dialog closed)'
    return [$('lightbox-img-a'), $('lightbox-img-b')]
      .map(
        (l) =>
          `${l.id.slice(-1)}[${l.dataset.layer}] op=${opacityOf(l)} tf=${transformOf(l)} src=${l.src.split('/').pop() || '∅'}${l.srcset ? ' +srcset sizes=' + l.sizes : ''}`
      )
      .join(' | ')
  }
  const liveAnims = () =>
    W.animations
      .filter(
        (a) => a.playState !== 'idle' &&
          (a.playState === 'running' || ['forwards', 'both'].includes(a.fill))
      )
      .map((a) => `${a.target.id}:${a.playState}:${a.fill || ''}`)

  const world = {
    W,
    window,
    document,
    get root() {
      return W.root
    },
    rebuild,
    tiles,
    photos,
    $,
    click,
    key,
    pointer,
    pointerClick,
    advance,
    flush,
    dispatch,
    screen,
    opacityOf,
    transformOf,
    liveAnims,
    log,
    entries: W.entries,
    El,
    Img,
    restore: W.restore,
    async cleanup() {
      try {
        window.__phosLightbox?.destroy()
        for (const transition of [...vtQueue]) transition.skipTransition()
        for (const decode of W.decodes) if (!decode.settled) decode.resolve()
        await advance(1300)
        for (const animation of W.animations) animation.cancel()
        W.timers.length = 0
        W.rafs.clear()
        W.captures.clear()
      } finally {
        W.restore()
      }
    }
  }
  worlds.push(world)
  return world
}

export async function setup(opts = {}) {
  const world = makeWorld(opts)
  world.mod = await bundle('src/scripts/lightbox/index.ts')
  if (opts.init !== false) world.mod.initLightbox()
  world.lb = () => world.window.__phosLightbox
  return world
}

export async function openSettled(world, index, ms = 1500) {
  world.document.activeElement = world.tiles[index]
  const event = world.click(world.tiles[index].children[0] || world.tiles[index])
  await world.advance(ms)
  return event
}

export async function cleanupWorlds() {
  while (worlds.length) await worlds.pop().cleanup()
}
