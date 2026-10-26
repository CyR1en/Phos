import assert from 'node:assert/strict'
import { setup, openSettled } from '../helpers/world.mjs'
import { fixture } from '../helpers/context.mjs'

export function register(check) {
  check(
    'open pushes synchronously and never awaits a frozen crossfade inside View Transition',
    async () => {
      const w = await setup({ freezeDuringVT: true, init: false })
      for (const tile of w.tiles) tile.children[0].rect = [20, 100, 280, (280 * 2) / 3]
      w.mod.initLightbox()
      w.click(w.tiles[2].children[0])
      assert.ok(w.W.hist.some((entry) => entry.startsWith('push ')))
      await w.advance(700)
      assert.ok(w.root.open)
      assert.ok(w.W.vtLog.some((entry) => entry.includes('cbTook=0ms')))
      assert.ok(!w.W.vtLog.some((entry) => entry.includes('skipTransition')))
      assert.equal(w.W.animations.length, 0)
    }
  )

  check('Back before the first morph callback cancels the pending open', async () => {
    const w = await setup({ init: false })
    for (const tile of w.tiles) tile.children[0].rect = [20, 100, 280, (280 * 2) / 3]
    w.mod.initLightbox()
    w.click(w.tiles[2].children[0])
    assert.equal(w.root.open, false)
    w.window.history.back()
    await w.advance(700)
    assert.equal(w.root.open, false)
    assert.equal(w.lb().isOpen(), false)
    assert.equal(w.window.location.hash, '')
    assert.equal(w.W.router.length, 0)
    assert.equal(w.document.body.style.overflow, '')
  })

  check(
    'rapid navigation commits the in-flight fade before selecting the next back layer',
    async () => {
      const { w, ctx, nav, after } = fixture()
      const first = nav.show(1, 1)
      await w.flush()
      const firstIncoming = ctx.backLayer()
      const firstEffects = [...w.W.animations]
      assert.equal(firstEffects.length, 2)
      const second = nav.show(2, 1)
      assert.equal(ctx.frontLayer(), firstIncoming)
      assert.equal(ctx.frontLayer().src, w.photos[1].thumb)
      assert.ok(firstEffects.every((effect) => effect.playState === 'idle'))
      assert.deepEqual(after, [1])
      await w.advance(400)
      await Promise.all([first, second])
      assert.equal(ctx.frontLayer().src, w.photos[2].thumb)
      assert.equal(ctx.backLayer().src, '')
      assert.deepEqual(after, [1, 2])
      assert.equal(w.liveAnims().length, 0)
    }
  )

  check('instant navigation waits for the thumb then swaps without WAAPI', async () => {
    const { w, ctx, nav } = fixture({ decodeMode: 'manual' })
    const incoming = ctx.backLayer()
    const showing = nav.show(1, 0, { instant: true })
    assert.notEqual(ctx.frontLayer(), incoming)
    w.W.decodes.find((decode) => decode.img === incoming && !decode.settled).resolve()
    await showing
    assert.equal(ctx.frontLayer(), incoming)
    assert.equal(w.W.animations.length, 0)
  })

  for (const marker of ['swiped', 'opacity'])
    check(`skip leaving animation when outgoing is ${marker}`, async () => {
      const { w, ctx, nav } = fixture()
      const outgoing = ctx.frontLayer()
      if (marker === 'swiped') outgoing.dataset.swipedOut = ''
      else {
        const computed = globalThis.getComputedStyle
        globalThis.getComputedStyle = (el) => (el === outgoing ? { opacity: '0' } : computed(el))
      }
      outgoing.style.transform = 'translateX(-100vw)'
      const showing = nav.show(1, 1)
      await w.flush()
      assert.equal(w.W.animations.length, 1)
      assert.equal(outgoing.src, '')
      assert.equal(outgoing.dataset.swipedOut, undefined)
      assert.equal(outgoing.style.opacity, '0')
      await w.advance(400)
      await showing
      assert.equal(ctx.backLayer().style.opacity, '')
    })

  check('caption and alt policy, one live write after swap, and deduplication', async () => {
    const { w, ctx, nav } = fixture()
    ctx.state.photos[1] = {
      ...w.photos[1],
      titleIsAuto: true,
      description: 'Clouds over the mountains'
    }
    const writes = []
    Object.defineProperty(ctx.els.live, 'textContent', {
      configurable: true,
      get() {
        return this._text
      },
      set(value) {
        this._text = value
        writes.push(value)
      }
    })
    const showing = nav.show(1, 1)
    await w.flush()
    assert.equal(writes.length, 0)
    assert.equal(ctx.els.title.hidden, true)
    assert.equal(ctx.els.description.textContent, 'Clouds over the mountains')
    await w.advance(400)
    await showing
    assert.equal(ctx.frontLayer().alt, 'Clouds over the mountains')
    assert.deepEqual(writes, ['Photo 2 of 8'])
    nav.announce()
    await nav.show(1, 0, { instant: true })
    assert.deepEqual(writes, ['Photo 2 of 8'])
    ctx.els.live.textContent = ''
    nav.announce()
    assert.equal(writes.at(-1), 'Photo 2 of 8')
  })

  check('failed navigation identifies the failed photo and success clears data-error', async () => {
    const { w, ctx, loader, nav } = fixture()
    const photo = w.photos[1]
    w.W.failUrls.add(photo.thumb)
    w.W.failUrls.add(`srcset:${photo.srcset}|${loader.displayWidth(photo)}px`)
    await nav.show(1, 1)
    assert.equal(ctx.els.root.dataset.error, '')
    assert.equal(ctx.els.error.hidden, false)
    assert.equal(ctx.els.counter.textContent, '2 / 8')
    assert.equal(ctx.els.title.textContent, photo.title)
    assert.equal(ctx.els.live.textContent, 'Photo 2 of 8 couldn\'t be loaded')
    assert.equal(ctx.frontLayer().src, w.photos[0].thumb)
    await nav.show(2, 0, { instant: true })
    assert.equal(ctx.els.root.dataset.error, undefined)
    assert.equal(ctx.els.error.hidden, true)
  })

  check(
    'setPhotos preserves photoKey across reorder and falls back to zero after removal',
    async () => {
      const { w, ctx, nav } = fixture()
      ctx.state.index = 5
      nav.setPhotos([w.photos[4], w.photos[5], w.photos[6]])
      assert.equal(ctx.state.index, 1)
      await w.flush()
      assert.equal(ctx.frontLayer().src, w.photos[5].thumb)
      assert.equal(w.W.animations.length, 0)
      nav.setPhotos([w.photos[4]])
      assert.equal(ctx.state.index, 0)
      await w.flush()
      assert.equal(ctx.frontLayer().src, w.photos[4].thumb)
    }
  )

  check(
    'early zoom applies srcset and sizes before decode, late display HD keeps larger sizes',
    async () => {
      const { w, ctx, loader } = fixture({ decodeMode: 'manual' })
      const img = ctx.frontLayer()
      const photo = w.photos[0]
      const loading = loader.load(img, photo, 0)
      w.W.decodes[0].resolve()
      await loading
      const display = w.W.decodes.find((decode) => decode.img !== img && !decode.settled)
      let settled = false
      const upgrading = loader.upgrade(img, photo, 3000.1).then(() => {
        settled = true
      })
      const larger = w.W.decodes.at(-1)
      assert.equal(img.srcset, photo.srcset)
      assert.equal(img.sizes, '3001px')
      assert.equal(larger.img.srcset, photo.srcset)
      assert.equal(larger.img.sizes, '3001px')
      await w.flush()
      assert.equal(settled, false)
      display.resolve()
      await w.flush()
      assert.equal(img.sizes, '3001px')
      larger.resolve()
      await upgrading
      const failed = loader.upgrade(img, photo, 3200)
      w.W.decodes.at(-1).reject(new Error('decode failed'))
      await failed
    }
  )

  check('main-image alt always has description, authored title, or category fallback', async () => {
    const { ctx, loader } = fixture()
    for (const [overrides, expected] of [
      [{ titleIsAuto: true }, 'wedding photograph'],
      [{ titleIsAuto: true, category: undefined }, 'photograph'],
      [{ title: 'An authored title', titleIsAuto: false }, 'An authored title'],
      [{ titleIsAuto: true, description: 'A description' }, 'A description']
    ]) {
      await loader.load(
        ctx.frontLayer(),
        { ...ctx.state.photos[0], ...overrides },
        ++ctx.state.navToken
      )
      assert.equal(ctx.frontLayer().alt, expected)
    }
  })

  check('close clears both layers, live text, errors, and backdrop before reopening', async () => {
    const w = await setup({ vt: false })
    await openSettled(w, 1)
    w.root.dataset.error = ''
    w.root.style.setProperty('--lb-backdrop', '.4')
    w.lb().close()
    await w.advance(600)
    for (const img of [w.$('lightbox-img-a'), w.$('lightbox-img-b')]) {
      for (const attr of ['src', 'srcset', 'sizes']) assert.equal(img.getAttribute(attr), null)
      assert.equal(img.alt, '')
      for (const prop of ['width', 'aspectRatio', 'transform', 'opacity'])
        assert.equal(img.style[prop], '')
    }
    assert.equal(w.$('lightbox-live').textContent, '')
    assert.equal(w.root.dataset.error, undefined)
    assert.equal(w.root.style.getPropertyValue('--lb-backdrop'), '')
    w.W.decodeMode = 'manual'
    w.lb().open(5)
    await w.flush()
    const front = [w.$('lightbox-img-a'), w.$('lightbox-img-b')].find(
      (img) => img.dataset.layer === 'front'
    )
    const back = [w.$('lightbox-img-a'), w.$('lightbox-img-b')].find(
      (img) => img.dataset.layer === 'back'
    )
    assert.equal(front.src, '')
    assert.equal(back.getAttribute('aria-hidden'), 'true')
    assert.equal(front.getAttribute('aria-hidden'), null)
  })

  check('controller creates exactly two cached media queries', async () => {
    const w = await setup({ init: false, vt: false })
    let count = 0
    const matchMedia = w.window.matchMedia
    w.window.matchMedia = (query) => {
      count++
      return matchMedia(query)
    }
    w.mod.initLightbox()
    await openSettled(w, 1)
    w.lb().next()
    await w.advance(400)
    w.lb().close()
    await w.advance(600)
    assert.equal(count, 2)
  })

  for (const visibility of ['checkVisibility', 'offsetParent'])
    check(`tileFor selects the visible duplicate using ${visibility}`, async () => {
      const w = await setup({ init: false })
      for (const tile of w.tiles) tile.children[0].rect = [20, 100, 280, (280 * 2) / 3]
      // The original fake DOM has neither of these browser APIs.
      if (visibility === 'checkVisibility')
        w.El.prototype.checkVisibility = function () {
          return this.style.display !== 'none'
        }
      else
        Object.defineProperty(w.El.prototype, 'offsetParent', {
          get() {
            return this.style.display === 'none' ? null : this.parentNode
          },
          configurable: true
        })
      w.mod.initLightbox()
      let index = 0
      for (const tile of w.tiles) {
        const visible = tile.dataset.category === 'street'
        tile.style.display = visible ? '' : 'none'
        if (visible) tile.dataset.index = String(index++)
      }
      w.window.__updateLightboxData(w.photos.filter((photo) => photo.category === 'street'))
      w.lb().open(2)
      await w.advance(700)
      assert.ok(w.W.vtLog.includes('capture-old ["tileimg6"]'))
      w.lb().next()
      await w.advance(400)
      w.lb().close()
      await w.advance(700)
      assert.equal(w.document.activeElement.id, 'tile7')
      assert.ok(w.W.vtLog.some((entry) => entry.includes('capture-new ["tileimg7"]')))
    })
}
