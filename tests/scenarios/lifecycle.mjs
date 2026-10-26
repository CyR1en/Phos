import assert from 'node:assert/strict'
import { setup, openSettled } from '../helpers/world.mjs'

export function register(test) {
  test('route teardown removes listeners and hooks; repeated initialization creates one controller', async () => {
    const w = await setup()
    await openSettled(w, 2)
    const controller = w.lb(),
      root = w.root,
      stage = w.$('lightbox-stage')
    w.dispatch(w.document, 'astro:before-swap')
    controller.destroy()
    assert.equal(root.open, false)
    assert.equal(w.document.body.style.overflow, '')
    assert.equal(w.window.__phosLightbox, undefined)
    assert.equal(w.window.__updateLightboxData, undefined)
    assert.equal(w.document.count('click', true), 0)
    assert.equal(w.document.count('keydown'), 0)
    assert.equal(w.window.count('popstate', true), 0)
    assert.equal(stage.count('pointerdown'), 0)
    assert.equal(w.liveAnims().length, 0)
    w.rebuild({ lightbox: false })
    assert.doesNotThrow(() => w.mod.initLightbox())
    w.rebuild()
    w.mod.initLightbox()
    w.mod.initLightbox()
    assert.equal(w.document.count('click', true), 1)
    assert.equal(w.document.count('astro:before-swap'), 1)
    assert.equal(w.window.count('popstate', true), 1)
    await openSettled(w, 1)
    assert.equal(w.$('lightbox-counter').textContent, '2 / 8')
  })

  test('teardown during a pending morph cannot reopen the dialog after decode completes', async () => {
    const w = await setup({ decodeMode: 'manual' })
    for (const tile of w.tiles) tile.children[0].rect = [20, 100, 280, (280 * 2) / 3]
    w.click(w.tiles[2].children[0])
    w.lb().destroy()
    await w.advance(1500)
    assert.equal(w.root.open, false)
    assert.equal(w.document.body.style.overflow, '')
    assert.equal(w.document.count('click', true), 0)
    assert.equal(w.window.__updateLightboxData, undefined)
    assert.equal(w.document.documentElement.classes.has('lightbox-morphing'), false)
  })

  test('modified, non-primary and previously prevented photo clicks keep native anchor behavior', async () => {
    const w = await setup()
    for (const init of [
      { metaKey: true },
      { ctrlKey: true },
      { altKey: true },
      { shiftKey: true },
      { button: 1 }
    ]) {
      assert.equal(w.click(w.tiles[1], init).defaultPrevented, false)
    }
    w.click(w.tiles[1], { defaultPrevented: true })
    await w.advance(500)
    assert.equal(w.root.open, false)
    assert.equal(w.W.hist.length, 0)
  })

  test('malformed or non-array lightbox JSON yields an inert empty viewer', async () => {
    const w = await setup({ init: false })
    for (const json of ['{broken', '{}', 'null']) {
      w.$('lightbox-data').textContent = json
      assert.doesNotThrow(() => w.mod.initLightbox())
      w.lb().open(0)
      w.click(w.tiles[0])
      await w.advance(30)
      assert.equal(w.root.open, false)
    }
  })

  for (const options of [{ vt: true }, { vt: false }, { reducedMotion: true }]) {
    test(`synchronous filter preserves a deep-linked photo (${JSON.stringify(options)})`, async () => {
      const w = await setup({
        ...options,
        url: 'https://phos.test/photos/all/?cat=street#photo=street/sample-06'
      })
      let index = 0
      for (const tile of w.tiles) {
        const visible = tile.dataset.category === 'street'
        tile.style.display = visible ? '' : 'none'
        if (visible) tile.dataset.index = String(index++)
      }
      w.window.__updateLightboxData(w.photos.filter((photo) => photo.category === 'street'))
      await w.advance(1500)
      assert.equal(w.root.open, true)
      assert.equal(w.$('lightbox-counter').textContent, '2 / 4')
      assert.equal(decodeURIComponent(w.window.location.hash), '#photo=street/sample-06')
      assert.equal(w.W.hist.filter((entry) => entry.startsWith('push ')).length, 0)
      assert.equal(w.W.router.length, 0)
    })
  }

  test('reopening during a pending exit cancels close work and preserves scroll lock', async () => {
    const w = await setup({ vt: false })
    await openSettled(w, 2)
    w.lb().close()
    await w.advance(100)
    w.lb().open(4)
    await w.advance(2000)
    assert.equal(w.root.open, true)
    assert.equal(w.document.body.style.overflow, 'hidden')
    assert.equal(w.$('lightbox-counter').textContent, '5 / 8')
    assert.equal(decodeURIComponent(w.window.location.hash), '#photo=street/sample-05')
  })
}
