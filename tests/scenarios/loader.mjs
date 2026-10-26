import assert from 'node:assert/strict'
import { fixture } from '../helpers/context.mjs'

export function register(test) {
  test('stage sizing subtracts padding, aspect-fits, caps native width and clears unknown dimensions', () => {
    const { ctx, loader } = fixture()
    const photo = ctx.current()
    assert.equal(loader.displayWidth(photo), 1086)
    assert.equal(loader.displayWidth({ ...photo, width: 100, height: 200 }), 100)
    assert.equal(loader.displayWidth({ ...photo, width: null }), 1120)
    loader.fit(ctx.backLayer(), photo)
    assert.equal(ctx.backLayer().style.aspectRatio, '3840 / 2560')
    assert.equal(ctx.backLayer().style.width, 'min(100cqw, 100cqh * 1.5, 3840px)')
    loader.fit(ctx.backLayer(), { ...photo, height: null })
    assert.equal(ctx.backLayer().style.aspectRatio, '')
    assert.equal(ctx.backLayer().style.width, '')
  })

  test('thumbnail is first paint and resolves without waiting for HD', async () => {
    const { w, ctx, loader } = fixture({ decodeMode: 'manual' })
    const img = ctx.backLayer(),
      photo = w.photos[1]
    const loading = loader.load(img, photo, 0)
    assert.equal(img.src, photo.thumb)
    w.W.decodes[0].resolve()
    assert.deepEqual(await loading, { hd: false })
    const hd = w.W.decodes.at(-1)
    assert.notEqual(hd.img, img)
    assert.equal(hd.settled, false)
    assert.equal(img.srcset, '')
    hd.resolve()
    await w.flush()
    assert.equal(img.srcset, photo.srcset)
    assert.equal(img.sizes, '1086px')
  })

  test('failed thumbnail waits for HD as first paint', async () => {
    const { w, ctx, loader } = fixture({ decodeMode: 'manual' })
    const img = ctx.backLayer(),
      photo = w.photos[1]
    let settled = false
    const loading = loader.load(img, photo, 0).then((result) => {
      settled = true
      return result
    })
    w.W.decodes[0].reject(new Error('thumbnail failed'))
    await w.flush()
    assert.equal(settled, false)
    assert.equal(img.srcset, '')
    assert.equal(ctx.els.error.hidden, true)
    w.W.decodes.at(-1).resolve()
    assert.deepEqual(await loading, { hd: true })
    assert.equal(img.srcset, photo.srcset)
  })

  test('both decodes failing reject and reveal the error', async () => {
    const { w, ctx, loader } = fixture({ decodeMode: 'manual' })
    const loading = loader.load(ctx.backLayer(), w.photos[1], 0)
    const rejected = assert.rejects(loading, /HD failed after the thumbnail failed/)
    w.W.decodes[0].reject(new Error('thumbnail failed'))
    await w.flush()
    w.W.decodes.at(-1).reject(new Error('HD failed'))
    await rejected
    assert.equal(ctx.els.error.hidden, false)
  })

  test('successful thumbnail stays usable if background HD fails', async () => {
    const { w, ctx, loader } = fixture({ decodeMode: 'manual' })
    const img = ctx.backLayer(),
      photo = w.photos[1]
    const loading = loader.load(img, photo, 0)
    w.W.decodes[0].resolve()
    assert.deepEqual(await loading, { hd: false })
    w.W.decodes.at(-1).reject(new Error('HD failed'))
    await w.flush()
    assert.equal(img.src, photo.thumb)
    assert.equal(img.srcset, '')
    assert.equal(ctx.els.error.hidden, true)
  })

  for (const afterThumb of [false, true]) {
    test(`stale ${afterThumb ? 'HD' : 'thumbnail'} completion cannot mutate a layer or reveal an error`, async () => {
      const { w, ctx, loader } = fixture({ decodeMode: 'manual' })
      const img = ctx.backLayer()
      const loading = loader.load(img, w.photos[1], 0)
      if (afterThumb) {
        w.W.decodes[0].resolve()
        await loading
      }
      ctx.state.navToken++
      const attributes = [...img._a]
      const hidden = ctx.els.error.hidden
      if (afterThumb) w.W.decodes.at(-1).reject(new Error('stale HD failed'))
      else w.W.decodes[0].resolve()
      const result = await loading
      if (!afterThumb) assert.equal(result.aborted, true)
      await w.flush()
      assert.deepEqual([...img._a], attributes)
      assert.equal(ctx.els.error.hidden, hidden)
    })
  }

  test('an already stale load is inert', async () => {
    const { w, ctx, loader } = fixture()
    const img = ctx.backLayer()
    assert.deepEqual(await loader.load(img, w.photos[1], -1), { hd: false, aborted: true })
    assert.equal(w.W.decodes.length, 0)
    assert.equal(img.src, '')
  })

  test('original fallback only replaces the thumbnail after offscreen decode', async () => {
    const { w, ctx, loader } = fixture({ decodeMode: 'manual' })
    const img = ctx.backLayer(),
      photo = { ...w.photos[1], srcset: '' }
    const loading = loader.load(img, photo, 0)
    w.W.decodes[0].resolve()
    assert.deepEqual(await loading, { hd: false })
    const hd = w.W.decodes.at(-1)
    assert.equal(hd.img.src, photo.full)
    assert.equal(img.src, photo.thumb)
    hd.resolve()
    await w.flush()
    assert.equal(img.src, photo.full)
    assert.equal(img.srcset, '')
  })

  test('zoom upgrade applies rounded sizes immediately, keeps src and handles decode failure', async () => {
    const { w, ctx, loader } = fixture({ decodeMode: 'manual' })
    const img = ctx.frontLayer(),
      photo = w.photos[0],
      src = img.src
    const upgrading = loader.upgrade(img, photo, 1720.2)
    assert.equal(img.sizes, '1721px')
    assert.equal(w.W.decodes.at(-1).img.sizes, '1721px')
    w.W.decodes.at(-1).reject(new Error('upgrade failed'))
    await upgrading
    assert.equal(img.src, src)
    const count = w.W.decodes.length
    await loader.upgrade(img, { ...photo, srcset: '' }, 2200)
    assert.equal(w.W.decodes.length, count)
  })

  test('neighbor preloading warms only adjacent thumbnails and sized HD, including original fallback', () => {
    const { w, ctx, loader } = fixture()
    ctx.state.photos[2].srcset = ''
    const constructed = []
    globalThis.Image = class extends w.Img {
      constructor() {
        super()
        constructed.push(this)
      }
    }
    loader.preloadNeighbors(1)
    assert.equal(constructed.length, 4)
    assert.equal(constructed[0].src, w.photos[0].thumb)
    assert.equal(constructed[1].srcset, w.photos[0].srcset)
    assert.equal(constructed[1].sizes, '1086px')
    assert.equal(constructed[2].src, w.photos[2].thumb)
    assert.equal(constructed[3].src, w.photos[2].full)
    constructed.length = 0
    loader.preloadNeighbors(0)
    assert.equal(constructed.length, 2)
  })

  test('decoded opener rendition is used for the first paint', async () => {
    const { w, ctx, loader } = fixture({ decodeMode: 'manual' })
    const loading = loader.load(ctx.backLayer(), w.photos[1], 0, '/already-decoded.webp')
    assert.equal(ctx.backLayer().src, '/already-decoded.webp')
    w.W.decodes[0].resolve()
    await loading
  })
}
