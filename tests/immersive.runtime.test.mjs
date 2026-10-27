import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { environment, replaceBody } from './helpers/runtime.mjs'

const fixture = `<section class="immersive" data-immersive-gallery data-atmosphere="stars"><div class="immersive-stage">
  <div class="immersive-atmosphere"><div class="immersive-stars"></div><div class="immersive-stars"></div><div class="immersive-stars"></div></div>
  <div class="immersive-scene" data-device="desktop"><div class="immersive-layer"><img src="/photos/thumbs/matrix/a.webp" srcset="/photos/w1600/matrix/a.webp 1600w" sizes="20vw" data-sizes-peak="60vw" alt=""></div></div>
</div></section>`
const source = () => readFile(new URL('../src/scripts/immersive.ts', import.meta.url), 'utf8')
async function setup(t, { supported = false, saveData = false, reduced = false, fine = false, both = false, atmosphere = 'stars' } = {}) {
  const env = environment({ after: cleanup => t.after(() => { env.fire('astro:before-swap'); cleanup() }) }, { reduced })
  let html = fixture.replace('data-atmosphere="stars"', `data-atmosphere="${atmosphere}"`)
  if (both) html = html.replace('</div></section>', '<div class="immersive-scene" data-device="mobile"><div class="immersive-layer"><img src="/photos/thumbs/matrix/mobile.webp" srcset="/photos/w1100/matrix/mobile.webp 1100w" sizes="40vw" data-sizes-peak="80vw" alt=""></div></div></div></section>')
  if (atmosphere === 'vignette') html = html.replace(/<div class="immersive-atmosphere">[\s\S]*?<\/div><\/div>/, '<div class="immersive-atmosphere"><div class="immersive-vignette"></div></div><div class="immersive-copy"><h2 class="immersive-tagline">Light</h2></div>')
  replaceBody(env, html)
  env.probes = []
  Object.assign(env.window, {
    CSS: { supports: value => { assert.equal(value, 'animation-timeline: scroll()'); return supported } },
    innerHeight: 1000, innerWidth: 1440, scrollY: 0,
    addEventListener: env.window.addEventListener.bind(env.window), removeEventListener: env.window.removeEventListener.bind(env.window),
    Image: function () { const image = env.document.createElement('img'); env.probes.push(image); return image },
  })
  env.window.navigator.connection = { saveData }
  const matchMedia = env.window.matchMedia
  env.window.matchMedia = query => {
    const mql = matchMedia(query)
    return query.includes('pointer: fine') ? new Proxy(mql, { get: (target, key) => key === 'matches' ? fine : Reflect.get(target, key) }) : mql
  }
  const ImageElement = env.window.HTMLImageElement.prototype
  ImageElement.getClientRects = function () { return this.closest('[data-device="mobile"]') ? [] : [this.getBoundingClientRect()] }
  t.after(() => { delete ImageElement.getClientRects })
  // Install added globals through the helper so descriptor restoration remains automatic.
  env.restore(); env.install()
  env.scene = () => env.document.querySelector('[data-immersive-gallery]')
  env.geometry = () => {
    const root = env.scene(), stage = root.querySelector('.immersive-stage')
    Object.defineProperty(root, 'offsetHeight', { value: 3000, configurable: true })
    Object.defineProperty(stage, 'offsetHeight', { value: 1000, configurable: true })
    root.getBoundingClientRect = () => ({ top: 500 - env.window.scrollY, left: 0, width: 1440, height: 3000, bottom: 3500 - env.window.scrollY })
    stage.rect = { top: 0, left: 0, width: 1440, height: 1000, right: 1440, bottom: 1000 }
  }
  env.geometry()
  env.scroll = async y => { globalThis.scrollY = env.window.scrollY = y; env.dispatch(env.window, new env.Ev('scroll')); await env.frame() }
  env.intersect = () => { for (const io of env.ios.filter(io => !io.disconnected)) io.fire([...io.targets].map(target => [target, true])) }
  const script = await source()
  const code = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
  env.run(code, 'src/scripts/immersive.ts')
  return env
}

test('immersive enhancement is zero-import code with Astro lifecycle hooks', async () => {
  const script = await source()
  const ast = ts.createSourceFile('immersive.ts', script, ts.ScriptTarget.Latest, true)
  assert.equal(ast.statements.filter(ts.isImportDeclaration).length, 0)
  for (const event of ['astro:after-swap', 'astro:before-swap']) assert.ok(script.includes(event))

})

