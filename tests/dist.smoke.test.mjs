import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { makeEnv } from './helpers/dom.mjs'
import { fixture } from './helpers/runtime.mjs'
import { accessibleName, formControlName } from './helpers/accessibility.mjs'
import { assertFixtureContract } from './helpers/fixture-contracts.mjs'
import { nginxBlocks, dockerCopiesFile } from './helpers/nginx.mjs'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const dist = join(repoRoot, 'dist')
const heavy = /HSStaticMethods|lenis|framer|\.hs-/i

function documentBody(html) {
  const env = makeEnv()
  env.parseHTML(html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] || html, env.document.body)
  return env.document.body
}

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return (await Promise.all(entries.map((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  }))).flat()
}

// Strip script/style bodies before counting tags so inline code cannot pose as markup.
const markup = (html) => html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
const unescapeHtml = (value) => value.replace(/&(?:amp|quot|apos|lt|gt|#(x[\da-f]+|\d+));/gi,
  (entity, number) => number
    ? String.fromCodePoint(parseInt(number.replace(/^x/i, ''), /^x/i.test(number) ? 16 : 10))
    : ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' }[entity.toLowerCase()]))

function attributes(tag) {
  return new Map([...tag.matchAll(/([^\s=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)]
    .map(([, name, double, single, bare]) => [name.toLowerCase(), unescapeHtml(double ?? single ?? bare ?? '')]))
}

const tags = (body, name) => [...body.matchAll(new RegExp('<' + name + '\\b[^>]*>', 'gi'))]
  .map(([tag]) => attributes(tag))
const themeFamilies = (css) => [...new Set([...css.matchAll(
  /\[data-theme\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\]\s]+))\s*\]/g
)].map(([, double, single, bare]) => double ?? single ?? bare))].sort()
const imports = (js) => [...js.matchAll(
  /\b(?:import|export)\s*(?:[^;'"()]*?\bfrom\s*)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g
)].map(([, direct, dynamic]) => direct ?? dynamic)
const assetUrl = (specifier, from = '/') => {
  const url = new URL(specifier, new URL(from, 'https://phos.test'))
  return url.origin === 'https://phos.test' && /^\/_assets\/.*\.js$/.test(url.pathname)
    ? url.pathname : null
}

test('built site contracts', {
  skip: !existsSync(dist) && 'dist/ is absent; run npm run check:full or npm run build to enable built-output smoke tests'
}, async (t) => {
  const all = await files(dist)
  const htmlFiles = all.filter((path) => path.endsWith('.html'))
  const publicHtml = htmlFiles.filter((path) => !/^admin(?:\/|$)/.test(relative(dist, path)))
  assert.ok(publicHtml.length, 'dist/ contains public HTML pages')
  const manifest = JSON.parse(await readFile(join(repoRoot, 'src/content/categories.json'), 'utf8'))
  const galleries = JSON.parse(await readFile(join(repoRoot, 'src/content/galleries.json'), 'utf8'))
  const config = JSON.parse(await readFile(join(repoRoot, 'src/content/site-config.json'), 'utf8'))
  const emptyGalleries = (Array.isArray(galleries) ? galleries : galleries.galleries).length === 0
  const themeFiles = (await files(join(repoRoot, 'src/styles/themes'))).filter((path) => path.endsWith('.css'))
  const themeNames = new Set(themeFiles.map((path) => 'theme-' + basename(path, '.css')))
  const expectedTheme = themeNames.has(config.site?.theme) ? config.site.theme : 'theme-gallery'
  const themeTokens = (css) => new Set([...css.matchAll(/(--color-phos-[\w-]+)\s*:/g)].map(([, name]) => name))
  const activeThemeTokens = themeTokens(await readFile(join(repoRoot, 'src/styles/themes', expectedTheme.slice('theme-'.length) + '.css'), 'utf8'))
  const textCache = new Map()
  const assetText = (url) => {
    if (!textCache.has(url)) textCache.set(url, readFile(join(dist, decodeURIComponent(url)), 'utf8'))
    return textCache.get(url)
  }
  const styles = async (body) => {
    const hrefs = tags(body, 'link').filter((attrs) =>
      (attrs.get('rel') || '').split(/\s+/).includes('stylesheet')).map((attrs) => attrs.get('href'))
    assert.ok(hrefs.length, 'page links a stylesheet')
    for (const href of hrefs) assert.match(href, /^\//, 'stylesheet is a local build asset')
    return (await Promise.all(hrefs.map(assetText))).join('\n')
  }

  await t.test('dist is at least as new as src', async () => {
    const sourceFiles = await files(join(repoRoot, 'src'))
    const dates = await Promise.all(sourceFiles.map(async (path) => ({ path, mtimeMs: (await stat(path)).mtimeMs })))
    const newest = dates.reduce((a, b) => a.mtimeMs > b.mtimeMs ? a : b)
    const built = await stat(join(dist, 'index.html'))
    const message = `dist/index.html is older than ${relative(repoRoot, newest.path)}; run npm run check:full or npm run build (PHOS_ALLOW_STALE_DIST=1 explicitly permits stale output)`
    if (process.env.PHOS_ALLOW_STALE_DIST === '1') {
      if (built.mtimeMs < newest.mtimeMs) t.diagnostic(message)
    } else assert.ok(built.mtimeMs >= newest.mtimeMs, message)
  })

  const references = new Map()
  function collect(value, from) {
    if (typeof value === 'string') {
      for (const [url] of value.matchAll(/\/photos\/[^\s,"'<>]+/g)) {
        const pathname = new URL(url, 'https://phos.test').pathname
        if (!references.has(pathname)) references.set(pathname, new Set())
        references.get(pathname).add(from)
      }
    } else if (value && typeof value === 'object') {
      for (const item of Object.values(value)) collect(item, from)
    }
  }
  collect(manifest, 'src/content/categories.json')
  collect(galleries, 'src/content/galleries.json')
  let pages = 0
  let redirects = 0
  let anchors = 0
  const publicStyles = new Set()
  const publicCssUrls = new Set()
  const publicInlineStyles = new Set()

  for (const path of publicHtml) {
    const name = relative(dist, path)
    const html = await readFile(path, 'utf8')
    const body = markup(html)
    // Astro redirect stubs have no layout; assert their redirect separately.
    const redirect = tags(body, 'meta').find((attrs) => attrs.get('http-equiv')?.toLowerCase() === 'refresh')
    if (redirect) {
      await t.test(name + ': redirect', () => assert.match(redirect.get('content') || '', /^0;url=\//i))
      redirects++
      continue
    }
    pages++
    const dom = documentBody(body)
    for (const attrs of tags(body, 'link')) {
      if ((attrs.get('rel') || '').split(/\s+/).includes('stylesheet')) publicCssUrls.add(attrs.get('href'))
    }
    for (const [, css] of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) publicInlineStyles.add(css)
    for (const [, raw] of body.matchAll(/<[a-z][\w:-]*\b([^>]*)>/gi)) {
      const attrs = attributes(raw)
      for (const field of ['src', 'srcset', 'href', 'content', 'data-src', 'data-srcset']) {
        if (attrs.has(field)) collect(attrs.get(field), name + ':' + field)
      }
    }
    const tiles = tags(body, 'a').filter((attrs) => attrs.has('data-index'))
    anchors += tiles.length
    await t.test(name + ': skip link and focusable main', () => {
      const first = dom.children[0]
      assert.equal(first?.getAttribute('href'), '#main')
      assert.ok(first.classList.contains('skip-link'))
      assert.ok(first.textContent.trim())
      assert.equal(dom.querySelectorAll('main').length, 1)
      assert.equal(dom.querySelectorAll('#main').length, 1)
      assert.equal(dom.querySelector('main').id, 'main')
      assert.equal(dom.querySelector('main').getAttribute('tabindex'), '-1')
    })
    await t.test(name + ': browser color metadata', () => {
      const metas = tags(body, 'meta')
      assert.equal(metas.find(attrs => attrs.get('name') === 'color-scheme')?.get('content'), 'light dark')
      const colors = metas.filter(attrs => attrs.get('name') === 'theme-color')
      assert.equal(colors.length, 2)
      for (const scheme of ['light', 'dark']) {
        const color = colors.find(attrs => new RegExp(`\\(\\s*prefers-color-scheme\\s*:\\s*${scheme}\\s*\\)`).test(attrs.get('media') || ''))
        assert.ok(color?.get('content')?.trim(), scheme + ' theme-color is nonempty')
      }
    })
    await t.test(name + ': images, interactive controls and links have accessible names', () => {
      for (const image of dom.querySelectorAll('img')) assert.ok(image.hasAttribute('alt'), image.getAttribute('src'))
      for (const element of dom.querySelectorAll('button, a')) {
        assert.ok(accessibleName(element, dom).trim(), element.id || element.getAttribute('href') || 'unnamed button')
      }
      for (const control of dom.querySelectorAll('input, select, textarea')) {
        if (control.getAttribute('type') === 'hidden') continue
        assert.ok(formControlName(control, dom).trim(), control.id || 'unlabelled ' + control.localName)
      }
    })
    await t.test(name + ': reveal markup stays visible without JS', () => {
      assert.equal(dom.querySelectorAll('[data-reveal-pending]').length, 0, 'SSR never opts into pending reveals')
      for (const element of dom.querySelectorAll('[data-animate-header], .animate-reveal, .photo-card-wrap, [data-hero-slide="0"] img')) {
        assert.ok(!element.classList.contains('opacity-0'), element.localName + '.' + element.className)
        assert.doesNotMatch(element.getAttribute('style') || '', /(?:^|;)\s*opacity\s*:\s*0(?:\.0*)?\s*(?:!important\s*)?(?:;|$)/i)
      }
    })
    await t.test(name + ': desktop Contact removed and drawer Contact retained', () => {
      const header = dom.querySelector('.site-header')
      const drawer = dom.querySelector('#mobile-nav')
      assert.ok(header && drawer)
      assert.ok(header.querySelectorAll('a').every(anchor => anchor.textContent.trim() !== 'Contact'))
      assert.ok(drawer.querySelectorAll('nav a').some(anchor => anchor.textContent.trim() === 'Contact'))
    })
    await t.test(name + ': photo OG dimensions', t => {
      const metas = tags(body, 'meta')
      const images = metas.filter(attrs => attrs.get('property') === 'og:image')
      if (!images.length) return t.skip('no og:image on this page (no page image and site.og.image is empty)')
      for (const og of images) {
        if (!new URL(og.get('content'), 'https://phos.test').pathname.startsWith('/photos/og/')) continue
        assert.equal(metas.find(attrs => attrs.get('property') === 'og:image:width')?.get('content'), '1200')
        assert.equal(metas.find(attrs => attrs.get('property') === 'og:image:height')?.get('content'), '630')
      }
    })
    await t.test(name + ': public layout and photo tiles', () => {
      assert.equal([...body.matchAll(/<h1\b/gi)].length, 1, 'exactly one h1')
      assert.equal(tags(body, 'html')[0]?.get('data-theme'), expectedTheme, 'html bakes the configured theme')
      assert.doesNotMatch(html, /admin dashboard|No showcase items|Configure SMTP/i)
      for (const attrs of tiles) {
        assert.ok(attrs.has('data-astro-reload'), 'photo anchor opts out of router navigation')
        assert.equal(attrs.get('data-astro-prefetch'), 'false')
        assert.equal(attrs.get('aria-haspopup'), 'dialog')
        assert.match(attrs.get('href') || '', /^\/photos\/hd\//, 'photo anchor links to HD')
        assert.doesNotMatch(attrs.get('href') || '', /\/photos\/full\//)
      }
      if (tiles.length) {
        assert.equal(tags(body, 'dialog').filter((attrs) => attrs.get('id') === 'lightbox').length, 1,
          'exactly one lightbox dialog')
      }
      const data = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
        .filter(([, raw]) => attributes(raw).get('id') === 'lightbox-data')
      if (tiles.length) assert.equal(data.length, 1, 'one lightbox payload for the tiles')
      for (const [, raw, json] of data) {
        assert.equal(attributes(raw).get('type'), 'application/json')
        const photos = JSON.parse(json)
        assert.ok(Array.isArray(photos))
        for (const photo of photos) {
          if (photo.srcset) assert.ok(!Object.hasOwn(photo, 'full'), 'responsive lightbox data omits originals')
        }
      }
      if (emptyGalleries) {
        for (const attrs of tags(body, 'a')) {
          assert.doesNotMatch(new URL(attrs.get('href') || '', 'https://phos.test').pathname,
            /^\/galleries(?:\/|$)/, 'empty galleries have no navigation link')
        }
      }
    })
    await t.test(name + ': one palette and no heavy public dependencies', async () => {
      const css = await styles(body)
      publicStyles.add(css)
      assert.deepEqual(themeFamilies(css), [tags(body, 'html')[0].get('data-theme')])
      // write-active-theme trims the palette to referenced tokens; a silent fallback to the
      // full @import ships the whole palette, and an over-trim leaves a token undefined.
      const defined = themeTokens(css)
      assert.ok(defined.size < activeThemeTokens.size,
        `public CSS defines ${defined.size} palette tokens; the theme has ${activeThemeTokens.size}, so trimming did not run`)
      const dangling = [...new Set([...(css + body).matchAll(/var\(\s*(--color-phos-[\w-]+)\s*\)/g)].map(([, name]) => name))]
        .filter((name) => !defined.has(name))
      assert.deepEqual(dangling, [], 'palette tokens referenced without a fallback are defined')
      assert.doesNotMatch(css, heavy, 'public CSS excludes heavy libraries')
      const roots = new Set()
      const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
      for (const [, raw, code] of scripts) {
        const attrs = attributes(raw)
        const src = attrs.get('src')
        if (src && assetUrl(src)) roots.add(assetUrl(src))
        if (attrs.get('type') === 'module') {
          assert.doesNotMatch(code, heavy, 'inline public module excludes heavy libraries')
          for (const specifier of imports(code)) {
            const url = assetUrl(specifier, '/' + name)
            if (url) roots.add(url)
          }
        }
      }
      // Read entry chunks and one level of their static/dynamic imports.
      const graph = new Set(roots)
      for (const url of roots) {
        for (const specifier of imports(await assetText(url))) {
          const dependency = assetUrl(specifier, url)
          if (dependency) graph.add(dependency)
        }
      }
      for (const url of graph) assert.doesNotMatch(await assetText(url), heavy, url)
      if (name === 'index.html' && !config.home?.immersiveGallery?.enabled) {
        assert.doesNotMatch(body, /<astro-island\b/i, 'disabled immersive gallery ships no home island')
      }
    })
    await t.test(name + ': hero loading and responsive sources', () => {
      const slides = [...body.matchAll(/<div\b[^>]*\bdata-hero-slide\s*=[^>]*>([\s\S]*?)<\/div\s*>/gi)]
      const hasHero = tags(body, 'section').some((attrs) =>
        (attrs.get('class') || '').split(/\s+/).includes('photo-hero') && !attrs.has('data-hero-empty'))
      if (hasHero) assert.ok(slides.length, 'a populated hero renders slides')
      if (!slides.length) return
      assert.equal([...body.matchAll(/<[a-z][\w:-]*\b[^>]*>/gi)].filter(([tag]) =>
        attributes(tag).get('fetchpriority') === 'high').length, 1, 'one high priority request per hero page')
      const first = slides.find(([tag]) => attributes(tag.slice(0, tag.indexOf('>') + 1)).get('data-hero-slide') === '0')
      assert.ok(first, 'hero has slide 0')
      const image = tags(first[1], 'img')
      assert.equal(image.length, 1, 'slide 0 has one img')
      assert.ok(!image[0].has('loading'), 'slide 0 has no loading attribute')
      assert.ok(image[0].get('src'), 'slide 0 has an eager source')
      assert.doesNotMatch(image[0].get('src'), /^\/photos\/(?:hd|full)\//)
      const sources = tags(first[1], 'source')
      // The browser takes the first matching <source>; an unconditional one placed first disables the crops.
      const firstBare = sources.findIndex((attrs) => !attrs.has('media'))
      const lastMedia = sources.reduce((last, attrs, index) => attrs.has('media') ? index : last, -1)
      if (firstBare !== -1 && lastMedia !== -1) {
        assert.ok(lastMedia < firstBare, 'portrait media sources precede unconditional sources')
      }
      if (manifest.heroPriority?.[0]?.srcsetAvif) {
        assert.ok(sources.some((attrs) => attrs.get('type') === 'image/avif' &&
          !attrs.has('media') && attrs.get('srcset')),
          'hero AVIF source exists')
      }
      if (manifest.heroPriority?.[0]?.heroPortrait) {
        assert.ok(sources.some((attrs) => attrs.get('media') && attrs.get('srcset')),
          'hero portrait media source exists')
      }
      for (const slide of slides.filter((entry) => entry !== first)) {
        const images = tags(slide[1], 'img')
        assert.equal(images.length, 1, 'deferred slide has one img')
        assert.ok(images[0].get('data-src'), 'deferred slide has data-src')
        for (const attrs of [...images, ...tags(slide[1], 'source')]) {
          assert.ok(!attrs.has('src') && !attrs.has('srcset'), 'later slides use only data-* image sources')
        }
      }
    })
    await t.test(name + ': bounded viewport prefetch', () => {
      const prefetch = [...body.matchAll(/<[a-z][\w:-]*\b[^>]*>/gi)].map(([tag]) => attributes(tag))
        .filter((attrs) => attrs.get('data-astro-prefetch') === 'viewport')
      assert.ok(prefetch.length <= 3, `${prefetch.length} viewport prefetches exceeds 3`)
      for (const attrs of prefetch) assert.doesNotMatch(attrs.get('href') || '', /\?cat=/)
    })
    await t.test(name + ': OG images use generated crops', t => {
      // og:image in baked HTML is the evidence of PUBLIC_SITE_URL at build time.
      const images = tags(body, 'meta').filter(attrs => attrs.get('property') === 'og:image')
      if (!images.length) return t.skip('no og:image on this page (no page image and site.og.image is empty)')
      for (const attrs of images) {
        assert.match(attrs.get('content') || '', /\/photos\/og\//)
      }
    })
  }

  await t.test('component fixtures match corresponding built behaviour attributes and nesting', async () => {
    // Retain page boundaries: an attribute on another page/element cannot hide drift.
    const builtPages = []
    for (const path of publicHtml) {
      const html = markup(await readFile(path, 'utf8'))
      if (tags(html, 'meta').some(attrs => attrs.get('http-equiv') === 'refresh')) continue
      const env = makeEnv()
      env.parseHTML(html.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1] || '', env.document.head)
      const dom = documentBody(html)
      builtPages.push({ name: relative(dist, path), head: env.document.head, body: dom })
    }
    for (const name of ['header', 'hero', 'reveals', 'photo-grid', 'theme-toggle', 'head', 'preview-bindings']) {
      assertFixtureContract(name, documentBody(await fixture(name)), builtPages)
    }
  })

  // Parse each linked public asset once, plus Astro's inline transition styles.
  // PostCSS walks nested @layer/@media rules without confusing declarations and selectors.
  const bundledCss = (await Promise.all([...publicCssUrls].map(assetText))).join('\n')
  const publicCss = [bundledCss, ...publicInlineStyles].join('\n')
  const bundleRoot = postcss.parse(bundledCss)
  const cssRoot = postcss.parse(publicCss)
  await t.test('public reveal opacity rules are gated by js', () => {
    let checked = 0
    cssRoot.walkRules(rule => {
      if (!rule.nodes.some(node => node.type === 'decl' && node.prop === 'opacity' && /^0(?:\.0+)?$/.test(node.value))) return
      for (const selector of rule.selectors) {
        if (!/\.animate-reveal\b|\[data-animate-header\]|\.service-list\b|\.testimonial-grid\b/.test(selector)) continue
        checked++
        assert.match(selector, /\.js(?![\w-])/, selector)
      }
    })
    assert.ok(checked > 0, 'at least one gated reveal opacity rule is emitted')
    assert.ok(!/@media\s*\(\s*scripting\s*:\s*none\s*\)/.test(publicCss), '@media (scripting: none) is absent')
  })
  await t.test('public CSS defines motion tokens and bounds literal cubic-bezier calls', () => {
    // This inspects CSS declarations only; WAAPI easing literals in JS are out of scope.
    const definitions = []
    cssRoot.walkDecls(/^--ease-/, declaration => definitions.push(declaration.prop))
    const literalCount = [...publicCss.matchAll(/cubic-bezier\(/g)].length
    t.diagnostic(`${literalCount} literal cubic-bezier( calls; ${definitions.length} --ease-* definitions in distinct public CSS assets`)
    for (const name of ['--ease-out-expo', '--ease-sheet', '--ease-in-out-sine', '--ease-exit', '--duration-ui', '--duration-hover', '--duration-reveal']) {
      const found = []
      cssRoot.walkDecls(name, declaration => found.push(declaration))
      assert.ok(found.length, name + ' is defined')
    }
    assert.ok(literalCount <= definitions.length + 2, `${literalCount} literal curves exceeds ${definitions.length} easing definitions + 2`)
  })
  await t.test('header and root View Transitions include reduced-motion fallback', () => {
    assert.ok(/view-transition-name\s*:\s*site-header\b/.test(publicCss), 'compiled CSS names site-header')
    for (const phase of ['old', 'new']) {
      const selector = `::view-transition-${phase}(root)`
      const rules = []
      cssRoot.walkRules(rule => { if (rule.selector.includes(selector)) rules.push(rule) })
      assert.ok(rules.length, selector + ' rule exists')
      assert.ok(rules.some(rule => {
        let reduced = false
        for (let parent = rule.parent; parent; parent = parent.parent) {
          if (parent.type === 'atrule' && parent.name === 'media' && /prefers-reduced-motion\s*:\s*reduce/.test(parent.params)) reduced = true
        }
        return reduced && rule.nodes.some(node => node.type === 'decl' &&
          ((node.prop === 'animation' || node.prop === 'animation-name') && node.value === 'none' ||
            node.prop === 'animation-duration' && /^0(?:s|ms)$/.test(node.value)))
      }), selector + ' is disabled under reduced motion')
    }
  })

  const hasDecl = (rule, prop, value) => rule.nodes.some(node => node.type === 'decl' && node.prop === prop && value.test(node.value))
  const rulesMatching = (root, predicate) => { const rules = []; root.walkRules(rule => { if (predicate(rule)) rules.push(rule) }); return rules }
  await t.test('persistent header snapshots disable old and new animations', () => {
    // transition:animate="none" makes Astro emit these rules unconditionally in its inline <style>;
    // the bundle's reduced-motion rules use the same selectors, so they must not satisfy this test.
    const inlineRoot = postcss.parse([...publicInlineStyles].join('\n'))
    const unconditional = (rule) => {
      for (let node = rule.parent; node && node.type !== 'root'; node = node.parent) {
        if (node.type === 'atrule' && /prefers-reduced-motion/.test(node.params || '')) return false
      }
      return true
    }
    const headerRules = (phase) => rulesMatching(inlineRoot, rule => unconditional(rule) && rule.selector.includes(`::view-transition-${phase}(site-header)`))
    const disabled = (rule) => hasDecl(rule, 'animation', /^none$/) || hasDecl(rule, 'animation-name', /^none$/)
    assert.ok(headerRules('old').some(rule => disabled(rule) && hasDecl(rule, 'opacity', /^0$/)),
      'old site-header snapshot is hidden without animation (transition:animate="none" on the header)')
    assert.ok(headerRules('new').some(disabled), 'new site-header snapshot has no animation')
    inlineRoot.walkRules(rule => {
      if (!rule.selector.includes('site-header')) return
      rule.walkDecls(/^animation/, decl => assert.doesNotMatch(decl.value, /astroFade|astroSlide/, rule.selector + ' uses an Astro default animation'))
    })
  })
  await t.test('morph and theme transitions opt the header out of named snapshots', () => {
    assert.ok(rulesMatching(bundleRoot, rule => ['.lightbox-morphing', '.theme-switching', '.site-header'].every(part => rule.selector.includes(part)))
      .some(rule => hasDecl(rule, 'view-transition-name', /^none$/)))
  })
  await t.test('every phos-vt keyframe endpoint blends plus-lighter', () => {
    const frames = []
    cssRoot.walkAtRules(/^(?:-webkit-)?keyframes$/, frame => { if (/^phos-vt/.test(frame.params)) frames.push(frame) })
    assert.ok(frames.length, 'public CSS has phos-vt keyframes')
    for (const frame of frames) for (const endpoint of [/^(?:from|0%)$/, /^(?:to|100%)$/]) {
      const rules = frame.nodes.filter(node => node.type === 'rule' && node.selectors.some(selector => endpoint.test(selector.trim())))
      assert.ok(rules.length && rules.every(rule => hasDecl(rule, 'mix-blend-mode', /^plus-lighter$/)), frame.params + ': ' + endpoint)
    }
  })
  await t.test('skip-link focus CSS moves the link on-screen', () => {
    const base = rulesMatching(bundleRoot, rule => rule.selectors.some(selector => /\.skip-link$/.test(selector)))
    const focus = rulesMatching(bundleRoot, rule => /\.skip-link:focus(?:-visible)?\b/.test(rule.selector))
    assert.ok(base.length && focus.length, 'base and focus skip-link rules exist')
    const positionProps = /^(?:transform|translate|top|left|right|bottom|inset(?:-.*)?)$/
    assert.ok(focus.some(rule => rule.nodes.some(node => node.type === 'decl' && positionProps.test(node.prop) &&
      base.some(before => before.nodes.some(old => old.type === 'decl' && old.prop === node.prop && old.value !== node.value)) &&
      /^(?:none|0(?:[a-z%]*)(?:[ ,]+0(?:[a-z%]*))?|translate[XY]?\(0(?:[a-z%]*)\))$/.test(node.value))), 'focus resets the offscreen position')
  })
  await t.test('main focus target clears outline and scrolls below the sticky header', () => {
    assert.ok(rulesMatching(bundleRoot, rule => rule.selectors.includes('#main')).some(rule => hasDecl(rule, 'scroll-margin-top', /\S/)))
    assert.ok(rulesMatching(bundleRoot, rule => rule.selectors.includes('#main:focus')).some(rule => hasDecl(rule, 'outline', /^none$/)))
  })
  await t.test('public CSS defines light and dark canvas colors', () => {
    assert.ok(rulesMatching(bundleRoot, rule => rule.selectors.some(selector => /^(?::root|\.public-site|html)$/.test(selector)))
      .some(rule => hasDecl(rule, '--color-canvas', /\S/)), 'root canvas token')
    assert.ok(rulesMatching(bundleRoot, rule => /\.dark\b/.test(rule.selector)).some(rule => hasDecl(rule, '--color-canvas', /\S/)), 'dark canvas token')
  })
  await t.test('public light root explicitly uses color-scheme light', () => {
    assert.ok(rulesMatching(bundleRoot, rule => /html:not\(\.dark\)/.test(rule.selector)).some(rule => hasDecl(rule, 'color-scheme', /^light$/)))
  })

  await t.test('dist publishes no hidden paths', async () => {
    assert.deepEqual(all.map(path => relative(dist, path)).filter(path => path.split('/').some(part => part.startsWith('.'))), [])
  })
  await t.test('dist JS, JSON and HTML contain no SMTP block', async () => {
    for (const path of all.filter(path => /\.(?:js|json|html)$/.test(path))) {
      assert.equal(/\bsmtp["']?\s*:\s*\{/.test(await readFile(path, 'utf8')), false, relative(dist, path) + ': no SMTP object')
    }
  })
  await t.test('TSX components never import raw site-config JSON', async () => {
    for (const path of (await files(join(repoRoot, 'src'))).filter(path => path.endsWith('.tsx'))) {
      const source = await readFile(path, 'utf8')
      assert.doesNotMatch(source, /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)["'][^"']*content\/site-config\.json["']/, relative(repoRoot, path))
    }
  })

  await t.test('admin stylesheet contains all theme families', async () => {
    const themes = (await files(join(repoRoot, 'src/styles/themes'))).filter((path) => path.endsWith('.css'))
    const expected = []
    for (const path of themes) {
      const family = themeFamilies(await readFile(path, 'utf8'))
      assert.equal(family.length, 1, relative(repoRoot, path) + ' defines one theme family')
      expected.push(...family)
    }
    const admin = htmlFiles.filter((path) => /^admin(?:\/|$)/.test(relative(dist, path)))
    assert.ok(admin.length, 'dist contains the admin page')
    for (const path of admin) {
      assert.deepEqual(themeFamilies(await styles(markup(await readFile(path, 'utf8')))), expected.sort(),
        relative(dist, path))
    }
  })
  await t.test('public CSS includes design-token utilities', () => {
    for (const utility of ['text-h1', 'eyebrow', 'rounded-photo']) {
      assert.match([...publicStyles].join('\n'), new RegExp('\\.' + utility + '\\s*\\{'), utility)
    }
  })
  await t.test('compressible build files have fresh gzip siblings', async () => {
    const failures = []
    for (const path of all.filter((path) => /\.(?:html|css|js|json|svg)$/.test(path))) {
      const original = await stat(path)
      if (original.size < 1024) continue
      const gzip = path + '.gz'
      if (!existsSync(gzip)) failures.push(relative(dist, path) + ': missing .gz')
      else if ((await stat(gzip)).mtimeMs < original.mtimeMs) failures.push(relative(dist, path) + ': stale .gz')
    }
    assert.equal(failures.length, 0, failures.join('\n'))
  })
  await t.test('all manifest and public HTML photo references exist', () => {
    const missing = []
    for (const [url, sources] of [...references].sort(([a], [b]) => a.localeCompare(b))) {
      const path = decodeURIComponent(url)
      if (![dist, join(repoRoot, 'public')].some((root) => existsSync(join(root, path)))) {
        missing.push(`${url}\n  referenced by ${[...sources].join(', ')}`)
      }
    }
    assert.equal(missing.length, 0, 'Missing photo files:\n' + missing.join('\n'))
    t.diagnostic(`${references.size} distinct photo references checked in dist/ or public/`)
  })
  const nginx = (await readFile(join(repoRoot, 'docker/nginx.conf.template'), 'utf8')).replace(/#.*$/gm, '')
  await t.test('nginx rejects hidden paths at server level and before photo regex locations', t => {
    const locations = nginxBlocks(nginx).filter(block => /^location\b/.test(block.header))
    const hidden = locations.find(block => /^location\s+~\*?\s/.test(block.header) && block.header.includes('/\\.') && /(?:return\s+40[34]|deny\s+all)\s*;/.test(block.body))
    const photo = locations.find(block => /avif|webp|jpe?g/.test(block.header))
    assert.ok(hidden, 'hidden-path regex location accepts quoted patterns and well-known exemption')
    assert.ok(photo && hidden.index < photo.index, 'hidden regex precedes the image extension regex')
    const server = nginxBlocks(nginx).find(block => block.header === 'server')
    assert.ok(server, 'server block exists')
    const guard = nginxBlocks(server.body).find(block => block.depth === 0 && /^if\s*\(\s*\$uri\s+~/.test(block.header) &&
      block.header.includes('/\\.') && /(?:return\s+40[34]|deny\s+all)\s*;/.test(block.body))
    assert.ok(guard, 'server-level hidden URL guard also protects ^~ prefixes')
    t.diagnostic('server hidden-path guard ' + (guard.header.includes('(?!well-known/)') ? 'exempts /.well-known/' : 'has no /.well-known/ exemption'))
  })
  await t.test('nginx security includes exist and are copied by Dockerfile', async () => {
    assert.ok(existsSync(join(repoRoot, 'docker/nginx-security-headers.conf')))
    const dockerfile = (await readFile(join(repoRoot, 'Dockerfile'), 'utf8')).replace(/#.*$/gm, '')
    const includes = [...nginx.matchAll(/\binclude\s+\/app\/docker\/([^;\s]+)\s*;/g)].map(([, file]) => file)
    assert.ok(includes.includes('nginx-security-headers.conf'))
    for (const file of new Set(includes)) {
      assert.ok(!file.includes('..') && existsSync(join(repoRoot, 'docker', file)), file + ' exists')
      assert.ok(dockerCopiesFile(dockerfile, file), file + ' is copied into /app/docker by Dockerfile')
    }
  })
  await t.test('nginx locations that add headers retain all five security headers', async () => {
    const required = ['X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy', 'Strict-Transport-Security', 'Permissions-Policy']
    const snippet = (await readFile(join(repoRoot, 'docker/nginx-security-headers.conf'), 'utf8')).replace(/#.*$/gm, '')
    const headers = text => new Set([...text.matchAll(/\badd_header\s+([\w-]+)\b/g)].map(([, name]) => name.toLowerCase()))
    for (const name of required) assert.ok(headers(snippet).has(name.toLowerCase()), 'security snippet: ' + name)
    const locations = nginxBlocks(nginx).filter(block => /^location\b/.test(block.header))
    for (const location of locations.filter(block => /\badd_header\b/.test(block.body))) {
      if (/\binclude\s+\/app\/docker\/nginx-security-headers\.conf\s*;/.test(location.body)) continue
      for (const name of required) assert.ok(headers(location.body).has(name.toLowerCase()), location.header + ': ' + name)
    }
    const root = locations.find(block => /^location\s+\/$/.test(block.header))
    assert.ok(root)
    assert.match(root.body, /add_header\s+X-Frame-Options\s+["']?SAMEORIGIN["']?\s/)
    assert.ok(headers(root.body).has('content-security-policy'), 'public HTML keeps CSP')
  })
  await t.test('nginx uses an extension regex for photos, never a prefix block', () => {
    assert.doesNotMatch(nginx, /\blocation\s+(?:\^~\s+)?\/photos\/\s*\{/)
    assert.match(nginx, /\blocation\s+~\*?\s+[^\n{]*\\\.[^\n{]*(?:avif|webp|jpe?g)[^\n{]*\{/,
      'image cache policy matches image extensions')
  })
  await t.test('nginx serves precompressed assets and only hashed assets are immutable', () => {
    assert.match(nginx, /^\s*gzip_static\s+on\s*;/m, 'gzip_static serves the .gz sidecars')
    const immutable = [...nginx.matchAll(/\blocation\s+([^{]+?)\s*\{([^}]*)\}/g)]
      .filter(([, , block]) => /\bimmutable\b/.test(block)).map(([, matcher]) => matcher.trim())
    assert.deepEqual(immutable, ['^~ /_assets/'])
  })
  await t.test('nginx HTML uses no-cache', () => {
    const location = nginx.match(/\blocation\s+\/\s*\{([\s\S]*?)\n\s*\}/)?.[1]
    assert.ok(location, 'nginx defines location /')
    assert.match(location, /add_header\s+Cache-Control\s+"no-cache"(?:\s+always)?\s*;/)
  })
  t.diagnostic(`${pages} public pages, ${redirects} Astro redirect stubs, ${anchors} photo anchors`)
})
