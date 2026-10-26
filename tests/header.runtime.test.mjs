import { test } from 'node:test'
import assert from 'node:assert/strict'
import { astroScripts } from './helpers/bundle.mjs'
import { environment, fixture, replaceBody } from './helpers/runtime.mjs'

const html = await fixture('header')
const scripts = await astroScripts('src/components/Header.astro')
function boot(t, options = {}) {
  const env = environment(t, options)
  env.parseHTML(html + (options.hero ? '<section class="photo-hero"></section>' : ''), env.document.body)
  env.routerClicks = []
  env.document.addEventListener('click', event => {
    const anchor = event.target.closest?.('a')
    if (anchor && !event.defaultPrevented && !anchor.hasAttribute('data-astro-reload')) {
      event.preventDefault()
      env.routerClicks.push(anchor.getAttribute('href'))
    }
  })
  scripts.forEach(code => env.run(code, 'Header'))
  return env
}
async function open(env, preFocus = true) {
  if (preFocus) env.$('menu-btn').focus()
  env.$('menu-btn').click()
  await env.frame()
  await env.frame()
  return env.$('mobile-nav')
}
const event = (env, target, type, init) => env.dispatch(target, new env.Ev(type, { bubbles: true, cancelable: true, ...init }))

test('Header A: modal opens, focuses close button and removes opening state after two frames', async t => {
  const e = boot(t)
  const btn = e.$('menu-btn'), dialog = e.$('mobile-nav')
  btn.focus(); btn.click()
  assert.ok(dialog.open && dialog.hasAttribute('data-opening'))
  assert.equal(e.document.activeElement, e.$('mobile-nav-close'))
  assert.equal(btn.getAttribute('aria-expanded'), 'true')
  assert.ok(e.document.body.classList.contains('mobile-nav-open'))
  assert.equal(e.document._top.at(-1), dialog)
  await e.frame(); assert.ok(dialog.hasAttribute('data-opening'))
  await e.frame(); assert.ok(!dialog.hasAttribute('data-opening'))
})

// Safari/iOS pointer clicks do not necessarily focus the menu button.
for (const preFocus of [true, false]) {
  test(`Header B: Escape fallback closes at 500ms and explicitly restores menu focus (preFocus=${preFocus})`, async t => {
    const e = boot(t), dialog = await open(e, preFocus)
    const button = e.$('menu-btn')
    const focus = button.focus.bind(button)
    let calls = 0
    button.focus = options => { calls++; focus(options) }
    // Disable the fake browser's own dialog restoration: test the script's path.
    dialog._prevFocus = null
    dialog._escape()
    assert.ok(dialog.open && dialog.hasAttribute('data-closing'))
    await e.advance(499); assert.ok(dialog.open)
    await e.advance(1)
    assert.ok(!dialog.open && !dialog.hasAttribute('data-closing'))
    assert.equal(calls, 1, 'finishClose calls menuBtn.focus() itself')
    assert.equal(e.document.activeElement, button)
    assert.equal(button.getAttribute('aria-expanded'), 'false')
    assert.ok(!e.document.body.classList.contains('mobile-nav-open'))
  })
}

test('Header C: only the dialog translate transition ends close; clears fallback', async t => {
  const e = boot(t), dialog = await open(e)
  dialog._escape()
  event(e, dialog.querySelector('nav a'), 'transitionend', { propertyName: 'translate' })
  event(e, dialog, 'transitionend', { propertyName: 'opacity' })
  assert.ok(dialog.open)
  event(e, dialog, 'transitionend', { propertyName: 'translate' })
  assert.ok(!dialog.open)
  assert.equal(e.timers.filter(timer => timer.label !== 'dialog-close-task').length, 0)
})

test('Header D: reduced motion opens and closes synchronously without rAF or close wait', t => {
  const e = boot(t, { reduced: true }), dialog = e.$('mobile-nav')
  e.$('menu-btn').click()
  assert.ok(dialog.open && !dialog.hasAttribute('data-opening'))
  assert.equal(e.rafs.size, 0)
  dialog._escape()
  assert.ok(!dialog.open)
  assert.equal(e.document.activeElement, e.$('menu-btn'))
  assert.equal(e.timers.filter(timer => timer.label !== 'dialog-close-task').length, 0)
})

