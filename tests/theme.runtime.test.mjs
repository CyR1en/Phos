import { test } from 'node:test'
import assert from 'node:assert/strict'
import { astroScripts } from './helpers/bundle.mjs'
import { environment, fixture, incomingDocument, navigate, swapBody } from './helpers/runtime.mjs'

const head = await fixture('head')
const toggle = await fixture('theme-toggle')
const body = await fixture('preview-bindings') + toggle
const headScripts = await astroScripts('src/layouts/BaseLayout.astro', { inline: true })
const toggleScripts = await astroScripts('src/components/ThemeToggle.astro')
function boot(t, options = {}, withToggle = false) {
  const e = environment(t, options)
  if (options.stored !== undefined) e.storage.set('theme', options.stored)
  e.darkOS = !!options.darkOS
  e.config = { site: { theme: 'theme-nord', title: 'Live title' }, home: { hero: { heading: 'Live heading' } } }
  e.document.documentElement.setAttribute('lang', 'en')
  e.document.documentElement.setAttribute('data-theme', 'theme-gallery')
  const [before, after] = head.split('<!-- bootstrap -->')
  e.parseHTML(before, e.document.head)
  headScripts.forEach(code => e.run(code, 'BaseLayout'))
  e.parseHTML(after, e.document.head)
  e.parseHTML(body, e.document.body)
  if (withToggle) toggleScripts.forEach(code => e.run(code, 'ThemeToggle'))
  return e
}
const next = e => incomingDocument(e, head, body)
const themeLinks = e => e.document.querySelectorAll('link[data-themes-all]')
const mode = e => e.document.documentElement.getAttribute('data-theme-mode')

