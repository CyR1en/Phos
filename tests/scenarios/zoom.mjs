import assert from 'node:assert/strict'
import { bundle } from '../helpers/bundle.mjs'

const { createZoom } = await bundle('src/scripts/lightbox/zoom.ts')

export function register(test) {
  let frameId = 0
  const frames = new Map()
  function frame() {
    const callbacks = [...frames.values()]
    frames.clear()
    for (const callback of callbacks) callback()
  }
  const settle = async () => {
    await Promise.resolve()
    await Promise.resolve()
  }
  const rect = (left, top, width, height) => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height
  })

  class Element {
    constructor(box, log = []) {
      this.box = box
      this.listeners = new Map()
      this.dataset = {}
      this.attributes = new Map()
      this.style = new Proxy(
        { transition: '', transform: '', transformOrigin: '', translate: '' },
        {
          set(target, key, value) {
            log.push({ key, value })
            target[key] = value
            return true
          }
        }
      )
      this.clientLeft = 0
      this.clientTop = 0
      this.clientWidth = box.width
      this.clientHeight = box.height
      this.computed = {
        paddingLeft: '0px',
        paddingRight: '0px',
        paddingTop: '0px',
        paddingBottom: '0px'
      }
    }
    getBoundingClientRect() {
      const scale = Number(this.style.transform.match(/scale\(([^)]+)\)/)?.[1] ?? 1)
      const translate = this.style.transform.match(/translate\(([^p]+)px, ([^p]+)px\)/)
      const origin = (this.style.transformOrigin || '50% 50%')
        .split(' ')
        .map((value) => parseFloat(value) / 100)
      return rect(
        this.box.left + (1 - scale) * origin[0] * this.box.width + Number(translate?.[1] ?? 0),
        this.box.top + (1 - scale) * origin[1] * this.box.height + Number(translate?.[2] ?? 0),
        this.box.width * scale,
        this.box.height * scale
      )
    }
    setAttribute(name, value) {
      this.attributes.set(name, value)
    }
    getAttribute(name) {
      return this.attributes.get(name)
    }
    addEventListener(type, listener, { signal } = {}) {
      const listeners = this.listeners.get(type) ?? new Set()
      this.listeners.set(type, listeners)
      listeners.add(listener)
      signal?.addEventListener('abort', () => listeners.delete(listener), { once: true })
    }
    dispatch(type, event = {}) {
      for (const listener of this.listeners.get(type) ?? []) listener(event)
    }
    listenerCount() {
      return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0)
    }
  }

  function fixture({
    width = 10000,
    fine = true,
    reduced = false,
    deferred = false,
    fail = false,
    imageBox = rect(200, 100, 600, 400),
    stageBox = rect(0, 0, 1000, 600)
  } = {}) {
    frames.clear()
    globalThis.requestAnimationFrame = (callback) => {
      frames.set(++frameId, callback)
      return frameId
    }
    globalThis.cancelAnimationFrame = (id) => frames.delete(id)
    globalThis.getComputedStyle = (element) => element.computed
    const log = []
    const layers = [new Element(imageBox, log), new Element(imageBox)]
    const stage = new Element(stageBox)
    const root = new Element(stageBox)
    const zoomBtn = new Element(rect(0, 0, 44, 44))
    zoomBtn.setAttribute('aria-label', 'Zoom')
    zoomBtn.setAttribute('aria-pressed', 'false')
    const photo = {
      filename: 'photo.jpg',
      title: 'Photo',
      thumb: '',
      srcset: '',
      width,
      height: 4000
    }
    let current = photo
    let finish
    const wait = deferred
      ? new Promise((resolve) => {
          finish = resolve
        })
      : Promise.resolve()
    const upgrades = []
    const state = { zoomed: false, navToken: 1, front: 0, open: true }
    const ctx = {
      state,
      els: { root, stage, layers, zoomBtn },
      current: () => current,
      frontLayer: () => layers[state.front],
      reducedMotion: () => reduced,
      finePointer: () => fine
    }
    const zoom = createZoom(ctx, {
      loader: {
        upgrade: async (img, photo, width) => {
          log.push({ key: 'upgrade', value: width })
          upgrades.push({ img, photo, width, transform: img.style.transform })
          if (fail) throw new Error('decode failed')
          await wait
        }
      }
    })
    function pointer(type, x, y, time = 100, extra = {}) {
      stage.dispatch(type, {
        target: ctx.frontLayer(),
        pointerId: 1,
        button: 0,
        isPrimary: true,
        pointerType: fine ? 'mouse' : 'touch',
        clientX: x,
        clientY: y,
        timeStamp: time,
        ...extra
      })
    }
    function tap(x, y, time = 100, extra = {}) {
      pointer('pointerdown', x, y, time - 10, extra)
      pointer('pointerup', x, y, time, extra)
    }
    return {
      zoom,
      ctx,
      state,
      img: layers[0],
      layers,
      stage,
      root,
      zoomBtn,
      upgrades,
      log,
      pointer,
      tap,
      finish: () => finish(),
      noPhoto: () => {
        current = null
      }
    }
  }

  for (const [name, width, scale] of [
    ['small', 200, 1.75],
    ['huge', 10000, 3],
    ['unknown', null, 2],
    ['native ratio', 1200, 2]
  ]) {
    test(`${name}: scale clamp and upgrade width/order`, async () => {
      const f = fixture({ width })
      await f.zoom.zoomIn()
      assert.equal(f.img.style.transform, `scale(${scale})`)
      assert.equal(f.upgrades[0].width, 600 * scale)
      assert.equal(f.upgrades[0].transform, `scale(${scale})`)
      assert(
        f.log.findIndex((entry) => entry.key === 'transform') <
          f.log.findIndex((entry) => entry.key === 'upgrade')
      )
      assert.equal(f.img.style.transformOrigin, '50% 50%')
      assert.equal(f.img.style.transition, 'transform 420ms cubic-bezier(.16,1,.3,1)')
    })
  }

  test('client origin is anchored and clamped', async () => {
    const f = fixture()
    await f.zoom.zoomIn(350, 400)
    assert.equal(f.img.style.transformOrigin, '25% 75%')
    f.zoom.reset()
    await f.zoom.zoomIn(-1000, 2000)
    assert.equal(f.img.style.transformOrigin, '0% 100%')
  })

  test('zoom state and transform update before upgrade resolves', async () => {
    const f = fixture({ deferred: true })
    const pending = f.zoom.zoomIn()
    assert.equal(f.img.style.transform, 'scale(3)')
    assert.equal(f.zoom.isZoomed(), true)
    assert.equal('zoomed' in f.root.dataset, true)
    f.finish()
    await pending
    assert.equal(f.zoom.isZoomed(), true)
    assert.equal(f.root.dataset.zoomed, '')
    assert.equal(f.zoomBtn.getAttribute('aria-pressed'), 'true')
    assert.equal(f.zoomBtn.getAttribute('aria-label'), 'Zoom')
  })

  test('null photo and zero-size image never request zoom', async () => {
    const f = fixture()
    f.noPhoto()
    await f.zoom.zoomIn()
    assert.equal(f.upgrades.length, 0)
    const hidden = fixture({ imageBox: rect(0, 0, 0, 0) })
    await hidden.zoom.zoomIn()
    assert.equal(hidden.upgrades.length, 0)
  })

  test('background upgrade cannot revive zoom after navigation reset, front reset, reset, or detach', async () => {
    for (const invalidate of [
      (f) => {
        f.state.navToken++
        f.zoom.reset(false)
      },
      (f) => {
        f.state.front = 1
        f.zoom.reset(false)
      },
      (f) => f.zoom.reset(false),
      (f) => f.zoom.detach()
    ]) {
      const f = fixture({ deferred: true })
      const pending = f.zoom.zoomIn()
      invalidate(f)
      f.finish()
      await pending
      assert.equal(f.zoom.isZoomed(), false)
      assert.notEqual(f.img.style.transform, 'scale(3)')
      assert.equal('zoomed' in f.root.dataset, false)
    }
  })

  test('failed upgrade leaves the immediate zoom usable', async () => {
    const f = fixture({ fail: true })
    await f.zoom.zoomIn()
    await settle()
    assert.equal(f.zoom.isZoomed(), true)
    assert.equal(f.img.style.transform, 'scale(3)')
  })

  test('reset clears all transforms, state, root dataset, and pressed state', async () => {
    const f = fixture()
    await f.zoom.zoomIn()
    f.zoom.panBy(20, 20)
    f.img.style.translate = '10px 20px'
    f.zoom.reset()
    assert.equal(f.img.style.transform, 'none')
    assert.equal(f.img.style.transformOrigin, '')
    assert.equal(f.img.style.translate, '')
    assert.equal(f.zoom.isZoomed(), false)
    assert.equal('zoomed' in f.root.dataset, false)
    assert.equal(f.zoomBtn.getAttribute('aria-pressed'), 'false')
    assert.equal(f.zoomBtn.getAttribute('aria-label'), 'Zoom')
    f.zoom.reset()
  })

  test('instant reset suppresses a painted frame then restores transition', async () => {
    const f = fixture()
    await f.zoom.zoomIn()
    const transition = f.img.style.transition
    f.zoom.reset(false)
    assert.equal(f.img.style.transition, 'none')
    frame()
    assert.equal(f.img.style.transition, 'none')
    frame()
    assert.equal(f.img.style.transition, transition)
  })

  test('reset clears the previous zoomed layer and the changed front layer', async () => {
    const f = fixture()
    await f.zoom.zoomIn()
    f.state.front = 1
    f.layers[1].style.transform = 'translateX(24px)'
    f.layers[1].style.transformOrigin = '0% 0%'
    f.layers[1].style.translate = '24px'
    f.zoom.reset(false)
    for (const img of f.layers) {
      assert.equal(img.style.transform, 'none')
      assert.equal(img.style.transformOrigin, '')
      assert.equal(img.style.translate, '')
      assert.equal(img.style.transition, 'none')
    }
    frame()
    frame()
  })

  test('pan clamps at all four edges and accumulates client-pixel deltas', async () => {
    const f = fixture()
    await f.zoom.zoomIn()
    f.zoom.panBy(10, -20)
    assert.equal(f.img.style.transform, 'translate(10px, -20px) scale(3)')
    f.zoom.panBy(10000, 10000)
    assert.equal(f.img.style.transform, 'translate(400px, 300px) scale(3)')
    f.zoom.panBy(-10000, -10000)
    assert.equal(f.img.style.transform, 'translate(-400px, -300px) scale(3)')
    assert.equal(f.img.style.transition, 'none')
    assert.equal(f.img.style.transformOrigin, '50% 50%')
  })

  test('pan bounds account for the fixed off-centre origin', async () => {
    const f = fixture()
    await f.zoom.zoomIn(350, 400)
    f.zoom.panBy(10000, 10000)
    assert.equal(f.img.style.transform, 'translate(100px, 500px) scale(3)')
    f.zoom.panBy(-10000, -10000)
    assert.equal(f.img.style.transform, 'translate(-700px, -100px) scale(3)')
    assert.equal(f.img.style.transformOrigin, '25% 75%')
  })

  test('pan uses stage content bounds, including padding and borders', async () => {
    const f = fixture({ stageBox: rect(20, 30, 1000, 600), imageBox: rect(210, 125, 600, 400) })
    Object.assign(f.stage, {
      clientLeft: 2,
      clientTop: 2,
      clientWidth: 996,
      clientHeight: 596,
      computed: {
        paddingLeft: '38px',
        paddingRight: '58px',
        paddingTop: '18px',
        paddingBottom: '28px'
      }
    })
    await f.zoom.zoomIn()
    f.zoom.panBy(10000, 10000)
    assert.equal(f.img.style.transform, 'translate(450px, 325px) scale(3)')
    f.zoom.panBy(-10000, -10000)
    assert.equal(f.img.style.transform, 'translate(-450px, -325px) scale(3)')
  })

  test('a still-letterboxed axis stays centred while the other axis pans', async () => {
    const f = fixture({ width: 100, imageBox: rect(450, 100, 100, 400) })
    await f.zoom.zoomIn()
    f.zoom.panBy(10000, 10000)
    assert.equal(f.img.style.transform, 'translate(0px, 50px) scale(1.75)')
    f.zoom.panBy(-10000, -10000)
    assert.equal(f.img.style.transform, 'translate(0px, -50px) scale(1.75)')
  })

  test('unzoomed pan and hover are inert; hover uses original image bounds', async () => {
    const f = fixture()
    f.zoom.panBy(10, 10)
    f.zoom.followPointer(800, 100)
    assert.equal(f.img.style.transformOrigin, '')
    assert.equal(f.img.style.transform, '')
    await f.zoom.zoomIn()
    f.zoom.followPointer(800, 100)
    assert.equal(f.img.style.transformOrigin, '100% 0%')
    assert.equal(
      f.img.style.transition,
      'transform 420ms cubic-bezier(.16,1,.3,1), transform-origin 120ms linear'
    )
  })

  test('fine pointer click toggles once; front-layer restriction and attach idempotence', async () => {
    const f = fixture()
    f.zoom.attach()
    f.zoom.attach()
    f.tap(350, 400, 100, { target: f.layers[1] })
    assert.equal(f.upgrades.length, 0)
    f.tap(350, 400)
    await settle()
    assert.equal(f.upgrades.length, 1)
    assert.equal(f.zoom.isZoomed(), true)
    assert.equal(f.img.style.transformOrigin, '25% 75%')
    f.tap(350, 400, 200)
    assert.equal(f.zoom.isZoomed(), false)
  })

  test('click after any >6px movement does not toggle, even after returning', async () => {
    const f = fixture()
    f.zoom.attach()
    f.pointer('pointerdown', 500, 300)
    f.pointer('pointermove', 507, 300)
    f.pointer('pointermove', 500, 300)
    f.pointer('pointerup', 500, 300)
    f.pointer('pointerdown', 500, 300)
    f.pointer('pointerup', 507, 300)
    await settle()
    assert.equal(f.upgrades.length, 0)
    f.pointer('pointerdown', 500, 300)
    f.pointer('pointerup', 506, 300)
    await settle()
    assert.equal(f.upgrades.length, 1)
  })

  test('coarse double-tap accepts the 300ms / 24px boundary and toggles back out', async () => {
    const f = fixture({ fine: false })
    f.zoom.attach()
    f.tap(500, 300, 100)
    await settle()
    assert.equal(f.upgrades.length, 0)
    f.tap(524, 300, 400)
    await settle()
    assert.equal(f.zoom.isZoomed(), true)
    f.tap(500, 300, 800)
    f.tap(500, 300, 900)
    assert.equal(f.zoom.isZoomed(), false)
  })

  test('coarse double-tap rejects late, distant, and dragged taps', async () => {
    for (const [time, distance] of [
      [401, 0],
      [300, 25]
    ]) {
      const f = fixture({ fine: false })
      f.zoom.attach()
      f.tap(500, 300, 100)
      f.tap(500 + distance, 300, time)
      await settle()
      assert.equal(f.upgrades.length, 0)
    }
    const f = fixture({ fine: false })
    f.zoom.attach()
    f.tap(500, 300, 100)
    f.pointer('pointerdown', 500, 300, 200)
    f.pointer('pointermove', 510, 300, 210)
    f.pointer('pointerup', 500, 300, 220)
    f.tap(500, 300, 250)
    await settle()
    assert.equal(f.upgrades.length, 0)
  })

  test('cancelled pointers and navigation between down/up cannot toggle', async () => {
    for (const cancel of [
      (f) => f.pointer('pointercancel', 500, 300),
      (f) => f.pointer('lostpointercapture', 500, 300),
      (f) => f.pointer('pointerleave', 500, 300),
      (f) => f.state.navToken++
    ]) {
      const f = fixture()
      f.zoom.attach()
      f.pointer('pointerdown', 500, 300)
      cancel(f)
      f.pointer('pointerup', 500, 300)
      await settle()
      assert.equal(f.upgrades.length, 0)
    }
  })

  test('capture release after pointerup does not erase a valid first touch tap', async () => {
    const f = fixture({ fine: false })
    f.zoom.attach()
    f.tap(500, 300, 100)
    f.pointer('lostpointercapture', 500, 300, 101)
    f.tap(500, 300, 200)
    await settle()
    assert.equal(f.zoom.isZoomed(), true)
  })

  test('touch on a fine-pointer hybrid still requires a double-tap', async () => {
    const f = fixture()
    f.zoom.attach()
    f.tap(500, 300, 100, { pointerType: 'touch' })
    assert.equal(f.upgrades.length, 0)
    f.tap(500, 300, 200, { pointerType: 'touch' })
    await settle()
    assert.equal(f.zoom.isZoomed(), true)
  })

  test('button uses the stage centre on coarse devices; detach removes every listener', async () => {
    const f = fixture({ fine: false })
    f.zoom.attach()
    f.zoomBtn.dispatch('click')
    await settle()
    assert.equal(f.img.style.transformOrigin, '50% 50%')
    assert.equal(f.zoom.isZoomed(), true)
    f.zoom.detach()
    assert.equal(f.stage.listenerCount(), 0)
    assert.equal(f.zoomBtn.listenerCount(), 0)
    assert.equal(f.zoom.isZoomed(), false)
    f.zoom.detach()
    f.tap(500, 300, 100)
    f.tap(500, 300, 200)
    f.zoomBtn.dispatch('click')
    assert.equal(f.upgrades.length, 1)
    f.zoom.attach()
    f.zoomBtn.dispatch('click')
    await settle()
    assert.equal(f.upgrades.length, 2)
    frame()
    frame()
    assert.equal(f.img.style.transition, 'transform 420ms cubic-bezier(.16,1,.3,1)')
  })

  test('reduced motion disables zoom, hover, pan, and reset transitions', async () => {
    const f = fixture({ reduced: true })
    await f.zoom.zoomIn()
    assert.equal(f.img.style.transition, 'none')
    f.zoom.followPointer(600, 300)
    assert.equal(f.img.style.transition, 'none')
    f.zoom.panBy(100, 100)
    assert.equal(f.img.style.transition, 'none')
    f.zoom.reset()
    assert.equal(f.img.style.transition, 'none')
  })

  test('unzoomed reset preserves a swiped-out transform and transition', async () => {
    const f = fixture()
    f.img.style.transform = 'translateX(-100vw)'
    f.img.style.transition = 'none'
    f.zoom.reset(false)
    assert.equal(f.img.style.transform, 'translateX(-100vw)')
    assert.equal(f.img.style.transition, 'none')
  })
  test('zoomed mouse drag follows the origin, never translates or toggles', async () => {
    const f = fixture()
    f.zoom.attach()
    f.zoom.zoomIn()
    f.pointer('pointerdown', 500, 300)
    f.pointer('pointermove', 650, 350)
    assert.equal(f.img.style.transform, 'scale(3)')
    assert.equal(f.img.style.transformOrigin, '75% 62.5%')
    f.pointer('pointerup', 650, 350)
    assert(f.zoom.isZoomed())
  })
}
