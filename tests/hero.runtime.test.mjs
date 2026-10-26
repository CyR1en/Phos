import { test } from 'node:test'
import assert from 'node:assert/strict'
import { astroScripts } from './helpers/bundle.mjs'
import { environment, fixture, swapBody } from './helpers/runtime.mjs'

const html = await fixture('hero')
const scripts = await astroScripts('src/components/Hero.astro')
function boot(t, options = {}) {
  const e = environment(t, options)
  e.parseHTML(html, e.document.body)
  if (options.firstComplete) {
    const image = e.document.querySelector('[data-hero-slide="0"] img')
    image.complete = true; image.naturalWidth = 3840
  }
  options.beforeScripts?.(e)
  scripts.forEach(code => e.run(code, 'Hero'))
  e.slides = e.document.querySelectorAll('[data-hero-slide]')
  e.img = i => e.slides[i].querySelector('img')
  e.hero = e.document.querySelector('[data-hero-interval]')
  e.heroIO = e.ios.at(-1)
  e.dot = i => e.document.querySelector(`[data-hero-dot="${i}"]`)
  return e
}
const emit = (e, target, type, init = {}) => e.dispatch(target, new e.Ev(type, { bubbles: true, ...init }))
const autoplay = e => e.timers.filter(timer => timer.at === e.now + 6000)
async function show(e, i) {
  e.dot(i).click(); e.img(i)._load(); await e.advance(0)
}

test('Hero: first-load reveal waits for decode; idle promotes sources before img and leaves slide 2 cold', async t => {
  const e = boot(t), first = e.img(0)
  assert.equal(first.style.opacity, '0')
  assert.equal(first.getAttribute('style'), 'object-position: 34% 50%')
  assert.equal(e.idles.size, 0)
  assert.ok(!e.img(1).hasAttribute('src'))
  first._load(); await e.advance(0)
  const reveal = e.animations.find(a => a.el === first)
  assert.equal(reveal.o.duration, 900)
  assert.equal(reveal.o.fill, 'both')
  assert.equal(first.style.opacity, '')
  assert.equal(e.idles.size, 1)
  assert.ok(e.img(1).hasAttribute('data-src'))
  await e.idle()
  const mutations = e.img(1)._fetches
  const firstImg = mutations.findIndex(mutation => mutation.why.startsWith('img.'))
  assert.ok(firstImg > 0)
  assert.ok(mutations.slice(0, firstImg).every(mutation => mutation.why.startsWith('source.')))
  assert.ok(mutations.slice(firstImg).every(mutation => mutation.why.startsWith('img.')))
  for (const source of e.slides[1].querySelectorAll('source')) {
    assert.ok(source.hasAttribute('srcset') && source.hasAttribute('sizes'))
    assert.ok(!source.hasAttribute('data-srcset') && !source.hasAttribute('data-sizes'))
  }
  for (const attribute of ['data-src', 'data-srcset', 'data-sizes']) assert.ok(!e.img(1).hasAttribute(attribute))
  assert.match(e.img(1)._stable.chosen, /hero-portrait\/second\.avif/)
  assert.ok(e.img(2).hasAttribute('data-src'))
})

test('Hero: autoplay crossfades, updates credit/roles/dots and warms the next slide', async t => {
  const e = boot(t, { firstComplete: true })
  await e.idle()
  e.heroIO.fire([[e.hero, true]])
  assert.equal(e.hero.dataset.heroPaused, 'false')
  await e.advance(6000)
  e.img(1)._load(); await e.advance(0)
  const incoming = e.slides[1]
  assert.ok(incoming.classList.contains('is-active'))
  assert.equal(incoming.style.opacity, '1')
  assert.equal(incoming.style.zIndex, '2')
  assert.ok(!e.img(2).hasAttribute('data-src'))
  assert.equal(e.document.querySelector('[data-hero-credit]').textContent, 'Wedding Photography')
  assert.equal(incoming.getAttribute('role'), 'img')
  assert.equal(e.slides[0].getAttribute('aria-hidden'), 'true')
  assert.equal(e.dot(1).getAttribute('aria-current'), 'true')
  assert.ok(!e.dot(0).hasAttribute('aria-current'))
  emit(e, e.img(1), 'transitionend', { propertyName: 'opacity' })
  emit(e, incoming, 'transitionend', { propertyName: 'transform' })
  assert.equal(incoming.style.zIndex, '2', 'ignore child and unrelated transitions')
  emit(e, incoming, 'transitionend', { propertyName: 'opacity' })
  assert.equal(incoming.style.zIndex, '1')
  assert.equal(e.slides[0].style.opacity, '0')
  assert.equal(autoplay(e).length, 1)
})

