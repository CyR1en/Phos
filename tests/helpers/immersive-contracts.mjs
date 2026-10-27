import assert from 'node:assert/strict'
import postcss from 'postcss'
import { makeEnv } from './dom.mjs'
import { bundle } from './bundle.mjs'

const motion = await bundle('src/lib/immersive-motion.ts')
const { DEFAULT_POSITIONS } = await bundle('src/lib/immersive-defaults.ts')
export const markup = html => html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
export const declarations = style => {
  const values = new Map()
  postcss.parse('a{' + style + '}').walkDecls(decl => values.set(decl.prop, decl.value))
  return values
}
const ancestors = node => { const list = []; for (let p = node.parent; p; p = p.parent) list.push(p); return list }
// Lightning CSS downlevels `(width < 768px)` to `not all and (min-width:768px)` or `(max-width:767.98px)`.
export const deviceMedia = params => /(?:not all and \(min-width\s*:\s*768px\)|width\s*<\s*768px|max-width\s*:\s*767(?:\.98)?px)/.test(params) ? 'mobile'
  : /(?:width\s*>=\s*768px|min-width\s*:\s*768px)/.test(params) ? 'desktop' : null
export function keyframeStops(css, name, device) {
  const found = []
  postcss.parse(css).walkAtRules('keyframes', rule => {
    if (rule.params !== name || (device && !ancestors(rule).some(a => a.name === 'media' && deviceMedia(a.params) === device))) return
    for (const stop of rule.nodes.filter(n => n.type === 'rule')) for (const at of stop.selector.split(',')) {
      const props = new Map(stop.nodes.filter(n => n.type === 'decl').map(d => [d.prop, d.value]))
      found.push({ p: parseFloat(at) / 100, props })
    }
  })
  return found.sort((a, b) => a.p - b.p)
}
export function immersiveDocument(html) {
  const env = makeEnv()
  env.parseHTML(markup(html), env.document.body)
  return env.document
}

// Independent geometry oracle: a mutated frameStyle must not validate itself in the fixture.
export function pixels(value, width, height) {
  const expression = value.replace(/calc\(|\)/g, '').replace(/(-?[\d.]+)(vw|vh|px)/g,
    (_, n, unit) => String(Number(n) * (unit === 'vw' ? width / 100 : unit === 'vh' ? height / 100 : 1)))
  assert.match(expression, /^[\d.\s+\-]+$/)
  return new Function('return ' + expression)()
}
export function assertFrameGeometry(styles, pos, width = 1440, height = 900) {
  const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-7, `${label}: ${actual} ≠ ${expected}`)
  near(pixels(styles.get('left'), width, height), width * (0.5 + (pos.x - pos.w / 2) / 100), 'left')
  near(pixels(styles.get('top'), width, height), height * (0.5 + (pos.y - pos.h / 2) / 100), 'top')
  near(pixels(styles.get('width'), width, height), width * pos.w / 100, 'width')
  near(pixels(styles.get('height'), width, height), height * pos.h / 100, 'height')
  const origin = styles.get('transform-origin')?.match(/calc\([^)]*\)/g)
  assert.equal(origin?.length, 2, 'viewport-centred transform origin')
  near(pixels(origin[0], width, height), width * (pos.w / 2 - pos.x) / 100, 'origin x')
  near(pixels(origin[1], width, height), height * (pos.h / 2 - pos.y) / 100, 'origin y')
}

function assertCollapse(ast, label) {
  const has = (selector, prop, match) => {
    let yes = false
    ast.walkRules(rule => {
      if (!selector.test(rule.selector)) return
      rule.walkDecls(prop, decl => { if (match.test(decl.value)) yes = true })
    })
    assert.ok(yes, `${label}: ${selector} sets ${prop} ${match}`)
  }
  has(/^\.immersive$/, 'height', /^auto$/)
  has(/\.immersive-stage/, 'position', /^(relative|static)$/)
  has(/\.immersive-stage/, 'height', /^auto$/)
  has(/\.immersive-copy(?:\s|$|,)/, 'position', /^(relative|static)$/)
  for (const copy of ['tagline', 'eyebrow']) has(new RegExp('\\.immersive-' + copy), 'opacity', /^1$/)
  let disabled = false
  ast.walkRules(rule => {
    if (!rule.selector.includes('[data-immersive-animate]')) return
    rule.walkDecls(decl => { if (/^animation(?:-name)?$/.test(decl.prop) && decl.value === 'none') disabled = true })
  })
  assert.ok(disabled, label + ': disables animated nodes')
}

