import { test } from 'node:test'
import assert from 'node:assert/strict'
import { astroScripts } from './helpers/bundle.mjs'
import { environment, fixture, swapBody } from './helpers/runtime.mjs'

const reveals = await fixture('reveals')
const grid = await fixture('photo-grid')
const smoothScripts = await astroScripts('src/components/SmoothScroll.astro')
const gridScripts = await astroScripts('src/components/PhotoGrid.astro')

for (const token of ['cubic-bezier(0.2, 0.3, 0.4, 1)', '']) {
  for (const component of ['SmoothScroll', 'PhotoGrid']) {
    test(`${component}: animate receives ${token ? 'the computed easing token' : 'the literal fallback'}`, t => {
      const e = environment(t)
      const reads = []
      globalThis.getComputedStyle = root => {
        assert.equal(root, e.document.documentElement)
        return { getPropertyValue: name => { reads.push(name); return token ? `  ${token}  ` : ' \n ' } }
      }
      e.parseHTML(component === 'SmoothScroll' ? reveals : grid, e.document.body)
      ;(component === 'SmoothScroll' ? smoothScripts : gridScripts).forEach(code => e.run(code, component))
      const target = e.document.querySelector(component === 'SmoothScroll' ? '[data-animate-header]' : '.photo-card-wrap')
      e.ios.find(io => io.targets.has(target)).fire([[target, true]])
      assert.ok(e.animations.length > 0, 'the observed element actually animates')
      assert.ok(reads.includes('--ease-out-expo'))
      assert.deepEqual([...new Set(e.animations.map(animation => animation.o.easing))], [token || 'cubic-bezier(.16,1,.3,1)'])
    })
  }
}

test('SmoothScroll: reveal-timeout makes sections and headers visible without animation and stamps readiness', t => {
  const e = environment(t)
  e.document.documentElement.classList.add('reveal-timeout')
  e.parseHTML(reveals, e.document.body)
  smoothScripts.forEach(code => e.run(code, 'SmoothScroll'))
  const sections = e.document.querySelectorAll('[data-animate]')
  const headers = e.document.querySelectorAll('[data-animate-header]')
  assert.ok(sections.length > 0 && headers.length > 0)
  assert.ok(sections.every(section => section.hasAttribute('data-visible')))
  assert.ok(headers.every(header => header.dataset.animated === 'true'))
  for (const io of e.ios) io.fire([...io.targets].map(target => [target, true]))
  assert.equal(e.animations.length, 0)
  assert.ok(e.document.documentElement.hasAttribute('data-reveals-ready'))
})

test('PhotoGrid: reveal-timeout never opts cards into pending hiding', t => {
  const e = environment(t)
  e.document.documentElement.classList.add('reveal-timeout')
  e.parseHTML(grid, e.document.body)
  gridScripts.forEach(code => e.run(code, 'PhotoGrid'))
  const cards = e.document.querySelectorAll('.photo-card-wrap')
  assert.ok(cards.length > 0)
  assert.ok(cards.every(card => !card.hasAttribute('data-reveal-pending')))
  assert.equal(e.animations.length, 0)
})

test('PhotoGrid: pending hiding is cleared before animate even when animate throws', t => {
  const e = environment(t)
  e.parseHTML(grid, e.document.body)
  gridScripts.forEach(code => e.run(code, 'PhotoGrid'))
  const card = e.document.querySelector('.photo-card-wrap')
  assert.ok(card.hasAttribute('data-reveal-pending'))
  let calls = 0
  let pendingAtAnimate
  const animate = card.animate
  card.animate = () => {
    calls++
    pendingAtAnimate = card.hasAttribute('data-reveal-pending')
    card.animate = animate
    throw new Error('WAAPI unavailable')
  }
  try { e.ios[0].fire([[card, true]]) }
  catch (error) { assert.equal(error.message, 'WAAPI unavailable') }
  assert.equal(calls, 1, 'the throwing animate stub was reached')
  assert.equal(pendingAtAnimate, false)
  assert.ok(!card.hasAttribute('data-reveal-pending'))
})

for (const reduced of [false, true]) {
  test(`SmoothScroll: every init stamps data-reveals-ready (reduced=${reduced})`, t => {
    const e = environment(t, { reduced })
    e.parseHTML(reveals, e.document.body)
    smoothScripts.forEach(code => e.run(code, 'SmoothScroll'))
    for (let nav = 0; nav <= 3; nav++) {
      assert.equal(e.document.documentElement.getAttribute('data-reveals-ready'), '', 'init ' + nav)
      e.document.documentElement.removeAttribute('data-reveals-ready')
      if (nav < 3) swapBody(e, reveals)
    }
  })
}

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
