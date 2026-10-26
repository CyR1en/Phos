import assert from 'node:assert/strict'
import { bundle } from '../helpers/bundle.mjs'

const { createGestures } = await bundle('src/scripts/lightbox/gestures.ts')

export function register(test) {
  class Style {
    transform = ''
    transition = ''
    opacity = ''
    values = new Map()
    setProperty(name, value) {
      this.values.set(name, value)
    }
    getPropertyValue(name) {
      return this.values.get(name) ?? ''
    }
    removeProperty(name) {
      const old = this.getPropertyValue(name)
      this.values.delete(name)
      return old
    }
  }

  class Stage {
    handlers = new Map()
    captured = new Set()
    addEventListener(type, handler, { signal }) {
      const handlers = this.handlers.get(type) ?? new Set()
      handlers.add(handler)
      this.handlers.set(type, handlers)
      signal.addEventListener('abort', () => handlers.delete(handler), { once: true })
    }
    dispatch(type, event) {
      for (const handler of this.handlers.get(type) ?? []) handler(event)
    }
    setPointerCapture(id) {
      this.captured.add(id)
    }
    hasPointerCapture(id) {
      return this.captured.has(id)
    }
    releasePointerCapture(id) {
      if (this.captured.delete(id)) this.dispatch('lostpointercapture', { pointerId: id })
    }
  }

  function fixture({
    zoomed = false,
    canPrev = true,
    canNext = true,
    reduced = false,
    deferred = false
  } = {}) {
    globalThis.window = { innerWidth: 390 }
    const stage = new Stage()
    const animations = []
    const calls = { next: 0, prev: 0, close: 0, pan: [], atNavigation: [] }
    const root = { style: new Style() }
    const layer = {
      dataset: {},
      style: new Style(),
      animate(keyframes, options) {
        let resolve
        const current = {
          keyframes,
          options,
          cancelled: 0,
          finished: deferred
            ? new Promise((done) => {
                resolve = done
              })
            : Promise.resolve(),
          cancel() {
            current.cancelled++
          },
          finish() {
            resolve?.()
          }
        }
        animations.push(current)
        return current
      }
    }
    const ctx = {
      els: { stage, root },
      state: { navToken: 0, open: true },
      frontLayer: () => layer,
      reducedMotion: () => reduced
    }
    const navigate = (direction) => {
      calls[direction]++
      calls.atNavigation.push({
        transform: layer.style.transform,
        cancelled: animations.at(-1)?.cancelled
      })
      assert.equal(layer.dataset.swipedOut, '1')
      assert.equal(layer.style.opacity, '0')
    }
    const gestures = createGestures(ctx, {
      zoom: { isZoomed: () => zoomed, panBy: (dx, dy) => calls.pan.push([dx, dy]) },
      next: () => navigate('next'),
      prev: () => navigate('prev'),
      canPrev: () => canPrev,
      canNext: () => canNext,
      close: () => calls.close++
    })
    gestures.attach()
    const send = (type, x, y, time, extra = {}) =>
      stage.dispatch(type, {
        pointerType: 'touch',
        pointerId: 1,
        clientX: x,
        clientY: y,
        timeStamp: time,
        ...extra
      })
    return { stage, root, layer, animations, calls, gestures, send, ctx }
  }

  const flush = async () => {
    await Promise.resolve()
    await Promise.resolve()
  }
  function clean(f) {
    if (f.layer.dataset.swipedOut === '1') {
      assert.match(f.layer.style.transform, /^translateX\(-?100vw\)$/)
      assert.equal(f.layer.style.opacity, '0')
    } else {
      assert.equal(f.layer.style.transform, '')
    }
    assert.equal(f.layer.style.transition, '')
    assert.equal(f.root.style.getPropertyValue('--lb-backdrop'), '')
    assert.equal(f.gestures.isDragging(), false)
  }

  test('1: 200px left swipe navigates once after -100vw slide-out', async () => {
    const f = fixture()
    f.send('pointerdown', 300, 100, 0)
    f.send('pointermove', 100, 100, 500)
    assert.equal(f.layer.style.transform, 'translateX(-200px)')
    assert.equal(f.layer.style.transition, 'none')
    assert.equal(f.gestures.isDragging(), true)
    f.send('pointerup', 100, 100, 500)
    assert.equal(f.calls.next, 0)
    assert.equal(f.gestures.isDragging(), false)
    assert.deepEqual(f.animations[0].keyframes, [
      { transform: 'translateX(-200px)' },
      { transform: 'translateX(-100vw)' }
    ])
    assert.deepEqual(f.animations[0].options, {
      duration: 260,
      easing: 'cubic-bezier(.32,.72,0,1)',
      fill: 'forwards'
    })
    await flush()
    assert.equal(f.calls.next, 1)
    assert.deepEqual(f.calls.atNavigation, [{ transform: 'translateX(-100vw)', cancelled: 1 }])
    clean(f)
    f.gestures.detach()
  })

  test('2: slow 40px swipe springs back without navigation', async () => {
    const f = fixture()
    f.send('pointerdown', 200, 100, 0)
    f.send('pointermove', 160, 100, 500)
    f.send('pointerup', 160, 100, 600)
    assert.equal(f.animations[0].keyframes[1].transform, 'none')
    assert.equal(f.animations[0].options.duration, 300)
    await flush()
    assert.equal(f.calls.next + f.calls.prev, 0)
    clean(f)
    f.gestures.detach()
  })

  test('3: 60px fling at 0.9px/ms commits below the distance threshold', async () => {
    const f = fixture()
    f.send('pointerdown', 200, 100, 0)
    f.send('pointermove', 140, 100, 60 / 0.9)
    f.send('pointerup', 140, 100, 60 / 0.9)
    await flush()
    assert.equal(f.calls.next, 1)
    assert.equal(f.animations[0].keyframes[1].transform, 'translateX(-100vw)')
    clean(f)
    f.gestures.detach()
  })

  test('4: right swipe at index zero has 0.3x resistance and no previous navigation', async () => {
    const f = fixture({ canPrev: false })
    f.send('pointerdown', 0, 100, 0)
    f.send('pointermove', 200, 100, 100)
    assert.equal(f.layer.style.transform, 'translateX(60px)')
    f.send('pointerup', 200, 100, 100)
    assert.equal(f.animations[0].keyframes[1].transform, 'none')
    await flush()
    assert.equal(f.calls.prev, 0)
    clean(f)
    f.gestures.detach()
  })

  test('5: 160px downward drag retains its close pose and backdrop until detach', async () => {
    const f = fixture()
    f.send('pointerdown', 100, 100, 0)
    f.send('pointermove', 100, 260, 300)
    assert.equal(f.layer.style.transform, 'translateY(160px) scale(0.92)')
    assert.equal(Number(f.root.style.getPropertyValue('--lb-backdrop')), 0.95 * (1 - 160 / 500))
    f.send('pointerup', 100, 260, 300)
    assert.equal(f.calls.close, 1)
    assert.equal(f.layer.style.transform, 'translateY(160px) scale(0.92)')
    assert.notEqual(f.root.style.getPropertyValue('--lb-backdrop'), '')
    f.gestures.detach()
    clean(f)
  })

  test('6: 80px downward drag springs back and restores the backdrop', async () => {
    const f = fixture()
    f.send('pointerdown', 100, 100, 0)
    f.send('pointermove', 100, 180, 300)
    assert.notEqual(f.root.style.getPropertyValue('--lb-backdrop'), '')
    f.send('pointerup', 100, 180, 300)
    assert.equal(f.animations[0].keyframes[1].transform, 'none')
    assert.equal(f.animations[0].options.duration, 300)
    await flush()
    assert.equal(f.calls.close, 0)
    clean(f)
    f.gestures.detach()
  })

  test('7: zoomed touch drags pan by incremental deltas without navigation', async () => {
    const f = fixture({ zoomed: true })
    f.layer.style.transform = 'scale(2)'
    f.send('pointerdown', 100, 100, 0)
    f.send('pointermove', 112, 115, 20)
    f.send('pointermove', 130, 109, 40)
    f.send('pointerup', 130, 109, 40)
    assert.deepEqual(f.calls.pan, [
      [12, 15],
      [18, -6]
    ])
    assert.equal(f.calls.next + f.calls.prev + f.calls.close, 0)
    assert.equal(f.animations.length, 0)
    assert.equal(f.layer.style.transform, 'scale(2)')
    f.gestures.detach()
    assert.equal(f.layer.style.transform, 'scale(2)')
  })

  test('8: unzoomed mouse drags do nothing', async () => {
    const f = fixture()
    const mouse = { pointerType: 'mouse' }
    f.send('pointerdown', 300, 100, 0, mouse)
    f.send('pointermove', 0, 300, 50, mouse)
    f.send('pointerup', 0, 300, 60, mouse)
    assert.equal(f.calls.next + f.calls.prev + f.calls.close + f.calls.pan.length, 0)
    assert.equal(f.animations.length, 0)
    assert.equal(f.stage.captured.size, 0)
    clean(f)
    f.gestures.detach()
  })

  test('9: detach mid-gesture clears styles, capture, state, and listeners', async () => {
    const f = fixture()
    f.send('pointerdown', 100, 100, 0)
    f.send('pointermove', 100, 180, 50)
    assert.equal(f.gestures.isDragging(), true)
    f.gestures.detach()
    f.gestures.detach()
    clean(f)
    assert.equal(f.stage.captured.size, 0)
    f.send('pointermove', 100, 300, 70)
    f.send('pointerup', 100, 300, 80)
    assert.equal(f.calls.close, 0)
    for (const handlers of f.stage.handlers.values()) assert.equal(handlers.size, 0)
  })

  test('axis locks after the 6px threshold; upward drags never dismiss', async () => {
    const f = fixture()
    f.send('pointerdown', 100, 200, 0)
    f.send('pointermove', 106, 200, 20)
    assert.equal(f.gestures.isDragging(), false)
    assert.equal(f.layer.style.transform, '')
    f.send('pointermove', 107, 200, 100)
    assert.equal(f.gestures.isDragging(), true)
    f.send('pointermove', 110, 380, 500)
    assert.equal(f.layer.style.transform, 'translateX(10px)')
    f.send('pointerup', 110, 380, 600)
    await flush()
    assert.equal(f.calls.close + f.calls.next + f.calls.prev, 0)
    f.send('pointerdown', 100, 300, 700)
    f.send('pointermove', 100, 0, 800)
    f.send('pointerup', 100, 0, 900)
    assert.equal(f.calls.close, 0)
    clean(f)
    f.gestures.detach()
  })

  test('pointercancel and lost capture spring back', async () => {
    for (const type of ['pointercancel', 'lostpointercapture']) {
      const f = fixture()
      f.send('pointerdown', 200, 100, 0)
      f.send('pointermove', 0, 100, 100)
      f.send(type, 0, 100, 110)
      assert.equal(f.gestures.isDragging(), false)
      assert.equal(f.animations[0].keyframes[1].transform, 'none')
      await flush()
      assert.equal(f.calls.next, 0)
      clean(f)
      f.gestures.detach()
    }
  })

  test('a second pointer cancels and blocks gestures until both pointers lift', async () => {
    const f = fixture()
    f.send('pointerdown', 200, 100, 0)
    f.send('pointermove', 0, 100, 100)
    f.send('pointerdown', 100, 100, 110, { pointerId: 2 })
    assert.equal(f.gestures.isDragging(), false)
    f.send('pointermove', -100, 100, 120)
    f.send('pointermove', -100, 100, 120, { pointerId: 2 })
    f.send('pointerup', -100, 100, 130)
    f.send('pointerup', -100, 100, 130, { pointerId: 2 })
    await flush()
    assert.equal(f.calls.next, 0)
    clean(f)
    f.send('pointerdown', 300, 100, 200)
    f.send('pointermove', 100, 100, 300)
    f.send('pointerup', 100, 100, 310)
    await flush()
    assert.equal(f.calls.next, 1)
    f.gestures.detach()
  })

  test('reduced motion commits, springs, and dismisses without animation', async () => {
    const f = fixture({ reduced: true })
    f.send('pointerdown', 300, 100, 0)
    f.send('pointermove', 100, 100, 500)
    f.send('pointerup', 100, 100, 500)
    assert.equal(f.calls.next, 1)
    delete f.layer.dataset.swipedOut
    f.layer.style.transform = ''
    f.layer.style.opacity = ''
    f.send('pointerdown', 200, 100, 1000)
    f.send('pointermove', 160, 100, 1500)
    f.send('pointerup', 160, 100, 1600)
    clean(f)
    f.send('pointerdown', 100, 100, 1700)
    f.send('pointermove', 100, 260, 1800)
    f.send('pointerup', 100, 260, 1900)
    assert.equal(f.calls.close, 1)
    assert.equal(f.animations.length, 0)
    f.gestures.detach()
    clean(f)
  })

  test('detach cancels a pending slide-out and prevents its navigation callback', async () => {
    const f = fixture({ deferred: true })
    f.send('pointerdown', 300, 100, 0)
    f.send('pointermove', 100, 100, 100)
    f.send('pointerup', 100, 100, 110)
    f.gestures.detach()
    assert.equal(f.animations[0].cancelled, 1)
    f.animations[0].finish()
    await flush()
    assert.equal(f.calls.next, 0)
    clean(f)
  })

  test('latest 80ms velocity permits a late fling and rejects a held swipe', async () => {
    const f = fixture()
    f.send('pointerdown', 200, 100, 0)
    f.send('pointermove', 200, 100, 500)
    f.send('pointermove', 140, 100, 500 + 60 / 0.9)
    f.send('pointerup', 140, 100, 500 + 60 / 0.9)
    await flush()
    assert.equal(f.calls.next, 1)
    delete f.layer.dataset.swipedOut
    f.layer.style.transform = ''
    f.layer.style.opacity = ''
    f.send('pointerdown', 200, 100, 1000)
    f.send('pointermove', 140, 100, 1060)
    f.send('pointerup', 140, 100, 1500)
    await flush()
    assert.equal(f.calls.next, 1)
    f.gestures.detach()
  })

  test('pen swipes navigate and zoomed mouse drags are ignored', async () => {
    const pen = fixture()
    pen.send('pointerdown', 100, 100, 0, { pointerType: 'pen' })
    pen.send('pointermove', 300, 100, 300, { pointerType: 'pen' })
    pen.send('pointerup', 300, 100, 310, { pointerType: 'pen' })
    await flush()
    assert.equal(pen.calls.prev, 1)
    assert.equal(pen.animations[0].keyframes[1].transform, 'translateX(100vw)')
    pen.gestures.detach()
    const mouse = fixture({ zoomed: true })
    mouse.send('pointerdown', 100, 100, 0, { pointerType: 'mouse' })
    mouse.send('pointermove', 120, 110, 30, { pointerType: 'mouse' })
    mouse.send('pointerup', 120, 110, 40, { pointerType: 'mouse' })
    assert.deepEqual(mouse.calls.pan, [])
    assert.equal(mouse.stage.captured.size, 0)
    assert.equal(mouse.calls.next + mouse.calls.prev + mouse.calls.close, 0)
    mouse.gestures.detach()
  })

  test('attach is idempotent and supports reopening after detach', async () => {
    const f = fixture({ reduced: true })
    f.gestures.attach()
    f.gestures.detach()
    f.gestures.attach()
    f.gestures.attach()
    f.send('pointerdown', 300, 100, 0)
    f.send('pointermove', 100, 100, 300)
    f.send('pointerup', 100, 100, 310)
    assert.equal(f.calls.next, 1)
    f.gestures.detach()
  })

  test('every real drag suppresses clicks for 100ms on up or cancel; taps do not', async () => {
    for (const end of ['pointerup', 'pointercancel']) {
      const f = fixture()
      f.send('pointerdown', 200, 100, 0)
      f.send('pointermove', 180, 100, 100)
      const before = performance.now()
      f.send(end, 180, 100, 500)
      assert(f.ctx.state.suppressClickUntil >= before + 100)
      assert(f.ctx.state.suppressClickUntil <= performance.now() + 100)
      f.gestures.detach()
      const tap = fixture()
      tap.send('pointerdown', 200, 100, 0)
      tap.send(end, 200, 100, 100)
      assert.equal(tap.ctx.state.suppressClickUntil, undefined)
      tap.gestures.detach()
    }
  })
  test('drag cancelled by a second pointer still suppresses its eventual click', async () => {
    const f = fixture()
    f.send('pointerdown', 200, 100, 0)
    f.send('pointermove', 180, 100, 100)
    f.send('pointerdown', 100, 100, 110, { pointerId: 2 })
    const before = performance.now()
    f.send('pointerup', 180, 100, 150)
    assert(f.ctx.state.suppressClickUntil >= before + 100)
    f.gestures.detach()
  })
}
