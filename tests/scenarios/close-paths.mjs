import assert from 'node:assert/strict'
import { setup, openSettled } from '../helpers/world.mjs'

export function register(test) {
  const front = (w) =>
    [w.$('lightbox-img-a'), w.$('lightbox-img-b')].find((layer) => layer.dataset.layer === 'front')
  const zoomed = (w) => w.root.dataset.zoomed !== undefined
  function matchTileAspects(w) {
    for (const [index, tile] of w.tiles.entries()) {
      const image = tile.querySelector('img')
      if (!image) continue
      const [left, top, width] = tile.rect
      image.rect = [left, top, width, (width * w.photos[index].height) / w.photos[index].width]
    }
  }
  function assertClean(w, index) {
    assert.equal(w.root.open, false)
    assert.equal(w.document.body.style.overflow, '')
    assert.equal(w.document.activeElement, w.tiles[index])
    assert.equal(w.W.captures.size, 0)
    assert.equal(w.root.style.getPropertyValue('--lb-backdrop'), '')
    assert.equal(w.W.router.length, 0)
    assert(!w.document.documentElement.classes.has('lightbox-morphing'))
    assert(!w.document.documentElement.classes.has('lightbox-morph-closing'))
    for (const image of w.document.querySelectorAll('img'))
      assert.equal(image.style.viewTransitionName, '')
  }

  test('mouse zoom is immediate during decode; unzoom and retargeted drag never close', async () => {
    const w = await setup({ finePointer: true })
    await openSettled(w, 2)
    const image = front(w)
    const r = image.getBoundingClientRect()
    w.W.decodeMode = 'manual'
    w.pointerClick(image, r.left + 100, r.top + 100)
    assert(zoomed(w))
    assert.equal(image.style.transform, 'scale(3)')
    assert.equal(w.$('lightbox-zoom').getAttribute('aria-pressed'), 'true')
    assert.equal(w.W.captures.size, 0)
    w.pointerClick(image, r.left + 100, r.top + 100)
    assert(!zoomed(w))
    assert(w.root.open)
    w.W.decodes.filter((decode) => !decode.settled).forEach((decode) => decode.resolve())
    await w.advance(500)
    assert(!zoomed(w))
    assert(w.root.open)
    w.pointerClick(image, r.left + 100, r.top + 100)
    w.pointer('pointerdown', image, r.left + 100, r.top + 100)
    w.pointer('pointermove', w.$('lightbox-stage'), r.left + 200, r.top + 200)
    w.pointer('pointerup', w.$('lightbox-stage'), r.left + 200, r.top + 200)
    w.click(w.$('lightbox-stage'))
    assert.equal(image.style.transform, 'scale(3)')
    assert(zoomed(w))
    assert(w.root.open)
    assert.equal(w.W.captures.size, 0)
  })

  test('document arrow navigation works after image focus falls to body', async () => {
    const w = await setup()
    await openSettled(w, 2)
    w.document.activeElement = w.document.body
    w.key('ArrowRight')
    await w.advance(500)
    assert.equal(w.$('lightbox-counter').textContent, '4 / 8')
    assert.equal(w.root.count('keydown'), 0)
    assert.equal(w.document.count('keydown'), 1)
    w.lb().destroy()
    assert.equal(w.document.count('keydown'), 0)
  })

  test('committed swipe remains hidden off-screen while incoming decode waits', async () => {
    const w = await setup({ finePointer: false })
    await openSettled(w, 2)
    const image = front(w)
    const r = image.getBoundingClientRect(),
      x = r.left + 500,
      y = r.top + 200
    w.W.decodeMode = 'manual'
    w.pointer('pointerdown', image, x, y, { pointerType: 'touch' })
    for (let i = 1; i <= 5; i++) {
      await w.advance(16)
      w.pointer('pointermove', image, x - i * 40, y, { pointerType: 'touch' })
    }
    w.pointer('pointerup', image, x - 200, y, { pointerType: 'touch' })
    await w.advance(300)
    assert.equal(image.style.transform, 'translateX(-100vw)')
    assert.equal(image.style.opacity, '0')
    assert.equal(image.dataset.swipedOut, '1')
    w.W.decodes.filter((decode) => !decode.settled).forEach((decode) => decode.resolve())
    await w.flush()
    await w.advance(500)
    assert.equal(w.$('lightbox-counter').textContent, '4 / 8')
    assert.equal(front(w).src, w.photos[3].thumb)
    assert.equal(image.dataset.swipedOut, undefined)
    assert.equal(image.style.transform, '')
    assert.equal(w.W.animations.filter((animation) => animation.target === image).length, 1)
  })

  test('synthetic backdrop click after a real touch drag is suppressed', async () => {
    const w = await setup({ finePointer: false })
    await openSettled(w, 2)
    const stage = w.$('lightbox-stage')
    w.pointer('pointerdown', stage, 20, 200, { pointerType: 'touch' })
    await w.advance(300)
    w.pointer('pointermove', stage, 30, 200, { pointerType: 'touch' })
    await w.advance(300)
    w.pointer('pointerup', stage, 30, 200, { pointerType: 'touch' })
    w.click(stage)
    await w.advance(100)
    assert(w.root.open)
    w.pointerClick(stage, 20, 200)
    await w.advance(1000)
    assert(!w.root.open)
  })

  test('matching tile image aspect enables open and close morphs; final front is named', async () => {
    const w = await setup()
    matchTileAspects(w)
    w.click(w.tiles[2].querySelector('img'))
    assert(w.document.documentElement.classes.has('lightbox-morphing'))
    assert.equal(w.root.open, false)
    await w.advance(1000)
    assert(w.root.open)
    assert(w.W.vtLog.some((entry) => entry.startsWith('capture-new ["lightbox-img-')))
    assert(!w.root.classes.has('lightbox-enter'))
    w.lb().next()
    await w.advance(500)
    w.lb().close()
    assert(w.document.documentElement.classes.has('lightbox-morph-closing'))
    assert(!w.root.classes.has('lightbox-exit'))
    await w.advance(1000)
    assertClean(w, 3)
    assert.equal(w.W.vtLog.filter((entry) => entry === 'start').length, 2)
    assert(w.W.vtLog.includes('capture-new ["tileimg3"] cbTook=0ms'))
  })

  const paths = {
    escape: (w) => w.key('Escape'),
    escapeUncancelable: (w) => w.key('Escape', { cancelable: false }),
    backdrop: (w) => w.pointerClick(w.$('lightbox-stage'), 20, 300),
    closeButton: (w) => w.click(w.$('lightbox-close')),
    dragDown: async (w) => {
      const image = front(w),
        r = image.getBoundingClientRect(),
        x = r.left + 200,
        y = r.top + 200
      w.pointer('pointerdown', image, x, y, { pointerType: 'touch' })
      for (let i = 1; i <= 8; i++) {
        await w.advance(16)
        w.pointer('pointermove', image, x, y + i * 20, { pointerType: 'touch' })
      }
      const backdrop = w.root.style.getPropertyValue('--lb-backdrop')
      w.pointer('pointerup', image, x, y + 160, { pointerType: 'touch' })
      if (!w.W.reducedMotion) {
        assert.equal(image.style.transform, 'translateY(160px) scale(0.92)')
        assert.equal(w.root.style.getPropertyValue('--lb-backdrop'), backdrop)
        assert(w.document.documentElement.classes.has('lightbox-morph-closing'))
      }
    },
    controllerClose: (w) => w.lb().close(),
    browserBack: (w) => w.window.history.back()
  }
  for (const reducedMotion of [false, true]) {
    for (const [name, run] of Object.entries(paths)) {
      test(`${reducedMotion ? 'reduced motion' : 'View Transition'} close path: ${name}`, async () => {
        const w = await setup({ reducedMotion, finePointer: name !== 'dragDown' })
        matchTileAspects(w)
        await openSettled(w, 2)
        w.lb().next()
        await w.advance(600)
        w.W.hist.length = 0
        await run(w)
        await w.advance(2000)
        assertClean(w, 3)
        assert.equal(w.W.hist.filter((entry) => entry === 'back()').length, 1)
        assert.equal(w.$('lightbox-stage').count('pointerdown'), 1)
        if (reducedMotion) {
          assert.equal(w.W.animations.length, 0)
          assert.equal(w.W.vtLog.length, 0)
        }
      })
    }
  }
}
