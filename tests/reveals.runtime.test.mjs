import { test } from 'node:test'
import assert from 'node:assert/strict'
import { astroScripts } from './helpers/bundle.mjs'
import { environment, fixture, swapBody } from './helpers/runtime.mjs'

const reveals = await fixture('reveals')
const grid = await fixture('photo-grid')
const smoothScripts = await astroScripts('src/components/SmoothScroll.astro')
const gridScripts = await astroScripts('src/components/PhotoGrid.astro')

for (const reduced of [false, true]) {
  test(`SmoothScroll: one-time sections and staggered headers survive three swaps (reduced=${reduced})`, async t => {
    const e = environment(t, { reduced })
    e.parseHTML(reveals, e.document.body)
    smoothScripts.forEach(code => e.run(code, 'SmoothScroll'))
    for (let nav = 0; nav <= 3; nav++) {
      const headers = e.document.querySelectorAll('[data-animate-header]')
      const sections = e.document.querySelectorAll('[data-animate]')
      const [scrollIO, headerIO] = e.ios.slice(-2)
      assert.equal(e.ios.filter(io => !io.disconnected).length, 2)
      assert.ok(headers.every(header => !header.classList.contains('opacity-0')))
      if (reduced) {
        assert.ok(headers.every(header => header.dataset.animated === 'true'))
        assert.equal(headerIO.targets.size, 0)
        assert.equal(e.animations.length, 0)
      } else {
        assert.ok(headers.every(header => !header.hasAttribute('data-animated')))
        assert.equal(headerIO.targets.size, 2)
        const before = e.animations.length
        headerIO.fire([[headers[0], true], [headers[1], false]])
        assert.equal(headers[0].dataset.animated, 'true')
        assert.ok(!headers[1].hasAttribute('data-animated'))
        const animations = e.animations.slice(before)
        assert.equal(animations.length, 3)
        assert.deepEqual(animations.map(animation => animation.o.delay), [0, 120, 240])
        assert.ok(animations.every(animation => animation.o.duration === 900 && animation.o.fill === 'backwards'))
        assert.ok(!headerIO.targets.has(headers[0]))
        headerIO.fire([[headers[0], true]])
        assert.equal(e.animations.length, before + 3)
        headerIO.fire([[headers[1], true]])
        assert.equal(e.animations.length, before + 5)
      }
      scrollIO.fire([[sections[0], false]])
      assert.ok(!sections[0].hasAttribute('data-visible'))
      scrollIO.fire([[sections[0], true]])
      assert.ok(sections[0].hasAttribute('data-visible'))
      assert.ok(!scrollIO.targets.has(sections[0]))
      assert.ok(scrollIO.targets.has(sections[1]))
      if (nav < 3) swapBody(e, reveals)
    }
    assert.equal(e.ios.length, 8)
    assert.ok(e.ios.slice(0, 6).every(io => io.disconnected))
    assert.equal(e.document.count('astro:before-swap'), 1)
    assert.equal(e.document.count('astro:after-swap'), 1)
  })
}

test('PhotoGrid: motion + IO opts into pending state, reveals once in visual order, and unobserves', t => {
  const e = environment(t)
  e.parseHTML(grid, e.document.body)
  const cards = e.document.querySelectorAll('.photo-card-wrap')
  gridScripts.forEach(code => e.run(code, 'PhotoGrid'))
  assert.ok(cards.every(card => card.hasAttribute('data-reveal-pending')))
  const observer = e.ios[0]
  observer.fire([[cards[0], false]])
  assert.ok(cards[0].hasAttribute('data-reveal-pending'))
  observer.fire([[cards[1], true, { top: 200, left: 0 }], [cards[0], true, { top: 100, left: 0 }]])
  assert.deepEqual(e.animations.map(animation => animation.el), cards)
  assert.deepEqual(e.animations.map(animation => animation.o.delay), [0, 60])
  assert.ok(e.animations.every(animation => animation.o.duration === 900 && animation.o.fill === 'backwards'))
  assert.ok(cards.every(card => card.dataset.animated === 'true' && !card.hasAttribute('data-reveal-pending')))
  assert.equal(observer.targets.size, 0)
  observer.fire([[cards[0], true]])
  assert.equal(e.animations.length, 2)
})

for (const options of [{ reduced: true }, { io: false }]) {
  test(`PhotoGrid: no pending attribute or animation with ${options.reduced ? 'reduced motion' : 'no IO'}`, t => {
    const e = environment(t, options)
    e.parseHTML(grid, e.document.body)
    gridScripts.forEach(code => e.run(code, 'PhotoGrid'))
    assert.ok(e.document.querySelectorAll('.photo-card-wrap').every(card => !card.hasAttribute('data-reveal-pending')))
    assert.equal(e.animations.length, 0)
    assert.equal(e.ios.length, 0)
  })
}

test('PhotoGrid: three navigations disconnect old observers and bind router events once', t => {
  const e = environment(t)
  e.parseHTML(grid, e.document.body)
  gridScripts.forEach(code => e.run(code, 'PhotoGrid'))
  for (let nav = 0; nav < 3; nav++) swapBody(e, grid)
  assert.equal(e.ios.filter(io => !io.disconnected).length, 1)
  assert.ok(e.ios.slice(0, 3).every(io => io.disconnected))
  assert.equal(e.ios.at(-1).targets.size, 2)
  assert.equal(e.document.count('astro:before-swap'), 1)
  assert.equal(e.document.count('astro:after-swap'), 1)
})

test('PhotoGrid: a large reveal batch caps stagger delays at 300ms with backwards fill', t => {
  const e = environment(t)
  e.parseHTML(grid, e.document.body)
  const wrapper = e.document.querySelector('.justified-grid')
  const template = wrapper.querySelector('.photo-card-wrap')
  for (let i = 2; i < 9; i++) {
    const card = template.cloneNode(true); card.dataset.index = String(i); wrapper.append(card)
  }
  const cards = wrapper.querySelectorAll('.photo-card-wrap')
  gridScripts.forEach(code => e.run(code, 'PhotoGrid'))
  e.ios[0].fire(cards.map((card, index) => [card, true, { top: Math.floor(index / 3) * 100, left: index % 3 * 100 }]).reverse())
  assert.deepEqual(e.animations.map(animation => animation.el), cards)
  assert.deepEqual(e.animations.map(animation => animation.o.delay), [0, 60, 120, 180, 240, 300, 300, 300, 300])
  assert.ok(e.animations.every(animation => animation.o.fill === 'backwards'))
})