test('Header E: only a preceding dialog press outside its bounds enables backdrop close', async t => {
  const e = boot(t), dialog = await open(e)
  dialog.rect = { left: 100, top: 20, right: 400, bottom: 620, width: 300, height: 600 }
  const click = init => event(e, dialog, 'click', init)
  const press = (target, x, y) => event(e, target, 'pointerdown', { clientX: x, clientY: y })
  click({ clientX: 0, clientY: 0 })
  assert.ok(!dialog.hasAttribute('data-closing'), 'synthetic click has no preceding pointerdown')
  press(dialog, 150, 200); click({ clientX: 0, clientY: 0 })
  assert.ok(!dialog.hasAttribute('data-closing'), 'in-panel down then outside click stays open')
  press(dialog.querySelector('nav a'), 0, 0); click({ clientX: 0, clientY: 0 })
  assert.ok(!dialog.hasAttribute('data-closing'), 'child target cannot count as backdrop press')
  press(dialog, 0, 0)
  dialog.querySelector('nav a').click()
  click()
  assert.ok(!dialog.hasAttribute('data-closing'), 'outside press is consumed by its child click before a bare dialog click')
  for (const [x, y] of [[100, 20], [399, 619]]) {
    press(dialog, x, y); click({ clientX: 0, clientY: 0 })
    assert.ok(!dialog.hasAttribute('data-closing'), 'left/top inclusive and last interior pixel stay open')
  }
  for (const [x, y] of [[99, 200], [400, 200], [150, 19], [150, 620]]) {
    press(dialog, x, y); click({ clientX: 150, clientY: 200 })
    assert.ok(dialog.hasAttribute('data-closing'), `outside press ${x},${y} closes regardless of click coordinates`)
    event(e, dialog, 'transitionend', { propertyName: 'translate' })
    await e.advance(0)
    await open(e)
  }
})

test('Header F: router receives drawer links; three swaps close modal and rebind once', async t => {
  const e = boot(t)
  for (let n = 0; n < 3; n++) {
    const dialog = await open(e), btn = e.$('menu-btn')
    dialog.querySelector('a[href="/about"]').click()
    assert.equal(e.routerClicks.at(-1), '/about')
    assert.ok(dialog.open, 'a click alone has not yet dispatched router preparation')
    e.fire('astro:before-swap')
    assert.ok(!dialog.open && !e.document.body.classList.contains('mobile-nav-open'))
    assert.equal(e.document._top.length, 0)
    assert.equal(btn.count('click'), 0)
    for (const type of ['cancel', 'click', 'pointerdown']) assert.equal(dialog.count(type), 0)
    replaceBody(e, html); e.fire('astro:after-swap')
    assert.equal(e.$('menu-btn').count('click'), 1)
    for (const type of ['cancel', 'click', 'pointerdown']) assert.equal(e.$('mobile-nav').count(type), 1)
    assert.ok(e.document.count('astro:before-swap') <= 3)
    await e.advance(1)
  }
  const live = e.ios.filter(io => !io.disconnected)
  assert.equal(live.length, 1)
  assert.ok(live[0].targets.has(e.$('header-sentinel')))
  live[0].fire([[e.$('header-sentinel'), false]])
  assert.ok(e.document.querySelector('.site-header').classList.contains('is-scrolled'))
})

for (const preFocus of [true, false]) {
  test(`Header G: noncancelable Escape cleans native close state (preFocus=${preFocus})`, async t => {
    const e = boot(t), dialog = await open(e, preFocus)
    dialog._escape({ cancelable: false })
    assert.ok(!dialog.open)
    await e.advance(1)
    assert.ok(!dialog.hasAttribute('data-closing') && !e.document.body.classList.contains('mobile-nav-open'))
    assert.equal(e.$('menu-btn').getAttribute('aria-expanded'), 'false')
    // Native close already happened; without prior button focus the browser can
    // restore body. The script must not manufacture a second focus restoration.
    assert.equal(e.document.activeElement, preFocus ? e.$('menu-btn') : e.document.body)
    assert.equal(e.timers.length, 0)
  })
}

