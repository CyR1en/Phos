import assert from 'node:assert/strict'
import { bundle } from '../helpers/bundle.mjs'

const { createMorph } = await bundle('src/scripts/lightbox/morph.ts')

export function register(test) {
  const deferred = () => {
    let resolve
    let reject
    const promise = new Promise((yes, no) => {
      resolve = yes
      reject = no
    })
    return { promise, resolve, reject }
  }
  const tick = () => new Promise((resolve) => setImmediate(resolve))

  function fixture(options = {}) {
    const events = []
    const classes = new Set()
    const element = (label) => {
      let name = ''
      const style = {}
      Object.defineProperty(style, 'viewTransitionName', {
        get: () => name,
        set(value) {
          name = value
          events.push(`${label}:${value}`)
        }
      })
      return {
        style,
        getBoundingClientRect: () => options.imageRect ?? { width: 100, height: 100 }
      }
    }
    const img = element('tile')
    const layerA = element('front-a')
    const layerB = element('front-b')
    let front = layerA
    let count = 0
    const modes = []
    let starts = 0
    let skips = 0
    let callback
    const pending = deferred()
    const rect = options.rect ?? { left: 10, right: 110, top: 20, bottom: 120 }
    const tile = {
      querySelector: () => (options.noImage ? null : img),
      getBoundingClientRect: () => rect
    }
    const root = {
      hasAttribute: (name) => name === 'data-astro-transition' && Boolean(options.astro),
      classList: {
        add(name) {
          classes.add(name)
          events.push(`class:+${name}`)
        },
        remove(name) {
          classes.delete(name)
          events.push(`class:-${name}`)
        }
      }
    }
    const ctx = {
      reducedMotion: () => Boolean(options.reduced),
      current: () => (options.photo === undefined ? { width: 1000, height: 1000 } : options.photo),
      frontLayer: () => front
    }
    const document = { documentElement: root }
    if (options.active) document.activeViewTransition = {}
    if (!options.unsupported) {
      document.startViewTransition = (cb) => {
        starts++
        events.push('snapshot:old')
        if (options.mode === 'throw') throw new Error('already transitioning')
        callback = cb
        const updateCallbackDone =
          options.mode === 'late-callback'
            ? pending.promise.then(cb)
            : options.mode === 'reject-before-callback'
              ? Promise.reject(new Error('callback skipped'))
              : Promise.resolve().then(cb)
        const ready = updateCallbackDone.then(() => {
          events.push('snapshot:new')
        })
        const finished = ready.then(async () => {
          if (options.mode === 'reject-finished') throw new Error('transition aborted')
          if (options.mode === 'pending') await pending.promise
          events.push('finished')
        })
        return {
          finished,
          ready,
          updateCallbackDone,
          skipTransition() {
            skips++
            events.push('skip')
          }
        }
      }
    }
    globalThis.document = document
    globalThis.window = { innerWidth: 1024, innerHeight: 768 }
    const morph = createMorph(ctx)
    const apply = async (morphing) => {
      modes.push(morphing)
      count++
      events.push('apply')
      if (options.onApply) await options.onApply({ img, layerA, layerB, classes })
      if (options.swap) front = layerB
    }
    const clean = () => {
      assert.equal(img.style.viewTransitionName, '')
      assert.equal(layerA.style.viewTransitionName, '')
      assert.equal(layerB.style.viewTransitionName, '')
      assert.equal(classes.size, 0)
    }
    return {
      morph,
      ctx,
      tile,
      img,
      layerA,
      layerB,
      classes,
      events,
      apply,
      clean,
      pending,
      modes,
      get count() {
        return count
      },
      get starts() {
        return starts
      },
      get skips() {
        return skips
      },
      get callback() {
        return callback
      }
    }
  }

  test('open: correct source/target order and dynamic front layer; apply once', async () => {
    const f = fixture({
      swap: true,
      onApply({ img, layerA, classes }) {
        assert.equal(img.style.viewTransitionName, '')
        assert.equal(layerA.style.viewTransitionName, '')
        assert(classes.has('lightbox-morphing'))
      }
    })
    await f.morph.open(f.tile, f.apply)
    assert.deepEqual(f.events, [
      'class:+lightbox-morphing',
      'tile:lb-photo',
      'snapshot:old',
      'tile:',
      'apply',
      'front-b:lb-photo',
      'snapshot:new',
      'finished',
      'tile:',
      'front-b:',
      'class:-lightbox-morphing',
      'class:-lightbox-morph-closing'
    ])
    assert.equal(f.count, 1)
    assert.deepEqual(f.modes, [true])
    f.clean()
  })

  test('close: reverse name order and apply once', async () => {
    const f = fixture({
      onApply({ img, layerA, classes }) {
        assert.equal(layerA.style.viewTransitionName, '')
        assert.equal(img.style.viewTransitionName, '')
        assert(classes.has('lightbox-morphing'))
        assert(classes.has('lightbox-morph-closing'))
      }
    })
    await f.morph.close(f.tile, f.apply)
    assert.deepEqual(f.events, [
      'class:+lightbox-morphing',
      'class:+lightbox-morph-closing',
      'front-a:lb-photo',
      'snapshot:old',
      'front-a:',
      'apply',
      'tile:lb-photo',
      'snapshot:new',
      'finished',
      'front-a:',
      'tile:',
      'class:-lightbox-morphing',
      'class:-lightbox-morph-closing'
    ])
    assert.equal(f.count, 1)
    assert.deepEqual(f.modes, [true])
    f.clean()
  })

  for (const [name, options, tileMissing] of [
    ['missing API', { unsupported: true }],
    ['reduced motion', { reduced: true }],
    ['off-screen right', { rect: { left: 1024, right: 1124, top: 20, bottom: 120 } }],
    ['off-screen left', { rect: { left: -100, right: 0, top: 20, bottom: 120 } }],
    ['off-screen above', { rect: { left: 10, right: 110, top: -100, bottom: 0 } }],
    ['off-screen below', { rect: { left: 10, right: 110, top: 768, bottom: 868 } }],
    ['zero area', { rect: { left: 10, right: 10, top: 20, bottom: 120 } }],
    ['Astro navigation attribute', { astro: true }],
    ['native active transition', { active: true }],
    ['missing tile', {}, true],
    ['missing tile image', { noImage: true }]
  ]) {
    test(`${name}: plain apply, no names or class changes`, async () => {
      for (const direction of ['open', 'close']) {
        const f = fixture(options)
        await f.morph[direction](tileMissing ? null : f.tile, f.apply)
        assert.equal(f.count, 1)
        assert.equal(f.starts, 0)
        assert.deepEqual(f.events, ['apply'])
        assert.deepEqual(f.modes, [false])
        f.clean()
      }
    })
  }

  test('partially visible tile morphs', async () => {
    const f = fixture({ rect: { left: -90, right: 10, top: -90, bottom: 10 } })
    await f.morph.open(f.tile, f.apply)
    assert.equal(f.starts, 1)
    assert.equal(f.count, 1)
    assert.deepEqual(f.modes, [true])
    f.clean()
  })

  for (const mode of ['reject-finished', 'throw', 'reject-before-callback']) {
    test(`${mode}: no throw, apply once, names and class cleared`, async () => {
      for (const direction of ['open', 'close']) {
        const f = fixture({ mode })
        await f.morph[direction](f.tile, f.apply)
        assert.equal(f.count, 1)
        assert.deepEqual(f.modes, [mode === 'reject-finished'])
        f.clean()
      }
    })
  }

  test('in-flight guard spans controllers', async () => {
    const f = fixture({ mode: 'pending' })
    const first = f.morph.open(f.tile, f.apply)
    await tick()
    const second = createMorph(f.ctx)
    let count = 0
    await second.close(f.tile, () => {
      count++
    })
    assert.equal(count, 1)
    assert.equal(f.starts, 1)
    f.pending.resolve()
    await first
    f.clean()
  })

  test('1200ms cap skips stalled animation and releases guard', async () => {
    const f = fixture({ mode: 'pending' })
    const started = performance.now()
    await f.morph.open(f.tile, f.apply)
    assert(performance.now() - started >= 1100)
    assert.equal(f.skips, 1)
    assert.equal(f.count, 1)
    f.clean()
    f.pending.resolve()
    await tick()
    const next = fixture()
    await next.morph.open(next.tile, next.apply)
    assert.equal(next.starts, 1)
    next.clean()
  })

  test('late callback after timeout cannot restore names or repeat apply', async () => {
    const f = fixture({ mode: 'late-callback' })
    await f.morph.open(f.tile, f.apply)
    assert.equal(f.count, 1)
    assert.equal(f.skips, 1)
    f.clean()
    const names = f.events.filter((event) => event.includes(':lb-photo')).length
    f.pending.resolve()
    await tick()
    assert.equal(f.count, 1)
    assert.equal(f.events.filter((event) => event.includes(':lb-photo')).length, names)
    f.clean()
  })

  test('timeout returns with stalled apply; cleanup persists after apply settles', async () => {
    const loading = deferred()
    const f = fixture({ onApply: () => loading.promise })
    const started = performance.now()
    await f.morph.open(f.tile, f.apply)
    const elapsed = performance.now() - started
    assert(elapsed >= 1100 && elapsed < 2000)
    assert.equal(f.count, 1)
    assert.equal(f.skips, 1)
    f.clean()
    let fallback = 0
    await createMorph(f.ctx).close(f.tile, () => {
      fallback++
    })
    assert.equal(fallback, 1)
    assert.equal(f.starts, 1)
    loading.resolve()
    await tick()
    assert.equal(f.count, 1)
    assert.equal(f.events.filter((event) => event === 'front-a:lb-photo').length, 0)
    f.clean()
    const next = fixture()
    await next.morph.open(next.tile, next.apply)
    assert.equal(next.starts, 1)
    next.clean()
  })

  test('apply rejection propagates with cleanup and guard released', async () => {
    const failure = new Error('apply failed')
    const f = fixture({
      onApply() {
        throw failure
      }
    })
    await assert.rejects(f.morph.open(f.tile, f.apply), (error) => error === failure)
    assert.equal(f.count, 1)
    f.clean()
    const next = fixture()
    await next.morph.open(next.tile, next.apply)
    assert.equal(next.starts, 1)
    next.clean()
  })

  test('aspect guard compares rendered image, requires dimensions, and falls back without a transition', async () => {
    for (const options of [
      { imageRect: { width: 110, height: 100 } },
      { imageRect: { width: 90, height: 100 } },
      { imageRect: { width: 0, height: 100 } },
      { imageRect: { width: NaN, height: 100 } },
      { photo: null },
      { photo: { width: null, height: 100 } },
      { photo: { width: 100, height: 0 } }
    ]) {
      for (const direction of ['open', 'close']) {
        const f = fixture(options)
        await f.morph[direction](f.tile, f.apply)
        assert.deepEqual(f.modes, [false])
        assert.equal(f.starts, 0)
        assert.deepEqual(f.events, ['apply'])
        f.clean()
      }
    }
    for (const width of [98, 100, 102]) {
      const f = fixture({ imageRect: { width, height: 100 } })
      await f.morph.open(f.tile, f.apply)
      assert.deepEqual(f.modes, [true])
      assert.equal(f.starts, 1)
      f.clean()
    }
  })
  test('late callback and in-flight fallbacks always report false', async () => {
    const f = fixture({ mode: 'late-callback' })
    const opening = f.morph.open(f.tile, f.apply)
    const modes = []
    await createMorph(f.ctx).close(f.tile, (value) => {
      modes.push(value)
    })
    assert.deepEqual(modes, [false])
    await opening
    assert.deepEqual(f.modes, [false])
    f.pending.resolve()
    await tick()
    assert.deepEqual(f.modes, [false])
    f.clean()
  })
}