export function assertImmersivePrint(css) {
  const blocks = []
  postcss.parse(css).walkAtRules('media', rule => { if (/\bprint\b/.test(rule.params) && /\.immersive/.test(rule.toString())) blocks.push(rule.toString()) })
  assert.ok(blocks.length, 'print collapse media')
  assertCollapse(postcss.parse(blocks.join('\n')), 'print')
}
export function assertImmersiveImages(section) {
  for (const scene of section.querySelectorAll('.immersive-scene')) for (const image of scene.querySelectorAll('img')) {
    const cap = scene.dataset.device === 'mobile' ? 1100 : 2200
    const widths = image.getAttribute('srcset').split(',').map(s => Number(s.trim().match(/ (\d+)w$/)?.[1]))
    assert.ok(widths.length && widths.every(w => Number.isFinite(w) && w > 0 && w <= cap), `${scene.dataset.device} srcset ≤ ${cap}w`)
    assert.match(image.getAttribute('style') ?? '', /background(?:-image)?\s*:[^;]*url\(/, 'LQIP is on the img')
  }
}

export function assertImmersiveScene(html, css = '', options = {}) {
  const { text = '', atmosphere = 'stars', intensity = 'dramatic', scrollLength = 'standard' } = options
  const doc = immersiveDocument(html)
  for (const island of doc.querySelectorAll('astro-island')) assert.doesNotMatch(island.getAttribute('component-url') ?? '', /immersive/i, 'gallery is server rendered')
  const sections = doc.querySelectorAll('section.immersive[data-immersive-gallery]')
  assert.equal(sections.length, 1, 'one immersive section')
  const section = sections[0]
  for (const [name, value] of Object.entries({ atmosphere, intensity, 'scroll-length': scrollLength })) assert.equal(section.getAttribute('data-' + name), value)
  assert.match(section.getAttribute('style') ?? '', new RegExp(`${motion.RUNWAY[scrollLength]}lvh`), 'Feel runway is rendered')
  const stage = section.querySelector('.immersive-stage')
  assert.ok(stage, 'sticky stage')
  const frame = stage.querySelector('.immersive-frame')
  assert.ok(frame)
  assert.match(declarations(frame.getAttribute('style')).get('transform') ?? '', /translateY\(2\.5(?:l?vh)\)\s*scale\(0\.9\)/, 'static STAGE transform')
  for (const node of [...stage.querySelectorAll('[data-immersive-animate]'), ...stage.querySelectorAll('[data-immersive-exit]')]) {
    assert.ok(!declarations(node.getAttribute('style') ?? '').has('animation'), 'inline animation shorthand would reset the node timeline')
  }
  const scenes = stage.querySelectorAll('.immersive-scene')
  assert.equal(scenes.length, 2)
  assert.deepEqual(scenes.map(scene => scene.dataset.device).sort(), ['desktop', 'mobile'])
  const inline = [...html.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '').matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map(([, code]) => code).join('\n')
  const allCss = inline + '\n' + css
  const ast = postcss.parse(allCss)
  let photos = 0
  for (const scene of scenes) for (const layer of scene.querySelectorAll('.immersive-layer')) {
    const styles = declarations(layer.getAttribute('style') ?? '')
    const name = styles.get('animation-name')
    assert.match(name ?? '', /^immersive-layer-\d+$/)
    const index = Number(styles.get('--immersive-layer'))
    assert.ok(Number.isInteger(index) && index >= 0)
    const pos = { ...DEFAULT_POSITIONS[index % 7][scene.dataset.device], ...options[scene.dataset.device + 'Positions']?.[index] }
    for (const [property, value] of Object.entries(motion.frameStyle(pos))) assert.equal(styles.get(property), value, `${scene.dataset.device}[${index}].${property}`)
    assertFrameGeometry(styles, pos)
    const stops = keyframeStops(inline, name, scene.dataset.device)
    assert.ok(stops.length >= 24, `${scene.dataset.device} ${name} has its own device keyframes`)
    const deviceCount = options[scene.dataset.device + 'Photos']?.length ?? Math.max(...scene.querySelectorAll('.immersive-layer').map(el => Number(declarations(el.getAttribute('style')).get('--immersive-layer')))) + 1
    const model = motion.resolveLayers(options[scene.dataset.device + 'Positions'] ?? null, deviceCount, scene.dataset.device)[index]
    assert.ok(model && !model.hidden, 'rendered layer belongs to the visible device set')
    for (const { p, props } of stops) {
      assert.deepEqual([...props.keys()].sort(), ['opacity', 'transform'])
      assert.match(props.get('transform'), /^scale\([\d.]+\)$/)
      const scale = Number(props.get('transform').match(/scale\(([\d.]+)\)/)[1])
      assert.ok(Math.abs(scale - motion.layerScale(p, model, motion.INTENSITY[intensity])) < 0.00005, `${scene.dataset.device} ${name} ${p}: scale agrees with device model`)
      assert.ok(Math.abs(Number(props.get('opacity')) - motion.layerOpacity(p, model, motion.INTENSITY[intensity])) < 0.00005, `${scene.dataset.device} ${name} ${p}: opacity agrees with device model`)
    }
    const image = layer.querySelector('img')
    assert.ok(image)
    assert.doesNotMatch(image.getAttribute('src') ?? '', /^\/photos\/immersive(?:-mobile)?\//, 'scene sources come from manifest thumbs')
    for (const attr of ['srcset', 'sizes', 'data-sizes-peak']) assert.ok(image.getAttribute(attr)?.trim(), attr + ' is present')
    for (const [attr, value] of Object.entries({ loading: 'lazy', decoding: 'async', fetchpriority: 'low', alt: '' })) assert.equal(image.getAttribute(attr), value)
    photos++
  }
  assert.ok(photos, 'at least one scene has photos')
  // Derive the following rendered section from the DOM as well as the attribute.
  const siblings = section.parentNode?.children ?? []
  const next = siblings[siblings.indexOf(section) + 1]
  assert.equal(section.hasAttribute('data-has-next'), !!next?.classList.contains('immersive-next'), 'hasNext agrees with following wrapper')
  if (next && !['SCRIPT', 'STYLE'].includes(next.tagName)) assert.ok(next.classList.contains('immersive-next'), 'following content has handoff wrapper')
  assert.equal(!!stage.querySelector('.immersive-atmosphere'), atmosphere !== 'none')
  if (text) {
    const tagline = stage.querySelector('.immersive-copy h2.immersive-tagline')
    assert.ok(tagline, 'configured tagline is a real heading')
    assert.equal(tagline.dataset.config, 'home.immersiveGallery.text')
    assert.equal(tagline.textContent.trim(), text.trim())
  }
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
  const enhancement = scripts.find(([, , code]) => code.includes('data-immersive-ready'))
  assert.ok(enhancement, 'immersive enhancement is inline in the built page')
  assert.match(enhancement[1], /type=["']module["']/)
  assert.doesNotMatch(enhancement[1], /\bsrc=/)
  assert.doesNotMatch(enhancement[2], /\bimport\s*(?:["'{*]|[\w$]+\s+from|\()/)
  let sticky = false, scroll = false, jsGate = false
  const display = (device, width) => {
    let value = 'block'
    ast.walkRules(rule => {
      if (!rule.selector.split(',').some(s => new RegExp('\\.immersive-scene\\[data-device=["\']?' + device + '["\']?\\]').test(s))) return
      const media = ancestors(rule).filter(a => a.name === 'media')
      if (media.some(a => !deviceMedia(a.params) || (deviceMedia(a.params) === 'mobile' ? width >= 768 : width < 768))) return
      rule.walkDecls('display', decl => { value = decl.value })
    })
    return value
  }
  for (const width of [393, 767, 768, 1440]) for (const device of ['mobile', 'desktop']) assert.equal(display(device, width), (width < 768) === (device === 'mobile') ? 'block' : 'none', `${device} display at ${width}px`)
  ast.walkRules(rule => {
    if (rule.selector.includes('.immersive-stage')) rule.walkDecls('position', decl => { if (decl.value === 'sticky') sticky = true })
    if (/immersive-tagline/.test(rule.selector)) rule.walkDecls('opacity', decl => {
      if (decl.value === '0') { assert.match(rule.selector, /\.js\b/, 'tagline opacity zero requires JS'); jsGate = true }
    })
    rule.walkDecls('animation', () => {
      const collapsed = ancestors(rule).some(a => a.name === 'media' && /prefers-reduced-motion\s*:\s*reduce|\bprint\b/.test(a.params))
      const targets = [...stage.querySelectorAll('[data-immersive-animate]'), ...stage.querySelectorAll('[data-immersive-exit]')]
      const applies = /data-immersive-(?:animate|exit)/.test(rule.selector) || targets.some(el => {
        try { return el.matches(rule.selector) } catch { return false }
      })
      if (applies) assert.ok(collapsed, 'animation shorthand outside collapse resets animation-timeline: ' + rule.selector)
    })
  })
  ast.walkAtRules('supports', gate => {
    if (!/animation-timeline\s*:\s*scroll\(\)/.test(gate.params)) return
    gate.walkRules(rule => {
      if (!rule.selector.includes('[data-immersive-animate]')) return
      rule.walkDecls('animation-timeline', decl => { if (decl.value.includes('--immersive')) scroll = true })
    })
  })
  assert.ok(sticky, 'stage is sticky')
  assert.ok(scroll, 'immersive animated nodes set timeline inside their own supports gate')
  assert.ok(jsGate, 'tagline has a JS opacity gate')
  for (const mode of [/prefers-reduced-motion\s*:\s*reduce/, ...(options.print === false ? [] : [/\bprint\b/])]) {
    const blocks = []
    ast.walkAtRules('media', rule => { if (mode.test(rule.params) && /\.immersive/.test(rule.toString())) blocks.push(rule.toString()) })
    assert.ok(blocks.length, 'collapse media ' + mode)
    assertCollapse(postcss.parse(blocks.join('\n')), String(mode))
  }
  assert.match(allCss, /html\[data-immersive-fallback\]/)
  assert.match(allCss, /--immersive-progress/)
  const noscript = [...html.matchAll(/<noscript\b[^>]*>\s*<style\b[^>]*>([\s\S]*?)<\/style>\s*<\/noscript>/gi)].map(([, code]) => code).join('\n')
  assert.ok(noscript, 'noscript stylesheet')
  assertCollapse(postcss.parse(noscript), 'noscript')
  return section
}