test('Hero: dot navigation updates credit href and fallback finishes crossfade at 1600ms', async t => {
  const e = boot(t, { firstComplete: true })
  await show(e, 2)
  const credit = e.document.querySelector('[data-hero-credit]')
  assert.equal(credit.textContent, 'Third · Credit')
  assert.equal(credit.getAttribute('href'), '/photos/all/?cat=third')
  assert.equal(e.dot(2).getAttribute('aria-current'), 'true')
  await e.advance(1599); assert.equal(e.slides[2].style.zIndex, '2')
  await e.advance(1); assert.equal(e.slides[2].style.zIndex, '1')
  assert.equal(e.slides[0].style.opacity, '0')
})

for (const reason of ['hover', 'focus', 'visibility', 'offscreen', 'user']) {
  test(`Hero: pauses and resumes for ${reason}`, async t => {
    const e = boot(t, { firstComplete: true })
    e.heroIO.fire([[e.hero, true]])
    const controls = e.document.querySelector('.hero-controls')
    const pause = e.document.querySelector('.hero-pause')
    function set(paused) {
      if (reason === 'hover') emit(e, controls, paused ? 'mouseenter' : 'mouseleave')
      if (reason === 'focus') {
        e.focusVisible = paused
        if (paused) e.dot(0).focus()
        else e.document.body.focus()
      }
      if (reason === 'visibility') { e.document.hidden = paused; e.fire('visibilitychange') }
      if (reason === 'offscreen') e.heroIO.fire([[e.hero, !paused]])
      if (reason === 'user') pause.click()
    }
    assert.equal(autoplay(e).length, 1)
    set(true)
    assert.equal(e.hero.dataset.heroPaused, 'true')
    assert.equal(autoplay(e).length, 0)
    await e.advance(10000)
    assert.ok(e.slides[0].classList.contains('is-active'))
    if (reason === 'user') assert.equal(pause.getAttribute('aria-pressed'), 'true')
    set(false)
    assert.equal(e.hero.dataset.heroPaused, 'false')
    assert.equal(autoplay(e).length, 1)
  })
}

test('Hero: cached first image stays visible and schedules one idle warm', t => {
  const e = boot(t, { firstComplete: true })
  assert.equal(e.img(0).style.opacity, '')
  assert.equal(e.animations.length, 0)
  assert.equal(e.idles.size, 1)
})

test('Hero: absent requestIdleCallback uses 1500ms warming fallback', async t => {
  const e = boot(t, { firstComplete: true, idle: false })
  assert.equal(typeof globalThis.requestIdleCallback, 'undefined')
  assert.ok(e.timers.some(timer => timer.at === 1500))
  await e.advance(1499); assert.ok(e.img(1).hasAttribute('data-src'))
  await e.advance(1); assert.ok(!e.img(1).hasAttribute('data-src'))
})

test('Hero: cleanup before first load ignores late decode/load', async t => {
  const e = boot(t)
  e.fire('astro:before-swap')
  assert.equal(e.img(0).style.opacity, '')
  e.img(0)._load(); await e.advance(2000)
  assert.equal(e.idles.size, 0)
  assert.equal(e.animations.length, 0)
  assert.equal(e.timers.length, 0)
  assert.ok(e.heroIO.disconnected)
})

test('Hero: cleanup cancels pending idle callback and autoplay listeners', async t => {
  const e = boot(t, { firstComplete: true })
  e.heroIO.fire([[e.hero, true]])
  assert.equal(e.idles.size, 1)
  e.fire('astro:before-swap')
  assert.equal(e.idles.size, 0)
  assert.equal(e.document.querySelector('.hero-pause').count('click'), 0)
  assert.equal(e.document.count('visibilitychange'), 0)
  await e.advance(20000)
  assert.equal(e.timers.length, 0)
})

test('Hero: cleanup during crossfade removes transition listener, fallback and reveal animation', async t => {
  const e = boot(t)
  e.img(0)._load(); await e.advance(0)
  await show(e, 1)
  e.fire('astro:before-swap')
  assert.equal(e.slides[1].count('transitionend'), 0)
  assert.ok(e.animations.every(animation => animation.playState === 'idle'))
  await e.advance(20000)
  assert.equal(e.timers.length, 0)
})

test('Hero: reduced motion has no speculative warming/autoplay; dots switch directly', async t => {
  const e = boot(t, { reduced: true })
  assert.equal(e.img(0).style.opacity, '')
  assert.equal(e.idles.size, 0)
  assert.equal(e.timers.length, 0)
  e.heroIO.fire([[e.hero, true]])
  assert.equal(e.hero.dataset.heroPaused, 'true')
  assert.equal(e.timers.length, 0)
  await show(e, 1)
  assert.ok(e.slides[1].classList.contains('is-active'))
  assert.equal(e.slides[1].style.transition, 'none')
  assert.ok(e.img(2).hasAttribute('data-src'))
  assert.equal(e.animations.length, 0)
})

