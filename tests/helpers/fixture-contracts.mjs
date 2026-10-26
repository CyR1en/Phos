import assert from 'node:assert/strict'

const runtimeClasses = ['site-header', 'site-nav', 'site-brand', 'site-nav-link', 'site-button', 'mobile-nav',
  'photo-hero', 'hero-slide', 'hero-controls', 'hero-pause', 'animate-reveal', 'justified-grid', 'photo-card-wrap', 'skip-link', 'sr-only']
const hooks = ['data-hero-interval', 'data-hero-slide', 'data-hero-dot', 'data-hero-credit', 'data-animate-header', 'data-animate', 'data-config', 'data-index']
const behaviour = name => /^(?:type|role|tabindex|autofocus|open|hidden|inert|aria-.*|data-astro-.*|transition:.*)$/.test(name)
const presenceOnly = name => name === 'aria-label' || name.startsWith('data-astro-transition-') || name.startsWith('transition:')

export function assertBehaviourMatches(sample, built, context = '') {
  const project = element => Object.fromEntries(element.attributes.filter(({ name }) => behaviour(name)).map(({ name, value }) =>
    [name.startsWith('data-astro-cid-') ? 'data-astro-cid-*' : name, name.startsWith('data-astro-cid-') || presenceOnly(name) || ['autofocus', 'open', 'hidden', 'inert', 'data-astro-reload'].includes(name) ? true : value]))
  const expected = project(sample), actual = project(built)
  // Active route and synthetic carousel counts/text are data, not fixture state.
  if (sample.localName === 'a' && !sample.hasAttribute('data-hero-credit')) {
    if (actual['aria-current'] !== undefined) assert.equal(actual['aria-current'], 'page', context + ': active link uses page')
    delete actual['aria-current']; delete expected['aria-current']
  }
  assert.deepEqual(actual, expected, context + ': behaviour attributes in both directions')
  for (const token of runtimeClasses.filter(token => sample.classList.contains(token))) {
    assert.ok(built.classList.contains(token), context + ': .' + token)
  }
}

function keySelector(element) {
  if (element.id) return '#' + element.id
  const hook = hooks.find(name => element.hasAttribute(name))
  if (hook) {
    const value = element.getAttribute(hook)
    // Repeated synthetic slides/dots/cards are projected to the available count below.
    return element.localName + '[' + hook + (['data-hero-slide', 'data-hero-dot', 'data-index', 'data-config'].includes(hook) ? '="' + value + '"' : '') + ']'
  }
  const cls = runtimeClasses.find(name => element.classList.contains(name))
  if (cls) return '.' + cls + (element.localName === 'a' && element.hasAttribute('href') ? '[href="' + element.getAttribute('href') + '"]' : '')
  if (element.localName === 'meta') return element.hasAttribute('charset') ? 'meta[charset]' : 'meta[name="' + element.getAttribute('name') + '"]'
  return null
}

export function assertFixtureContract(name, sample, pages) {
  const candidates = name === 'head' ? pages.map(page => ({ ...page, scope: page.head })) : pages.map(page => ({ ...page, scope: page.body }))
  const primary = name === 'hero' || name === 'preview-bindings' ? '[data-hero-interval]' : name === 'photo-grid' ? '.photo-card-wrap' : name === 'reveals' ? '[data-animate-header]' : null
  // Reveals intentionally repeat one header shape to test stagger counts. The
  // home component instance supplies that unscoped shape; page-specific wrappers
  // (for example About's scoped styles) are not this fixture's component.
  const relevant = candidates.filter(page => (!primary || page.body.querySelector(primary)) &&
    (name !== 'reveals' || page.name === 'index.html'))
  assert.ok(relevant.length, name + ': a built component instance exists')
  for (const page of relevant) comparePage(name, sample, page)
}

function comparePage(name, sample, page) {
  const mapped = new Map([[sample, page.scope]])
  const ignored = new Set()
  for (const element of sample.walk()) {
    if (ignored.has(element.parentNode)) { ignored.add(element); continue }
    const key = keySelector(element)
    if (!key && !element.attributes.some(({ name }) => behaviour(name)) && !['a', 'nav', 'source', 'picture', 'img'].includes(element.localName)) continue
    let parent = element.parentNode
    while (parent !== sample && !mapped.has(parent)) parent = parent.parentNode
    const scope = mapped.get(parent) || page.scope
    let matches
    if (key) matches = scope.querySelectorAll(key)
    else if (element.localName === 'a' && element.hasAttribute('href')) matches = scope.querySelectorAll('a').filter(node => node.getAttribute('href') === element.getAttribute('href'))
    else if (element.localName === 'source') matches = scope.querySelectorAll('source').filter(node => node.getAttribute('type') === element.getAttribute('type') && node.hasAttribute('media') === element.hasAttribute('media'))
    else matches = scope.querySelectorAll(element.localName)
    const counterpart = matches[0]
    if (!counterpart) {
      const repeated = ['data-hero-slide', 'data-hero-dot', 'data-index'].find(hook => element.hasAttribute(hook))
      // Fixture slide/card counts and the optional Galleries link are synthetic.
      if (repeated && page.body.querySelectorAll('[' + repeated + ']').length > 0 && Number(element.getAttribute(repeated)) >= page.body.querySelectorAll('[' + repeated + ']').length || element.localName === 'a' && element.getAttribute('href') === '/galleries') {
        ignored.add(element); continue
      }
      assert.fail(`${name} (${page.name}): missing counterpart ${key || element.localName}`)
    }
    mapped.set(element, counterpart)
    assertBehaviourMatches(element, counterpart, `${name} (${page.name}): ${key || element.localName}`)
  }
  if (name === 'header') {
    assert.ok(page.body.querySelector('#mobile-nav').contains(page.body.querySelector('#mobile-nav-close')), 'close button remains inside drawer')
  }
  if (name === 'hero') {
    const hero = page.body.querySelector('[data-hero-interval]')
    for (const selector of ['[data-hero-dot]', '.hero-pause', '[data-hero-credit]']) {
      const controls = page.body.querySelectorAll(selector)
      assert.ok(controls.length && controls.every(control => hero.contains(control)), selector + ' stays inside hero')
    }
  }
  if (name === 'preview-bindings') assert.equal(page.body.children[0], page.body.querySelector('a.skip-link'), 'skip link is first body element')
}