test('BaseLayout: the first head-script statement adds the js root class', () => {
  assert.match(headScripts[0], /^'use strict';\n\s*document\.documentElement\.classList\.add\(["']js["']\);/)
})

for (const [stored, darkOS, expectedMode, dark] of [
  ['light', true, 'light', false], ['dark', false, 'dark', true],
  ['auto', true, 'auto', true], ['auto', false, 'auto', false],
  [undefined, true, 'auto', true], [undefined, false, 'auto', false],
  ['invalid', true, 'auto', true]
]) {
  test(`BaseLayout: public bootstrap stored=${stored}, OS dark=${darkOS}`, async t => {
    const e = boot(t, { stored, darkOS })
    const root = e.document.documentElement
    assert.ok(root.classList.contains('js'))
    assert.equal(mode(e), expectedMode)
    assert.equal(root.classList.contains('dark'), dark)
    assert.ok(!root.hasAttribute('data-preview'))
    assert.equal(e.document.count('astro:before-swap'), 1, 'unconditional root-preparation listener')
    assert.equal(e.document.count('astro:after-swap'), 0, 'public bootstrap needs no fetch hook')
    for (let n = 0; n < 3; n++) {
      const incoming = next(e)
      // Assert before the router copies attributes, so ThemeToggle cannot mask a missing hook.
      navigate(e, incoming, () => {
        assert.ok(incoming.documentElement.classList.contains('js'))
        assert.equal(incoming.documentElement.classList.contains('dark'), dark)
        assert.equal(incoming.documentElement.getAttribute('data-theme-mode'), expectedMode)
        assert.ok(!incoming.documentElement.hasAttribute('data-preview'))
      })
      assert.ok(root.classList.contains('js'))
      assert.equal(mode(e), expectedMode)
      assert.equal(root.classList.contains('dark'), dark)
    }
    await e.advance(500)
    assert.equal(e.fetches.length, 0)
    assert.equal(e.writes.length, 0)
    assert.equal(themeLinks(e).length, 0)
    assert.equal(e.document.querySelector('link[href="/themes-all.css"]'), null)
    assert.equal(root.getAttribute('data-theme'), 'theme-gallery')
    assert.equal(e.document.querySelector('h1').textContent, 'Baked heading')
  })
}

test('BaseLayout: a public category named previews does not enable preview', async t => {
  const e = boot(t, { url: 'http://localhost/photos/all/?cat=previews' })
  navigate(e, next(e)); await e.advance(500)
  assert.ok(!e.document.documentElement.hasAttribute('data-preview'))
  assert.equal(e.fetches.length, 0)
  assert.equal(e.writes.length, 0)
  assert.equal(themeLinks(e).length, 0)
})

test('BaseLayout: before-swap copies the current root mode and dark class', t => {
  const e = boot(t, { stored: 'light' })
  const root = e.document.documentElement
  // Stale storage must not overwrite a mode already selected in this document.
  e.storage.set('theme', 'light')
  root.setAttribute('data-theme-mode', 'dark'); root.classList.add('dark')
  let incoming = next(e)
  e.fire('astro:before-swap', { newDocument: incoming, to: new URL('/about', e.window.location) })
  assert.equal(incoming.documentElement.getAttribute('data-theme-mode'), 'dark')
  assert.ok(incoming.documentElement.classList.contains('dark'))
  root.setAttribute('data-theme-mode', 'auto'); root.classList.remove('dark')
  incoming = next(e); incoming.documentElement.classList.add('dark')
  e.fire('astro:before-swap', { newDocument: incoming, to: new URL('/about', e.window.location) })
  assert.equal(incoming.documentElement.getAttribute('data-theme-mode'), 'auto')
  assert.ok(!incoming.documentElement.classList.contains('dark'))
})

test('BaseLayout: skip-link document listener prevents URL navigation and focuses main', t => {
  const e = boot(t), link = e.document.querySelector('a.skip-link')
  assert.equal(e.document.body.children[0], link)
  assert.equal(e.$('main').getAttribute('tabindex'), '-1')
  // A filter URL does not change the target of the skip-link focus action.
  e.window.location.href = 'http://localhost/photos/all/?cat=street'
  const child = e.document.createElement('span'); link.append(child)
  for (const target of [link, child]) {
    e.document.body.focus()
    const click = new e.Ev('click', { bubbles: true, cancelable: true, button: 0 })
    e.dispatch(target, click)
    assert.ok(click.defaultPrevented)
    assert.equal(e.document.activeElement, e.$('main'))
  }
})

test('BaseLayout: blocked storage preserves an explicit light → dark toggle across navigation', t => {
  const e = boot(t, { storage: 'throw' }, true)
  e.$('theme-toggle').click()
  assert.equal(mode(e), 'light')
  e.$('theme-toggle').click()
  assert.equal(mode(e), 'dark')
  assert.ok(e.document.documentElement.classList.contains('dark'))
  navigate(e, next(e), incoming => {
    assert.equal(incoming.documentElement.getAttribute('data-theme-mode'), 'dark')
    assert.ok(incoming.documentElement.classList.contains('dark'))
  }, { to: '/about' })
  assert.equal(mode(e), 'dark')
  assert.ok(e.document.documentElement.classList.contains('dark'))
})

for (const iframe of [false, true]) {
  test(`BaseLayout: destination /about decides preview attributes and stylesheet (iframe=${iframe})`, t => {
    const e = boot(t, { url: 'http://localhost/?preview', iframe })
    const incoming = next(e)
    incoming.documentElement.setAttribute('data-preview', '')
    navigate(e, incoming, doc => {
      assert.equal(doc.documentElement.hasAttribute('data-preview'), iframe)
      assert.equal(doc.head.querySelectorAll('link[data-themes-all]').length, iframe ? 1 : 0)
    }, { to: '/about' })
    assert.equal(themeLinks(e).length, iframe ? 1 : 0)
  })
}

for (const preview of ['iframe', 'query']) {
  test(`BaseLayout: ${preview} preview writes stylesheet before bundle, carries it across swaps, fetches once per navigation`, async t => {
    const options = preview === 'iframe'
      ? { iframe: true, parentTheme: 'theme-parent', parentDark: true }
      : { url: 'http://localhost/?preview' }
    const e = boot(t, options)
    const root = e.document.documentElement
    assert.equal(root.getAttribute('data-preview'), '')
    assert.equal(e.writes.length, 1)
    assert.match(e.writes[0], /themes-all\.css/)
    assert.equal(themeLinks(e).length, 1)
    const nodes = e.document.head.children
    assert.ok(nodes.indexOf(themeLinks(e)[0]) < nodes.indexOf(e.document.querySelector('link[href="/_assets/BaseLayout.test.css"]')))
    assert.equal(e.fetches.length, 1)
    if (preview === 'iframe') {
      assert.equal(root.getAttribute('data-theme'), 'theme-parent')
      assert.ok(root.classList.contains('dark'), 'copy parent dark class before the fetch')
    } else assert.equal(root.getAttribute('data-theme'), 'theme-gallery')
    await e.advance(60)
    const expectedTheme = preview === 'iframe' ? 'theme-parent' : 'theme-nord'
    assert.equal(root.getAttribute('data-theme'), expectedTheme)
    assert.equal(e.document.querySelector('h1').textContent, 'Live heading')
    assert.equal(e.document.querySelector('title').textContent, 'Live title')
    for (let n = 1; n <= 3; n++) {
      const incoming = next(e)
      navigate(e, incoming, () => {
        assert.ok(incoming.documentElement.classList.contains('js'))
        assert.equal(incoming.documentElement.getAttribute('data-preview'), '')
        assert.equal(incoming.head.querySelectorAll('link[data-themes-all]').length, 1)
      })
      assert.equal(themeLinks(e).length, 1)
      assert.equal(root.getAttribute('data-theme'), expectedTheme, 'cached/parent palette restored synchronously')
      await e.advance(60)
      assert.equal(e.fetches.length, n + 1)
      assert.equal(e.document.querySelector('h1').textContent, 'Live heading')
    }
    assert.equal(e.writes.length, 1)
    assert.equal(e.document.count('astro:before-swap'), 1)
    assert.equal(e.document.count('astro:after-swap'), 1)
  })
}

function checkTheme(e, current, following, dark) {
  assert.equal(mode(e), current)
  assert.equal(e.storage.get('theme'), current)
  assert.equal(e.$('theme-toggle').getAttribute('aria-label'), `Theme: ${current}. Switch to ${following}`)
  assert.equal(e.document.documentElement.classList.contains('dark'), dark)
}

test('ThemeToggle: light → dark → auto → light persists mode, labels and both browser colors', t => {
  const e = boot(t, { stored: 'light', darkOS: true }, true)
  checkTheme(e, 'light', 'dark', false)
  const metas = e.document.querySelectorAll('meta[name="theme-color"]')
  assert.equal(metas.length, 2)
  assert.deepEqual(metas.map(meta => meta.getAttribute('content')), ['#f5f5f3', '#f5f5f3'])
  e.$('theme-toggle').click()
  checkTheme(e, 'dark', 'auto', true)
  assert.deepEqual(metas.map(meta => meta.getAttribute('content')), ['#111111', '#111111'])
  e.$('theme-toggle').click()
  checkTheme(e, 'auto', 'light', true)
  assert.deepEqual(metas.map(meta => meta.getAttribute('content')), metas.map(meta => meta.getAttribute('data-theme-color-default')))
  e.$('theme-toggle').click()
  checkTheme(e, 'light', 'dark', false)
})

for (const rejected of [false, true]) {
  test(`ThemeToggle: View Transition wraps change and removes theme-switching after ${rejected ? 'rejection' : 'finish'}`, async t => {
    const e = boot(t, { stored: 'light', vt: true }, true)
    e.$('theme-toggle').click()
    assert.equal(e.transitions.length, 1)
    assert.ok(e.transitions[0].switchingAtStart, 'theme-switching added before startViewTransition')
    assert.ok(e.document.documentElement.classList.contains('theme-switching'))
    checkTheme(e, 'dark', 'auto', true)
    if (rejected) e.transitions[0].reject(new Error('transition skipped'))
    else e.transitions[0].resolve()
    await e.advance(0)
    assert.ok(!e.document.documentElement.classList.contains('theme-switching'))
  })
}

for (const options of [{ vt: false }, { vt: true, reduced: true }]) {
  test(`ThemeToggle: applies directly with ${options.reduced ? 'reduced motion' : 'no startViewTransition'}`, t => {
    const e = boot(t, { stored: 'light', ...options }, true)
    e.$('theme-toggle').click()
    checkTheme(e, 'dark', 'auto', true)
    assert.equal(e.transitions.length, 0)
    assert.ok(!e.document.documentElement.classList.contains('theme-switching'))
  })
}

test('ThemeToggle: overlapping transitions retain theme-switching until both settle', async t => {
  const e = boot(t, { stored: 'light', vt: true }, true)
  e.$('theme-toggle').click(); e.$('theme-toggle').click()
  assert.equal(e.transitions.length, 2)
  e.transitions[0].resolve(); await e.advance(0)
  assert.ok(e.document.documentElement.classList.contains('theme-switching'))
  e.transitions[1].resolve(); await e.advance(0)
  assert.ok(!e.document.documentElement.classList.contains('theme-switching'))
})

test('ThemeToggle: three swaps bind each fresh button once and one OS preference listener', t => {
  const e = boot(t, { stored: 'auto' }, true)
  for (let n = 0; n < 3; n++) {
    swapBody(e, body)
    assert.equal(e.$('theme-toggle').count('click'), 1)
  }
  const listeners = e.mqListeners.filter(query => query.media.includes('prefers-color-scheme'))
  assert.equal(listeners.reduce((sum, query) => sum + query.count('change'), 0), 1)
  e.darkOS = true
  listeners.forEach(query => query.dispatchEvent(new e.Ev('change')))
  assert.ok(e.document.documentElement.classList.contains('dark'))
  e.$('theme-toggle').click()
  checkTheme(e, 'light', 'dark', false)
  e.darkOS = false
  listeners.forEach(query => query.dispatchEvent(new e.Ev('change')))
  assert.ok(!e.document.documentElement.classList.contains('dark'), 'explicit mode ignores system changes')
})

test('ThemeToggle: live status is silent on load, OS updates and after-swap; announces user changes', t => {
  const e = boot(t, { stored: 'light' }, true)
  assert.equal(e.$('theme-toggle-status').textContent, '')
  assert.equal(e.$('theme-toggle-status').getAttribute('role'), 'status')
  assert.equal(e.$('theme-toggle-status').getAttribute('aria-live'), 'polite')
  assert.ok(e.$('theme-toggle-status').classList.contains('sr-only'))
  e.$('theme-toggle').click()
  assert.equal(e.$('theme-toggle-status').textContent, 'Theme: dark')
  e.$('theme-toggle').click()
  assert.equal(e.$('theme-toggle-status').textContent, 'Theme: auto')
  e.darkOS = true
  e.mqListeners.filter(query => query.media.includes('prefers-color-scheme')).forEach(query => query.dispatchEvent(new e.Ev('change')))
  assert.equal(e.$('theme-toggle-status').textContent, 'Theme: auto')
  swapBody(e, body)
  assert.equal(e.$('theme-toggle-status').textContent, '')
  e.$('theme-toggle').click()
  assert.equal(e.$('theme-toggle-status').textContent, 'Theme: light')
})

test('ThemeToggle: transition.ready rejection is caught independently of finished', async t => {
  const e = boot(t, { stored: 'light', vt: true }, true)
  e.$('theme-toggle').click()
  const transition = e.transitions[0]
  assert.ok(transition.readyCaught, 'ready has an explicit rejection handler')
  transition.rejectReady(new Error('snapshot unavailable'))
  await e.advance(0)
  assert.ok(e.document.documentElement.classList.contains('theme-switching'))
  transition.reject(new Error('transition skipped'))
  await e.advance(0)
  assert.ok(!e.document.documentElement.classList.contains('theme-switching'))
  checkTheme(e, 'dark', 'auto', true)
})