test('Header: close button explicitly restores prior menu focus', async t => {
  const e = boot(t), dialog = await open(e)
  const button = e.$('menu-btn'), focus = button.focus.bind(button)
  let calls = 0
  button.focus = options => { calls++; focus(options) }
  dialog._prevFocus = null
  e.$('mobile-nav-close').click()
  event(e, dialog, 'transitionend', { propertyName: 'translate' })
  assert.equal(calls, 1)
  assert.equal(e.document.activeElement, button)
})

test('Header H: closing before opening frames finish cancels rAF and closes immediately', t => {
  const e = boot(t), dialog = e.$('mobile-nav')
  e.$('menu-btn').click(); e.$('mobile-nav-close').click()
  assert.ok(!dialog.open && !dialog.hasAttribute('data-opening'))
  assert.equal(e.rafs.size, 0)
})

test('Header I: before-swap finishes an in-flight close and clears its fallback', async t => {
  const e = boot(t), dialog = await open(e)
  e.$('mobile-nav-close').click()
  assert.ok(dialog.hasAttribute('data-closing'))
  e.fire('astro:before-swap')
  assert.ok(!dialog.open && !dialog.hasAttribute('data-closing'))
  assert.equal(e.timers.filter(timer => timer.label !== 'dialog-close-task').length, 0)
})

test('Header J: queued close event cannot clobber a reopened drawer', async t => {
  const e = boot(t, { reduced: true })
  e.$('menu-btn').click(); e.$('mobile-nav-close').click(); e.$('menu-btn').click()
  await e.advance(1)
  assert.ok(e.$('mobile-nav').open && e.document.body.classList.contains('mobile-nav-open'))
  assert.equal(e.$('menu-btn').getAttribute('aria-expanded'), 'true')
})

test('Header fixture: desktop has no Contact text link; drawer retains Contact', t => {
  const e = boot(t)
  assert.ok(e.document.querySelector('.site-header').querySelectorAll('a').every(a => a.textContent.trim() !== 'Contact'))
  assert.equal(e.$('mobile-nav').querySelector('a[href="/contact"]').textContent, 'Contact')
})

for (const opening of [false, true]) {
  test(`Header: after-preparation closes immediately without forcing menu focus (opening=${opening})`, async t => {
    const e = boot(t), button = e.$('menu-btn'), dialog = e.$('mobile-nav')
    // No prefocus matches Safari/iOS, and exposes accidental finishClose(true).
    button.click()
    if (!opening) { await e.frame(); await e.frame() }
    const focus = button.focus.bind(button)
    let forced = 0
    button.focus = options => { forced++; focus(options) }
    e.fire('astro:after-preparation')
    assert.ok(!dialog.open)
    assert.ok(!dialog.hasAttribute('data-opening') && !dialog.hasAttribute('data-closing'))
    assert.ok(!e.document.body.classList.contains('mobile-nav-open'))
    assert.equal(button.getAttribute('aria-expanded'), 'false')
    assert.equal(forced, 0)
    assert.notEqual(e.document.activeElement, button)
    assert.equal(e.rafs.size, 0)
    assert.equal(e.timers.filter(timer => timer.label !== 'dialog-close-task').length, 0)
    e.fire('astro:before-swap')
    replaceBody(e, html); e.fire('astro:after-swap')
    await e.advance(1)
    assert.equal(e.$('menu-btn').count('click'), 1)
    assert.ok((await open(e)).open, 'subsequent drawer is still functional')
  })
}

test('Header: hero overlay observes the hero using the shared header height', t => {
  const e = boot(t, { hero: true }), observer = e.ios.at(-1)
  const hero = e.document.querySelector('.photo-hero'), header = e.document.querySelector('.site-header')
  assert.deepEqual([...observer.targets], [hero])
  assert.equal(observer.opts.rootMargin, '-64px 0px 0px 0px')
  assert.equal(observer.opts.threshold, 0)
  observer.fire([[hero, true]])
  assert.ok(!header.classList.contains('is-scrolled'))
  observer.fire([[hero, false]])
  assert.ok(header.classList.contains('is-scrolled'))
})