test('unsupported scroll timelines write clamped progress and exit, and mark the section ready', async t => {
  const env = await setup(t)
  assert.ok(env.scene().hasAttribute('data-immersive-ready'))
  assert.ok(env.document.documentElement.hasAttribute('data-immersive-fallback'))
  env.intersect()
  for (const [y, p, q] of [[0, 0, 0], [500, 0, 0], [1500, 0.5, 0], [2500, 1, 0], [3000, 1, 0.5], [5000, 1, 1]]) {
    await env.scroll(y)
    assert.equal(Number(env.scene().style.getPropertyValue('--immersive-progress')), p)
    assert.equal(Number(env.scene().style.getPropertyValue('--immersive-exit')), q)
  }
})

test('native timeline support leaves progress and exit properties untouched on scroll', async t => {
  const env = await setup(t, { supported: true })
  assert.ok(!env.document.documentElement.hasAttribute('data-immersive-fallback'))
  env.intersect()
  for (const y of [0, 1500, 5000]) {
    await env.scroll(y)
    assert.equal(env.scene().style.getPropertyValue('--immersive-progress'), '')
    assert.equal(env.scene().style.getPropertyValue('--immersive-exit'), '')
  }
  assert.equal(env.window.count('scroll'), 0)
})

test('peak sizes warm at 100% rootMargin and upgrade only after probe decoding', async t => {
  const env = await setup(t)
  const image = env.scene().querySelector('img')
  assert.equal(image.sizes, '20vw')
  assert.equal(env.probes.length, 0)
  assert.ok(env.ios.some(io => /^100%(?:\s|$)/.test(io.opts.rootMargin)))
  env.intersect()
  assert.equal(env.probes.length, 1)
  const probe = env.probes[0]
  assert.equal(probe.sizes, '60vw')
  assert.equal(probe.srcset, image.srcset)
  assert.ok(probe._decodeResolvers.length, 'probe decode is pending')
  await env.scroll(1500)
  assert.equal(image.sizes, '20vw', 'visible image stays unchanged while decoding')
  probe._load()
  await env.advance(0)
  assert.equal(image.sizes, '60vw')
  env.intersect()
  assert.equal(env.probes.length, 1, 'one upgrade per image')
})

test('Save-Data prevents peak-size probes and upgrades', async t => {
  const env = await setup(t, { saveData: true })
  env.intersect()
  await env.advance(0)
  assert.equal(env.probes.length, 0)
  assert.equal(env.scene().querySelector('img').sizes, '20vw')
})

test('three swaps clean observers, scroll/resize/pointer/media listeners and pending decode work', async t => {
  const env = await setup(t, { fine: true })
  assert.equal(env.document.count('astro:after-swap'), 1)
  assert.equal(env.document.count('astro:before-swap'), 1)
  for (let i = 0; i < 3; i++) {
    const old = env.scene(), stage = old.querySelector('.immersive-stage')
    env.intersect()
    assert.equal(env.window.count('scroll'), 1)
    assert.equal(env.window.count('resize'), 1)
    assert.equal(stage.count('pointermove'), 1)
    env.dispatch(env.window, new env.Ev('scroll'))
    assert.ok(env.rafs.size > 0, 'a scroll frame is pending before teardown')
    env.fire('astro:before-swap')
    assert.ok(env.ios.every(io => io.disconnected && io.targets.size === 0))
    assert.equal(env.window.count('scroll'), 0)
    assert.equal(env.window.count('resize'), 0)
    assert.equal(stage.count('pointermove'), 0)
    assert.equal(stage.count('pointerleave'), 0)
    assert.ok(env.mqListeners.every(mql => mql.count('change') === 0))
    assert.equal(env.rafs.size, 0)
    for (const probe of env.probes) probe._load()
    await env.advance(0)
    assert.equal(old.querySelector('img').sizes, '20vw', 'late decoding cannot mutate the disposed scene')
    replaceBody(env, fixture)
    env.geometry()
    env.fire('astro:after-swap')
    assert.equal(env.ios.filter(io => !io.disconnected).length, 1)
    assert.equal(env.document.count('astro:after-swap'), 1)
    assert.equal(env.document.count('astro:before-swap'), 1)
    assert.ok(env.scene().hasAttribute('data-immersive-ready'))
  }
  env.fire('astro:before-swap')
  replaceBody(env, '<main></main>')
  env.fire('astro:after-swap')
  assert.equal(env.ios.filter(io => !io.disconnected).length, 0)
  assert.equal(env.window.count('scroll'), 0)
})

