// Component runtime DOM: deterministic timers, manual rAF/idle/IO and dialog top layer.
// Kept separate from the lightbox geometry/history model; see tests/README.md.
export function makeEnv(opts = {}) {
  const E = {
    now: 0, timers: [], tid: 0, rafs: new Map(), rid: 0, idles: new Map(), iid: 0,
    reduced: !!opts.reduced, ios: [], animations: [], fetches: [], errors: [], log: [],
    mqListeners: [],
  }

  class Target {
    constructor() { this._l = [] }
    addEventListener(type, cb, o = {}) {
      if (!cb) return
      const capture = typeof o === 'boolean' ? o : !!o?.capture
      if (o?.signal?.aborted) return
      if (this._l.some(l => l.type === type && l.cb === cb && l.capture === capture)) return
      const l = { type, cb, capture, once: !!o?.once }
      this._l.push(l)
      o?.signal?.addEventListener?.('abort', () => this.removeEventListener(type, cb, capture), { once: true })
    }
    removeEventListener(type, cb, o = {}) {
      const capture = typeof o === 'boolean' ? o : !!o?.capture
      this._l = this._l.filter(l => !(l.type === type && l.cb === cb && l.capture === capture))
    }
    count(type) { return this._l.filter(l => l.type === type).length }
    dispatchEvent(ev) { return dispatch(this, ev) }
  }
  function invoke(node, ev, capture) {
    ev.currentTarget = node
    for (const l of [...node._l]) {
      if (l.type !== ev.type || l.capture !== capture || !node._l.includes(l)) continue
      if (l.once) node.removeEventListener(l.type, l.cb, l.capture)
      try { typeof l.cb === 'function' ? l.cb.call(node, ev) : l.cb.handleEvent(ev) }
      catch (e) { E.errors.push(e) }
      if (ev._imm) break
    }
  }
  function dispatch(target, ev) {
    if (!(ev instanceof Ev)) ev = Object.assign(new Ev(ev.type), ev)
    ev.target = target
    const path = []
    for (let n = target.parentNode; n; n = n.parentNode) path.push(n)
    if (path.at(-1) === E.document || target === E.document) path.push(E.window)
    if (target === E.window) path.length = 0
    for (let i = path.length - 1; i >= 0 && !ev._stop; i--) invoke(path[i], ev, true)
    if (!ev._stop) invoke(target, ev, true)
    if (!ev._stop) invoke(target, ev, false)
    if (ev.bubbles) for (let i = 0; i < path.length && !ev._stop; i++) invoke(path[i], ev, false)
    return !ev.defaultPrevented
  }
  class Ev {
    constructor(type, init = {}) {
      this.type = type; this.bubbles = init.bubbles ?? false; this.cancelable = init.cancelable ?? false
      this.defaultPrevented = false; this._stop = false; this._imm = false; Object.assign(this, init)
    }
    preventDefault() { if (this.cancelable) this.defaultPrevented = true }
    stopPropagation() { this._stop = true }
    stopImmediatePropagation() { this._stop = this._imm = true }
  }

  /* --------------------------- selector engine --------------------------- */
  function parseCompound(s) {
    const c = { tag: null, id: null, cls: [], attrs: [], pseudo: [] }
    const re = /^([a-zA-Z*][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:([~^$*|]?=)"?([^"\]]*)"?)?\]|:([\w-]+)(?:\(([^)]*)\))?/g
    let m, pos = 0
    re.lastIndex = 0
    const src = s
    while (pos < src.length) {
      re.lastIndex = 0
      const sub = src.slice(pos)
      m = re.exec(sub)
      if (!m || m.index !== 0) throw new Error('bad selector ' + s)
      if (m[1]) c.tag = m[1].toLowerCase()
      else if (m[2]) c.id = m[2]
      else if (m[3]) c.cls.push(m[3])
      else if (m[4]) c.attrs.push({ name: m[4], op: m[5], val: m[6] })
      else if (m[7]) c.pseudo.push({ name: m[7], arg: m[8] })
      pos += m[0].length
    }
    return c
  }
  function matchCompound(el, c) {
    if (!(el instanceof Element)) return false
    if (c.tag && c.tag !== '*' && el.localName !== c.tag) return false
    if (c.id && el.getAttribute('id') !== c.id) return false
    for (const k of c.cls) if (!el.classList.contains(k)) return false
    for (const a of c.attrs) {
      if (!el.hasAttribute(a.name)) return false
      if (a.op === '=' && el.getAttribute(a.name) !== a.val) return false
    }
    for (const p of c.pseudo) {
      if (p.name === 'hover') return !!el._hover
      if (p.name === 'focus-visible') return el === E.document.activeElement && !!E.focusVisible
      if (p.name === 'modal') return el.localName === 'dialog' && el._modal
      if (p.name === 'not') return !el.matches(p.arg)
    }
    return true
  }
  function matchSel(el, sel) {
    return sel.split(',').some(part => {
      const parts = part.trim().split(/\s+/).map(parseCompound)
      if (!matchCompound(el, parts.at(-1))) return false
      let node = el.parentNode
      for (let i = parts.length - 2; i >= 0; i--) {
        while (node && !matchCompound(node, parts[i])) node = node.parentNode
        if (!node) return false
        node = node.parentNode
      }
      return true
    })
  }

  /* --------------------------------- nodes -------------------------------- */
  class Node_ extends Target {
    constructor() { super(); this.parentNode = null; this.childNodes = [] }
    get children() { return this.childNodes.filter(n => n instanceof Element) }
    appendChild(n) { n.parentNode?.removeChild(n); n.parentNode = this; this.childNodes.push(n); n._connected?.(); return n }
    append(...ns) { ns.forEach(n => this.appendChild(n)) }
    removeChild(n) { this.childNodes = this.childNodes.filter(c => c !== n); n.parentNode = null; return n }
    remove() { this.parentNode?.removeChild(this) }
    contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false }
    *walk() { for (const c of this.children) { yield c; yield* c.walk() } }
    querySelectorAll(sel) { return [...this.walk()].filter(e => matchSel(e, sel)) }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null }
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === E.document }
    cloneNode(deep = false) {
      const copy = E.document.createElement(this.localName)
      for (const { name, value } of this.attributes) copy.setAttribute(name, value)
      if (deep) copy.append(...this.children.map(child => child.cloneNode(true)))
      return copy
    }
  }
  class ClassList {
    constructor(el) { this.el = el }
    get _s() { return (this.el.getAttribute('class') || '').split(/\s+/).filter(Boolean) }
    _w(a) { this.el.setAttribute('class', a.join(' ')) }
    contains(c) { return this._s.includes(c) }
    add(...cs) { const s = this._s; cs.forEach(c => s.includes(c) || s.push(c)); this._w(s) }
    remove(...cs) { this._w(this._s.filter(c => !cs.includes(c))) }
    toggle(c, f) { const has = this.contains(c); const want = f === undefined ? !has : !!f; want ? this.add(c) : this.remove(c); return want }
  }
  const cssName = k => k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())
  function makeStyle() {
    const p = {}
    return new Proxy(p, {
      get(t, k) {
        if (k === 'setProperty') return (n, v) => { t[n] = String(v) }
        if (k === 'removeProperty') return n => { const v = t[n] ?? ''; delete t[n]; return v }
        if (k === 'getPropertyValue') return n => t[n] ?? ''
        if (typeof k !== 'string') return undefined
        return t[cssName(k)] ?? ''
      },
      set(t, k, v) { if (v === '' || v == null) delete t[cssName(k)]; else t[cssName(k)] = String(v); return true },
    })
  }
  class Element extends Node_ {
    constructor(tag) {
      super(); this.localName = tag.toLowerCase(); this.tagName = tag.toUpperCase(); this._a = new Map()
      this.style = makeStyle(); this.classList = new ClassList(this); this._anims = []
      const self = this
      this.dataset = new Proxy({}, {
        get: (_, k) => typeof k === 'string' ? self.getAttribute('data-' + cssName(k)) ?? undefined : undefined,
        set: (_, k, v) => { self.setAttribute('data-' + cssName(k), v); return true },
        deleteProperty: (_, k) => { self.removeAttribute('data-' + cssName(k)); return true },
      })
    }
    get id() { return this.getAttribute('id') || '' }
    set id(v) { this.setAttribute('id', v) }
    get className() { return this.getAttribute('class') || '' }
    getAttribute(n) { return this._a.has(n) ? this._a.get(n) : null }
    setAttribute(n, v) { const old = this.getAttribute(n); this._a.set(n, String(v)); this._attrChanged?.(n, old, String(v)) }
    removeAttribute(n) { const had = this._a.has(n); this._a.delete(n); if (had) this._attrChanged?.(n, null, null) }
    hasAttribute(n) { return this._a.has(n) }
    toggleAttribute(n, f) { const want = f ?? !this.hasAttribute(n); want ? this.setAttribute(n, '') : this.removeAttribute(n); return want }
    get attributes() { return [...this._a].map(([name, value]) => ({ name, value })) }
    matches(sel) { return matchSel(this, sel) }
    closest(sel) { for (let n = this; n instanceof Element; n = n.parentNode) if (n.matches(sel)) return n; return null }
    get textContent() { return this._text ?? this.childNodes.map(c => c.textContent ?? '').join('') }
    set textContent(v) { this.childNodes = []; this._text = String(v) }
    get hidden() { return this.hasAttribute('hidden') }
    set hidden(v) { v ? this.setAttribute('hidden', '') : this.removeAttribute('hidden') }
    get offsetWidth() { return 100 }
    get inert() { return E.document._modalDialog() && !E.document._modalDialog().contains(this) }
    focus(o) {
      if (this.inert) { E.log.push('focus-blocked-inert ' + this.id); return }
      const prev = E.document.activeElement
      if (prev === this) return
      E.document._active = this
      E.log.push('focus ' + (this.id || this.localName + (this.getAttribute('href') ? '[' + this.getAttribute('href') + ']' : '')))
      prev && dispatch(prev, new Ev('focusout', { bubbles: true, relatedTarget: this }))
      dispatch(this, new Ev('focusin', { bubbles: true, relatedTarget: prev }))
    }
    blur() { if (E.document._active === this) E.document._active = E.document.body }
    click() { dispatch(this, new Ev('click', { bubbles: true, cancelable: true, button: 0 })) }
    get isFocusable() { return ['a', 'button', 'input', 'summary'].includes(this.localName) && !this.hasAttribute('disabled') }
    animate(keyframes, o = {}) {
      const a = new Anim(this, keyframes, o); this._anims.push(a); E.animations.push(a); return a
    }
    getAnimations() { return this._anims.filter(a => a.playState !== 'idle' && a.playState !== 'finished') }
    getBoundingClientRect() { return this.rect || { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 } }
  }
  class Anim {
    constructor(el, kf, o) { this.el = el; this.kf = kf; this.o = o; this.playState = 'running'; this.finished = new Promise(r => (this._res = r)) }
    cancel() { this.playState = 'idle'; E.log.push('anim-cancel') }
    finish() { this.playState = 'finished'; this._res(this) }
  }
  class HTMLElement extends Element {}
  class HTMLButtonElement extends HTMLElement {}
  class HTMLAnchorElement extends HTMLElement {
    get href() { return new URL(this.getAttribute('href') || '', 'http://localhost/').href }
    set href(v) { this.setAttribute('href', v) }
  }
  class HTMLSourceElement extends HTMLElement {
    get srcset() { return this.getAttribute('srcset') || '' } set srcset(v) { this.setAttribute('srcset', v) }
    get sizes() { return this.getAttribute('sizes') || '' } set sizes(v) { this.setAttribute('sizes', v) }
    _attrChanged(n) { if ((n === 'srcset' || n === 'sizes' || n === 'media' || n === 'type') && this.parentNode?.localName === 'picture') this.parentNode.querySelector('img')?._update('source.' + n) }
  }
  class HTMLImageElement extends HTMLElement {
    constructor(t) { super(t); this.complete = false; this.naturalWidth = 0; this._fetches = []; this._decodeResolvers = [] }
    get src() { return this.getAttribute('src') || '' } set src(v) { this.setAttribute('src', v) }
    get srcset() { return this.getAttribute('srcset') || '' } set srcset(v) { this.setAttribute('srcset', v) }
    get sizes() { return this.getAttribute('sizes') || '' } set sizes(v) { this.setAttribute('sizes', v) }
    _attrChanged(n) { if (n === 'src' || n === 'srcset' || n === 'sizes') this._update('img.' + n) }
    _update(why) {
      // Record the selection state at each relevant mutation; real engines coalesce to a stable state.
      const sources = this.parentNode?.localName === 'picture' ? this.parentNode.children.filter(c => c.localName === 'source' && c.hasAttribute('srcset')) : []
      const chosen = sources[0]?.getAttribute('srcset') || this.getAttribute('srcset') || this.getAttribute('src') || ''
      this._fetches.push({ why, chosen: chosen.split(/[\s,]/)[0] })
      if (!this._queued) { this._queued = true; queueMicrotask(() => { this._queued = false; this._stable = this._fetches.at(-1) }) }
    }
    decode() { return new Promise((res, rej) => this._decodeResolvers.push({ res, rej })) }
    _load(ok = true) {
      this.complete = true; this.naturalWidth = ok ? 1000 : 0
      this._decodeResolvers.splice(0).forEach(d => ok ? d.res() : d.rej(new Error('decode')))
      dispatch(this, new Ev(ok ? 'load' : 'error'))
    }
  }
  class HTMLDialogElement extends HTMLElement {
    constructor(t) { super(t); this._modal = false }
    get open() { return this.hasAttribute('open') }
    showModal() {
      if (this.open) { if (this._modal) return; throw new Error('InvalidStateError: open non-modal') }
      if (!this.isConnected) throw new Error('InvalidStateError: not connected')
      this.setAttribute('open', ''); this._modal = true
      this._prevFocus = E.document.activeElement
      E.document._top.push(this)
      // Dialog focusing steps: autofocus element, else first focusable descendant (focus delegate).
      const auto = this.querySelector('[autofocus]')
      const first = auto || [...this.walk()].find(e => e.isFocusable)
      ;(first || this).focus()
    }
    close(rv) {
      if (!this.open) return
      this.removeAttribute('open'); this._modal = false
      E.document._top = E.document._top.filter(d => d !== this)
      if (this._prevFocus && this._prevFocus.isConnected) this._prevFocus.focus()
      this._prevFocus = null
      E.setTimeout(() => dispatch(this, new Ev('close')), 0, 'dialog-close-task')
    }
    // User presses Escape: cancel event, then close unless prevented.
    _escape({ cancelable = true } = {}) {
      if (!this.open) return
      const ok = dispatch(this, new Ev('cancel', { cancelable }))
      if (ok && this.open) this.close()
    }
  }
  class HTMLDetailsElement extends HTMLElement {
    get open() { return this.hasAttribute('open') } set open(v) { this.toggleAttribute('open', !!v) }
  }
  class HTMLLinkElement extends HTMLElement {
    get href() { return new URL(this.getAttribute('href') || '', 'http://localhost/').href }
    set href(v) { this.setAttribute('href', v) }
    get rel() { return this.getAttribute('rel') || '' }
    set rel(v) { this.setAttribute('rel', v) }
    _connected() { E.log.push('link-inserted ' + this.getAttribute('href')) }
  }
  const ctors = { button: HTMLButtonElement, a: HTMLAnchorElement, img: HTMLImageElement, source: HTMLSourceElement, dialog: HTMLDialogElement, details: HTMLDetailsElement, link: HTMLLinkElement }

  class Document extends Node_ {
    constructor() {
      super(); this._top = []; this.hidden = false; this.visibilityState = 'visible'
      this.readyState = 'loading'
      this.documentElement = new HTMLElement('html'); this.appendChild(this.documentElement)
      this.head = new HTMLElement('head'); this.body = new HTMLElement('body')
      this.documentElement.append(this.head, this.body); this._active = this.body
    }
    get activeElement() { return this._active?.isConnected ? this._active : this.body }
    _modalDialog() { return this._top.at(-1) || null }
    createElement(t) { const C = ctors[t.toLowerCase()] || HTMLElement; return new C(t) }
    getElementById(id) { return this.querySelector('#' + id) }
    getAnimations() { return E.animations.filter(a => a.playState === 'running') }
    write(html) { E.writes.push(html); parseHTML(html, this.head) }
  }

  /* ----------------------------- HTML builder ----------------------------- */
  function parseHTML(html, parent) {
    const re = /<!--[\s\S]*?-->|<\/([\w-]+)\s*>|<([\w-]+)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g
    const voids = new Set(['img', 'source', 'link', 'meta', 'br', 'input', 'hr', 'path', 'circle'])
    const stack = [parent]; let m
    while ((m = re.exec(html))) {
      const top = stack.at(-1)
      if (m[1]) { const i = stack.map(n => n.localName).lastIndexOf(m[1].toLowerCase()); if (i > 0) stack.length = i; continue }
      if (m[2]) {
        const el = E.document.createElement(m[2])
        const are = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g; let a
        while ((a = are.exec(m[3] || ''))) el._a.set(a[1], (a[2] ?? a[3] ?? a[4] ?? '').replace(/&amp;/g, '&').replace(/&quot;/g, '"'))
        top.appendChild(el)
        if (!m[4] && !voids.has(m[2].toLowerCase())) stack.push(el)
        continue
      }
      if (m[5] && m[5].trim()) { const t = new Node_(); t.textContent = m[5]; t.nodeType = 3; Object.defineProperty(t, 'textContent', { value: m[5], writable: true }); top.childNodes.push(t); t.parentNode = top }
    }
  }

  /* -------------------------------- window -------------------------------- */
  const document = new Document()
  E.document = document
  E.writes = []
  class Window extends Target {}
  const window = new Window()
  E.window = window
  E.setTimeout = (fn, ms = 0, label) => { const id = ++E.tid; E.timers.push({ id, at: E.now + ms, fn, label }); return id }
  E.clearTimeout = id => { E.timers = E.timers.filter(t => t.id !== id) }
  E.advance = async (ms) => {
    const end = E.now + ms
    for (;;) {
      await new Promise(r => setImmediate(r))
      E.timers.sort((a, b) => a.at - b.at || a.id - b.id)
      const t = E.timers[0]
      if (!t || t.at > end) break
      E.timers.shift(); E.now = t.at
      try { t.fn() } catch (e) { E.errors.push(e) }
    }
    E.now = end
    await new Promise(r => setImmediate(r))
  }
  E.frame = async () => {
    const cbs = [...E.rafs.entries()]; E.rafs.clear()
    for (const [, cb] of cbs) { try { cb(E.now) } catch (e) { E.errors.push(e) } }
    await new Promise(r => setImmediate(r))
  }
  E.idle = async () => {
    const cbs = [...E.idles.entries()]; E.idles.clear()
    for (const [, cb] of cbs) cb({ timeRemaining: () => 50, didTimeout: false })
    await new Promise(r => setImmediate(r))
  }
  const mql = (q) => {
    const o = new Target()
    Object.defineProperty(o, 'matches', { get: () => q.includes('prefers-reduced-motion: reduce') ? E.reduced : q.includes('prefers-color-scheme: dark') ? !!E.darkOS : false })
    o.media = q; E.mqListeners.push(o); return o
  }
  class IO {
    constructor(cb, opts) { this.cb = cb; this.opts = opts; this.targets = new Set(); this.disconnected = false; E.ios.push(this) }
    observe(t) { this.targets.add(t) }
    unobserve(t) { this.targets.delete(t) }
    disconnect() { this.targets.clear(); this.disconnected = true }
    fire(entries) { this.cb(entries.map(([target, isIntersecting, rect]) => ({ target, isIntersecting, boundingClientRect: rect || target.getBoundingClientRect() })), this) }
  }
  const storage = new Map()
  Object.assign(window, {
    document, window: null, self: null, top: null,
    matchMedia: mql,
    setTimeout: E.setTimeout, clearTimeout: E.clearTimeout,
    requestAnimationFrame: cb => { const id = ++E.rid; E.rafs.set(id, cb); return id },
    cancelAnimationFrame: id => { E.rafs.delete(id) },
    IntersectionObserver: IO,
    getComputedStyle: () => ({ getPropertyValue: name => name === '--color-canvas'
      ? (document.documentElement.classList.contains('dark') ? '#111111' : '#f5f5f3')
      : name === '--site-header-height' ? '64px' : '', animationIterationCount: '1' }),
    localStorage: {
      getItem: k => { if (opts.storage === 'throw') throw new Error('storage blocked'); return storage.has(k) ? storage.get(k) : null },
      setItem: (k, v) => { if (opts.storage === 'throw') throw new Error('storage blocked'); storage.set(k, String(v)) },
      removeItem: k => { if (opts.storage === 'throw') throw new Error('storage blocked'); storage.delete(k) },
    },
    location: new URL(opts.url || 'http://localhost/'),
    fetch: (url, init) => { E.fetches.push(url); return new Promise((res) => E.setTimeout(() => res({ ok: true, json: async () => E.config }), 50, 'fetch')) },
    navigator: { hardwareConcurrency: 8 },
    Element, HTMLElement, HTMLButtonElement, HTMLAnchorElement, HTMLImageElement, HTMLDialogElement, HTMLSourceElement, HTMLDetailsElement, Node: Node_,
    Event: Ev, CustomEvent: Ev,
  })
  if (opts.idle !== false) {
    window.requestIdleCallback = cb => { const id = ++E.iid; E.idles.set(id, cb); return id }
    window.cancelIdleCallback = id => { E.idles.delete(id) }
  }
  window.window = window
  window.self = window
  window.top = opts.iframe ? {} : window
  window.parent = opts.iframe ? { document: { documentElement: {
    getAttribute: name => name === 'data-theme' ? opts.parentTheme || 'theme-parent' : null,
    classList: { contains: name => name === 'dark' && !!opts.parentDark }
  } } } : window
  if (opts.io === false) delete window.IntersectionObserver
  E.transitions = []
  if (opts.vt) document.startViewTransition = callback => {
    const transition = { switchingAtStart: document.documentElement.classList.contains('theme-switching') }
    transition.ready = new Promise((resolve, reject) => Object.assign(transition, { resolveReady: resolve, rejectReady: reject }))
    const catchReady = transition.ready.catch.bind(transition.ready)
    transition.ready.catch = handler => { transition.readyCaught = true; return catchReady(handler) }
    transition.finished = new Promise((resolve, reject) => Object.assign(transition, { resolve, reject }))
    E.transitions.push(transition)
    callback()
    return transition
  }
  E.storage = storage
  E.parseHTML = parseHTML
  E.Ev = Ev
  E.dispatch = dispatch

  // Install as globals (scripts reference bare names).
  E.install = () => {
    if (E._saved) return
    const keys = [...new Set(Object.keys(window).concat(['requestIdleCallback', 'cancelIdleCallback', 'IntersectionObserver']))]
    E._saved = {}
    for (const k of keys) {
      E._saved[k] = Object.getOwnPropertyDescriptor(globalThis, k)
      try { Object.defineProperty(globalThis, k, { value: window[k], configurable: true, writable: true }) } catch {}
    }
    if (opts.idle === false) { delete globalThis.requestIdleCallback; delete globalThis.cancelIdleCallback }
    if (opts.io === false) delete globalThis.IntersectionObserver
  }
  E.restore = () => {
    if (!E._saved) return
    for (const [key, descriptor] of Object.entries(E._saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
    E._saved = null
  }
  E.run = (code, name = 'script') => {
    new Function(code + '\n//# sourceURL=' + name)()
  }
  E.fire = (type, init = {}) => dispatch(document, Object.assign(new Ev(type, { bubbles: false, cancelable: !!init.cancelable }), init))
  return E
}