test('Hero: enabling reduced motion cancels reveal and prevents autoplay', async t => {
  const e = boot(t)
  e.img(0)._load(); await e.advance(0)
  e.heroIO.fire([[e.hero, true]])
  e.reduced = true
  e.mqListeners.find(mq => mq.media.includes('reduced-motion')).dispatchEvent(new e.Ev('change'))
  assert.equal(e.animations[0].playState, 'idle')
  assert.equal(e.img(0).style.opacity, '')
  assert.equal(e.hero.dataset.heroPaused, 'true')
  assert.equal(autoplay(e).length, 0)
})

test('Hero: three home navigations keep one observer, constant listeners and one warm request', async t => {
  const e = boot(t, { firstComplete: true })
  for (let n = 0; n < 3; n++) swapBody(e, html)
  assert.equal(e.ios.filter(io => !io.disconnected).length, 1)
  assert.equal(e.document.count('astro:before-swap'), 1)
  assert.equal(e.document.count('astro:after-swap'), 1)
  assert.equal(e.idles.size, 0)
  e.document.querySelector('[data-hero-slide="0"] img')._load(); await e.advance(0)
  assert.equal(e.idles.size, 1)
})

test('Hero: pointer focus does not pause and clears a previous keyboard pause', t => {
  const e = boot(t, { firstComplete: true })
  e.heroIO.fire([[e.hero, true]])
  e.focusVisible = false; e.dot(0).focus()
  assert.equal(e.hero.dataset.heroPaused, 'false')
  assert.equal(autoplay(e).length, 1)
  e.focusVisible = true; e.dot(1).focus()
  assert.equal(e.hero.dataset.heroPaused, 'true')
  e.focusVisible = false; e.dot(2).focus()
  assert.equal(e.hero.dataset.heroPaused, 'false')
  assert.equal(autoplay(e).length, 1)
})

test('Hero: a pause beginning during decode aborts an automatic slide', async t => {
  const e = boot(t, { firstComplete: true })
  e.heroIO.fire([[e.hero, true]])
  await e.advance(6000)
  assert.ok(e.img(1)._decodeResolvers.length, 'automatic request is waiting for decode')
  e.document.querySelector('.hero-pause').click()
  e.img(1)._load(); await e.advance(0)
  assert.ok(e.slides[0].classList.contains('is-active'))
  assert.ok(!e.slides[1].classList.contains('is-active'))
  assert.equal(e.dot(0).getAttribute('aria-current'), 'true')
  assert.equal(e.hero.dataset.heroPaused, 'true')
  assert.equal(autoplay(e).length, 0)
})

for (const newestFirst of [false, true]) {
  test(`Hero: rapid dot clicks only activate the latest decoded request (newestFirst=${newestFirst})`, async t => {
    const e = boot(t, { firstComplete: true })
    e.dot(1).click(); e.dot(2).click()
    if (newestFirst) { e.img(2)._load(); await e.advance(0) }
    e.img(1)._load(); await e.advance(0)
    assert.ok(!e.slides[1].classList.contains('is-active'), 'stale decode cannot activate slide 1')
    if (!newestFirst) { assert.ok(e.slides[0].classList.contains('is-active')); e.img(2)._load(); await e.advance(0) }
    assert.ok(e.slides[2].classList.contains('is-active'))
    assert.equal(e.dot(2).getAttribute('aria-current'), 'true')
    assert.equal(e.document.querySelector('[data-hero-credit]').textContent, 'Third · Credit')
  })
}

for (const initial of ['hover', 'keyboard-focus', 'pointer-focus']) {
  test(`Hero: initial ${initial} state is read before listeners are attached`, t => {
    const e = boot(t, { firstComplete: true, beforeScripts(e) {
      if (initial === 'hover') e.document.querySelector('.hero-controls')._hover = true
      else { e.focusVisible = initial === 'keyboard-focus'; e.document.querySelector('[data-hero-dot="0"]').focus() }
    } })
    e.heroIO.fire([[e.hero, true]])
    const paused = initial !== 'pointer-focus'
    assert.equal(e.hero.dataset.heroPaused, String(paused))
    assert.equal(autoplay(e).length, paused ? 0 : 1)
  })
}

test('Hero: credit hidden state follows empty and populated slide credits', async t => {
  const e = boot(t, { firstComplete: true, reduced: true })
  const credit = e.document.querySelector('[data-hero-credit]')
  assert.ok(!credit.hidden)
  e.slides[1].dataset.heroCreditText = ''
  await show(e, 1)
  assert.equal(credit.textContent, '')
  assert.ok(credit.hidden)
  await show(e, 2)
  assert.ok(!credit.hidden)
  assert.equal(credit.textContent, 'Third · Credit')
})
