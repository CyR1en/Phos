import assert from 'node:assert/strict'
import { fixture } from '../helpers/context.mjs'

export function register(test) {
  test('rapid navigation before decode commits only the newest request with directional fades', async () => {
    const { w, ctx, nav, after } = fixture({ decodeMode: 'manual' })
    const first = nav.show(1, 1)
    const stale = w.W.decodes.at(-1)
    const second = nav.show(2, 1)
    stale.resolve()
    await first
    assert.deepEqual(after, [])
    assert.equal(w.W.animations.length, 0)
    w.W.decodes.at(-1).resolve()
    await w.flush()
    assert.equal(w.W.animations.length, 2)
    const [incoming, outgoing] = w.W.animations
    assert.deepEqual(incoming.keyframes, [
      { opacity: 0, transform: 'translateX(24px)' },
      { opacity: 1, transform: 'none' }
    ])
    assert.equal(incoming.duration, 320)
    assert.equal(incoming.easing, 'cubic-bezier(.16,1,.3,1)')
    assert.deepEqual(outgoing.keyframes, [
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: 'translateX(-24px)' }
    ])
    assert.equal(outgoing.duration, 220)
    await w.advance(400)
    await second
    assert.equal(ctx.frontLayer().src, w.photos[2].thumb)
    assert.equal(ctx.backLayer().src, '')
    assert.deepEqual(after, [2])
    assert.equal(w.liveAnims().length, 0)
  })

  for (const missingWaapi of [true, false]) {
    test(`${missingWaapi ? 'missing WAAPI swaps instantly' : 'no-direction navigation fades without translation'}`, async () => {
      const { w, ctx, nav } = fixture()
      if (missingWaapi) ctx.frontLayer().animate = undefined
      const showing = nav.show(1, 0)
      await w.flush()
      if (!missingWaapi) {
        assert.deepEqual(w.W.animations[0].keyframes, [{ opacity: 0 }, { opacity: 1 }])
        assert.deepEqual(w.W.animations[1].keyframes, [{ opacity: 1 }, { opacity: 0 }])
        await w.advance(400)
      }
      await showing
      assert.equal(ctx.frontLayer().src, w.photos[1].thumb)
      assert.equal(w.W.animations.length, missingWaapi ? 0 : 2)
    })
  }

  test('reduced motion swaps without animation', async () => {
    const { w, ctx, nav } = fixture({ reducedMotion: true })
    await nav.show(1, -1)
    assert.equal(ctx.frontLayer().src, w.photos[1].thumb)
    assert.equal(w.W.animations.length, 0)
  })

  test('bounds, next/prev and announcements never drift the index', async () => {
    const { w, ctx, nav, after } = fixture({ reducedMotion: true })
    nav.announce()
    assert.equal(ctx.els.prevBtn.disabled, true)
    assert.equal(ctx.els.nextBtn.disabled, false)
    assert.equal(ctx.els.live.textContent, 'Photo 1 of 8')
    await nav.show(-1, -1)
    await nav.show(8, 1)
    assert.equal(ctx.state.navToken, 0)
    nav.next()
    await w.flush()
    nav.prev()
    await w.flush()
    assert.equal(ctx.state.index, 0)
    assert.deepEqual(after, [1, 0])
  })

  for (const open of [true, false]) {
    test(`empty ${open ? 'open' : 'closed'} filter reset invalidates in-flight navigation`, async () => {
      const { w, ctx, nav, after } = fixture({ decodeMode: 'manual' })
      const showing = nav.show(1, 1)
      ctx.state.open = open
      nav.setPhotos([])
      w.W.decodes[0].resolve()
      await showing
      assert.equal(ctx.state.index, 0)
      assert.deepEqual(after, [])
      if (open) {
        assert.equal(ctx.els.counter.textContent, '0 / 0')
        assert.equal(ctx.els.live.textContent, 'No photos')
        assert.equal(ctx.els.prevBtn.disabled, true)
        assert.equal(ctx.els.nextBtn.disabled, true)
      }
    })
  }

  test('failed newest request preserves the photo committed by a superseded crossfade', async () => {
    const { w, ctx, loader, nav, after } = fixture()
    const first = nav.show(1, 1)
    await w.flush()
    const photo = w.photos[2]
    w.W.failUrls.add(photo.thumb)
    w.W.failUrls.add(`srcset:${photo.srcset}|${loader.displayWidth(photo)}px`)
    const second = nav.show(2, 1)
    await Promise.all([first, second])
    assert.equal(ctx.frontLayer().src, w.photos[1].thumb)
    assert.equal(w.opacityOf(ctx.backLayer()), 0)
    assert.equal(ctx.els.error.hidden, false)
    assert.equal(ctx.els.live.textContent, 'Photo 3 of 8 couldn\'t be loaded')
    assert.equal(w.liveAnims().length, 0)
    assert.deepEqual(after, [1])
  })
}