test('reduced-motion changes reinitialize the scene and remove fallback and pointer motion', async t => {
  const env = await setup(t, { fine: true })
  const media = env.mqListeners.find(mql => mql.media.includes('prefers-reduced-motion'))
  assert.equal(media.count('change'), 1)
  env.reduced = true
  env.dispatch(media, new env.Ev('change'))
  assert.ok(!env.document.documentElement.hasAttribute('data-immersive-fallback'))
  assert.equal(env.window.count('scroll'), 0)
  assert.equal(env.scene().querySelector('.immersive-stage').count('pointermove'), 0)
  assert.ok(env.scene().hasAttribute('data-immersive-ready'))
  assert.equal(media.count('change'), 0)
  const reducedMedia = env.mqListeners.findLast(mql => mql.media.includes('prefers-reduced-motion') && mql.count('change'))
  assert.ok(reducedMedia, 're-init retains a reduced-motion change listener')
  env.reduced = false
  env.dispatch(reducedMedia, new env.Ev('change'))
  assert.ok(env.document.documentElement.hasAttribute('data-immersive-fallback'))
  assert.equal(env.window.count('scroll'), 1)
  assert.equal(env.window.count('resize'), 1)
  assert.equal(env.scene().querySelector('.immersive-stage').count('pointermove'), 1)
  env.intersect()
  await env.scroll(1500)
  assert.equal(Number(env.scene().style.getPropertyValue('--immersive-progress')), 0.5)
})

test('fine desktop pointer parallax moves stars without moving photo layers', async t => {
  const env = await setup(t, { fine: true })
  env.intersect()
  await env.scroll(1700)
  const stage = env.scene().querySelector('.immersive-stage'), layer = env.scene().querySelector('.immersive-layer')
  env.dispatch(stage, new env.Ev('pointermove', { clientX: 1440, clientY: 1000 }))
  await env.frame()
  assert.deepEqual(env.scene().querySelectorAll('.immersive-stars').map(star => star.style.translate), ['-6px -6px', '-12px -12px', '-20px -20px'])
  assert.equal(layer.style.translate, '')
  assert.equal(layer.style.transform, '')
  env.dispatch(stage, new env.Ev('pointerleave'))
  assert.ok(env.scene().querySelectorAll('.immersive-stars').every(star => star.style.translate === '0px 0px'))
})


test('only the displayed device scene is probed when both device scenes exist', async t => {
  const env = await setup(t, { both: true })
  assert.equal(env.scene().querySelectorAll('.immersive-scene').length, 2)
  env.intersect()
  assert.equal(env.probes.length, 1)
  assert.match(env.probes[0].src, /matrix\/a\.webp$/)
  env.probes[0]._load()
  await env.advance(0)
  assert.equal(env.scene().querySelector('[data-device="mobile"] img').sizes, '40vw')
})

for (const [name, fine, y] of [['coarse pointer', false, 1700], ['progress below .5', true, 1200]]) test(`parallax stays still with ${name}`, async t => {
  const env = await setup(t, { fine })
  env.intersect()
  await env.scroll(y)
  const stage = env.scene().querySelector('.immersive-stage')
  env.dispatch(stage, new env.Ev('pointermove', { clientX: 1440, clientY: 1000 }))
  await env.frame()
  assert.ok(env.scene().querySelectorAll('.immersive-stars').every(star => !star.style.translate || star.style.translate === '0px 0px'))
})

test('fallback data-immersive-moving is limited to the visible flight', async t => {
  const env = await setup(t)
  env.intersect()
  for (const [p, moving] of [[0, false], [0.5, true], [0.85, false]]) {
    await env.scroll(500 + 2000 * p)
    assert.equal(env.scene().hasAttribute('data-immersive-moving'), moving, `p=${p}`)
  }
  for (const io of env.ios.filter(io => !io.disconnected)) io.fire([...io.targets].map(target => [target, false]))
  assert.equal(env.scene().hasAttribute('data-immersive-moving'), false)
})

test('reduced motion skips peak-size upgrades even after intersection and resize', async t => {
  const env = await setup(t, { reduced: true })
  env.intersect()
  env.dispatch(env.window, new env.Ev('resize'))
  await env.advance(0)
  assert.equal(env.probes.length, 0)
  assert.equal(env.scene().querySelector('img').sizes, '20vw')
})

test('vignette mode gives the tagline bounded parallax of at most 6px', async t => {
  const env = await setup(t, { fine: true, atmosphere: 'vignette' })
  env.intersect()
  await env.scroll(1700)
  const stage = env.scene().querySelector('.immersive-stage')
  const copy = env.scene().querySelector('.immersive-copy')
  assert.ok(copy)
  env.dispatch(stage, new env.Ev('pointermove', { clientX: 100000, clientY: 100000 }))
  await env.frame()
  const values = (copy.style.translate || copy.querySelector('.immersive-tagline').style.translate).match(/-?[\d.]+/g)?.map(Number)
  assert.ok(values?.length >= 2, 'vignette copy receives parallax')
  assert.ok(values.every(n => Math.abs(n) <= 6) && values.some(n => n !== 0))
  env.dispatch(stage, new env.Ev('pointerleave'))
  assert.ok([copy, copy.querySelector('.immersive-tagline')].some(el => el.style.translate === '0px 0px'))
})
