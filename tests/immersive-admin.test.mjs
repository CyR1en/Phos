import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { bundle } from './helpers/bundle.mjs'
import { pixels } from './helpers/immersive-contracts.mjs'
import { validateImmersive } from '../lib/immersive-schema.mjs'

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8')
const admin = path => read('src/components/admin/' + path)
const pos = { x: 0, y: 0, w: 20, h: 18, z: 1 }
const gallery = patch => ({ enabled: true, text: 'Light, held still.', eyebrow: 'Photographs', intensity: 'dramatic', scrollLength: 'standard', atmosphere: 'stars',
  desktopPhotos: ['matrix/a.jpg'], mobilePhotos: ['matrix/b.jpg'], desktopPositions: [{ ...pos }], mobilePositions: [null], ...patch })

test('immersive validation accepts valid settings, null/short positions, hidden slots and partial galleries', () => {
  for (const value of [gallery(), {}, { enabled: false }, { text: '' }, { desktopPositions: null },
    gallery({ desktopPositions: [] }), gallery({ desktopPositions: [null] }), gallery({ desktopPositions: [{ ...pos, w: 0, h: 0 }] }),
    { intensity: 'balanced', scrollLength: 'short', atmosphere: 'none' }]) assert.equal(validateImmersive(value), null)
})

for (const [field, min, max, integer] of [
  ['x', -50, 50], ['y', -60, 60], ['w', 10, 100], ['h', 8, 100], ['z', 0, 100, true], ['br', 0, 100, true],
  ['cropX', 0, 100], ['cropY', 0, 100], ['cropZoom', 1, 3],
]) test(`immersive validation checks ${field} range, finite values${integer ? ' and integers' : ''} with an exact path`, () => {
  for (const device of ['mobile', 'desktop']) {
    const path = `home.immersiveGallery.${device}Positions[0].${field}`
    for (const value of [min - 1, max + 1, NaN, Infinity, -Infinity, '1', ...(integer ? [1.5] : [])]) {
      const error = validateImmersive(gallery({ [`${device}Positions`]: [{ ...pos, [field]: value }] }))
      assert.equal(typeof error, 'string')
      assert.ok(error.includes(path), `${field}=${value}: ${error}`)
    }
    for (const value of [min, max]) assert.equal(validateImmersive(gallery({ [`${device}Positions`]: [{ ...pos, [field]: value }] })), null)
  }
})

test('immersive validation rejects invalid shapes, copy, enums and photo arrays with field paths', () => {
  for (const value of [null, [], 'gallery', 1]) assert.match(validateImmersive(value), /home\.immersiveGallery/)
  for (const [field, value] of [
    ['enabled', 'yes'], ['text', 4], ['text', 'x'.repeat(281)], ['eyebrow', false],
    ['intensity', 'extreme'], ['scrollLength', 'endless'], ['atmosphere', 'glow'],
    ['desktopPhotos', null], ['mobilePhotos', ['a.jpg']], ['desktopPhotos', ['../a.jpg']],
    ['desktopPhotos', ['matrix/a.jpg', 'matrix/a.jpg']],
    ['mobilePhotos', Array.from({ length: 25 }, (_, i) => `matrix/${i}.jpg`)],
    ['desktopPositions', {}], ['mobilePositions', [null, null]], ['desktopPositions', [false]],
  ]) {
    const error = validateImmersive(gallery({ [field]: value }))
    assert.equal(typeof error, 'string')
    assert.ok(error.includes('home.immersiveGallery.' + field), `${field}: ${error}`)
  }
})

test('admin server runs immersive validation inside validateConfig', async () => {
  const source = await read('admin/server.mjs')
  assert.match(source, /import\s*\{[^}]*validateImmersive[^}]*\}\s*from\s*['"][^'"]*immersive-schema\.mjs['"]/)
  const body = source.match(/function validateConfig\(body(?:,\s*storedGallery)?\)\s*\{([\s\S]*?)\n\}/)?.[1]
  assert.ok(body)
  assert.match(body, /validateImmersive\(body\.home\.immersiveGallery(?:,\s*storedGallery)?\)/)
  assert.match(body, /Object\.hasOwn\(body\.home,\s*['"]immersiveGallery['"]\)/)
})

test('Home owns an immersive card and generic ObjectField skips the duplicate section', async () => {
  const [home, object, card] = await Promise.all([admin('pages/HomePage.tsx'), admin('fields/ObjectField.tsx'), admin('pages/ImmersiveGallerySection.tsx')])
  assert.match(home, /<ImmersiveGallerySection\s*\/>/)
  assert.match(object, /if\s*\(\s*path\s*===\s*['"]home['"]\s*&&\s*key\s*===\s*['"]immersiveGallery['"]\s*\)\s*return\s+null/)
  for (const field of ['text', 'eyebrow', 'intensity', 'scrollLength', 'atmosphere']) assert.ok(card.includes(`home.immersiveGallery.${field}`), field + ' bound editor')
  assert.match(card, /setValue\([^\n]*\.enabled/)
  assert.match(card, /<TextAreaField\b[\s\S]*?path=['"]home\.immersiveGallery\.text['"]/)
  assert.doesNotMatch(card, /<(?:TextField|input)\b[^>]*path=['"]home\.immersiveGallery\.text['"]/)
})

// Execute current TSX with a tiny JSX tree, stubbing only context and surrounding UI.
// TextAreaField is the real implementation, so the tagline's native control is checked.
async function renderCard(value) {
  const [source, textarea, manifest] = await Promise.all([
    admin('pages/ImmersiveGallerySection.tsx'), admin('fields/TextAreaField.tsx'), read('src/generated/categories.json').then(JSON.parse),
  ])
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children }, children }) }
  const compile = code => ts.transpileModule(code.replace(/^import\s+.*$/gm, '').replace(/^export\s+/gm, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText
  const useConfig = () => ({ getValue: path => path === 'home.immersiveGallery' ? value : value?.[path.split('.').at(-1)], setValue() {}, flushSave: async () => true })
  const TextAreaField = new Function('React', 'useConfig', 'useEffect', compile(textarea) + '\nreturn TextAreaField')(React, useConfig, () => {})
  const stub = name => props => React.createElement(name, props, ...props.children)
  const Card = new Function('React', 'rawManifest', 'useConfig', 'TextAreaField', 'TextField', 'SelectField', 'Section', 'ImmersiveLayoutEditor',
    compile(source) + '\nreturn ImmersiveGallerySection')(React, manifest, useConfig, TextAreaField, stub('input'), stub('select'), stub('section'), stub('editor'))
  const all = []
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit)
    if (node == null || typeof node === 'boolean') return
    if (typeof node !== 'object') return
    if (typeof node.type === 'function') return visit(node.type(node.props))
    all.push(node)
    visit(node.children)
  }
  visit(Card())
  return { all, manifest }
}
const nodeText = node => Array.isArray(node) ? node.map(nodeText).join('') : node == null || typeof node === 'boolean' ? '' : typeof node === 'object' ? nodeText(node.children) : String(node)

test('immersive card renders textarea, placeholder notice and status precedence Off → desktop → mobile → placeholder → Live', async () => {
  const { manifest } = await renderCard({})
  const key = manifest.categories.flatMap(c => c.photos.map(p => `${c.slug}/${p.filename}`))[0]
  assert.ok(key, 'status cases need one manifest photo')
  const populated = { enabled: true, desktopPhotos: [key], mobilePhotos: [key], text: 'A real tagline' }
  for (const [patch, status, placeholder] of [
    [{ enabled: false, desktopPhotos: [], mobilePhotos: [], text: 'Lorem ipsum' }, 'Off', true],
    [{ desktopPhotos: [], mobilePhotos: [], text: 'Lorem ipsum' }, 'Needs desktop photos', true],
    [{ mobilePhotos: [], text: 'Lorem ipsum' }, 'Mobile empty', true],
    [{ text: 'lOrEm ipsum' }, 'Placeholder tagline', true], [{}, 'Live', false],
  ]) {
    const { all } = await renderCard({ ...populated, ...patch })
    const pill = all.find(n => n.type === 'span' && n.props.role === 'status')
    assert.equal(nodeText(pill).trim(), status)
    const native = all.filter(n => n.props.id === 'home-immersiveGallery-text')
    assert.equal(native.length, 1)
    assert.equal(native[0].type, 'textarea')
    assert.equal(all.some(n => n.props.id === 'immersive-tagline-placeholder'), placeholder)
  }
})

test('immersive layout save executes a snapshot that preserves new settings and literal z values', async () => {
  const source = await admin('fields/ImmersiveLayoutEditor.tsx')
  const save = source.match(/const handleSave\s*=\s*useCallback\(async\s*\(\)\s*=>\s*\{([\s\S]*?)\n  \},/)?.[1]
  assert.ok(save)
  const helpers = await bundle('src/components/admin/fields/immersive/utils.ts')
  const stored = { enabled: false, text: 'Keep copy', intensity: 'subtle', scrollLength: 'long', atmosphere: 'none', futureSetting: { keep: true }, photos: ['old/a.jpg'], positions: [pos] }
  const local = { mobilePhotos: ['matrix/new.jpg'], mobilePositions: [{ ...pos, z: 37 }], desktopPhotos: ['matrix/new.jpg'], desktopPositions: [{ ...pos, z: 81 }] }
  let actual
  const scope = { ...helpers, path: 'home.immersiveGallery', getValue: () => stored,
    setValue: (path, value) => { assert.equal(path, 'home.immersiveGallery'); actual = value },
    flushSave: async () => true, setDirty() {}, setOpen() {}, pushToast() {}, setSaveError() {},
    saveToastIdsRef: { current: new Set() }, toasts: [],
    localMobilePhotos: local.mobilePhotos, localMobilePositions: local.mobilePositions,
    localDesktopPhotos: local.desktopPhotos, localDesktopPositions: local.desktopPositions,
  }
  const code = ts.transpileModule(`return (async () => { ${save} })()`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  await new Function(...Object.keys(scope), code)(...Object.values(scope))
  const { photos, positions, ...retained } = stored
  assert.deepEqual(actual, { ...retained, ...local })
  assert.deepEqual(stored.photos, ['old/a.jpg'], 'stored object remains unchanged')
})

test('admin store installs and removes beforeunload only while edits are dirty', async () => {
  const source = await read('src/lib/admin/store.tsx')
  assert.match(source, /if\s*\(!hasUnsavedChanges\)\s*return/)
  assert.match(source, /window\.addEventListener\(['"]beforeunload['"],\s*onBeforeUnload\)/)
  assert.match(source, /return\s*\(\)\s*=>\s*window\.removeEventListener\(['"]beforeunload['"],\s*onBeforeUnload\)/)
  assert.match(source, /event\.preventDefault\(\)/)
})

test('immersive editor shares STAGE and labels a range input Scroll preview and depth control', async () => {
  const source = await admin('fields/ImmersiveLayoutEditor.tsx')
  assert.match(source, /import\s*\{[^}]*\bSTAGE\b[^}]*\}\s*from\s*['"][^'"]*immersive-motion['"]/)
  assert.match(source, /STAGE\.scale/)
  assert.match(source, /STAGE\.offsetY/)
  assert.match(source, /Scroll preview/)
  assert.match(source, /<input\b[^>]*type=['"]range['"]/)
  assert.match(source, /(?:label=['"]Depth['"]|>\s*Depth(?:\{|\s*<))/)
})

test('all three immersive modals expose dialog semantics', async () => {
  for (const path of ['fields/ImmersiveLayoutEditor.tsx', 'fields/immersive/PhotoPicker.tsx', 'fields/immersive/CropEditor.tsx']) {
    const source = await admin(path)
    assert.match(source, /role=['"]dialog['"]/, path)
    assert.match(source, /aria-modal=(?:['"]true['"]|\{true\})/, path)
    assert.match(source, /aria-label(?:ledby)?=/, path)
  }
})

test('immersive editor has one Add Photo action and uses the per-photo nudge helper', async () => {
  const source = await admin('fields/ImmersiveLayoutEditor.tsx')
  assert.equal([...source.matchAll(/>\s*Add Photo\s*</g)].length, 1)
  assert.match(source, /\bnudgePositions\(/)
})

test('crop zoom is capped at 3 and multi-select nudge preserves relative positions', async () => {
  const { applyPatch, nudgePositions } = await bundle('src/components/admin/fields/immersive/utils.ts')
  assert.equal(applyPatch(pos, { cropZoom: 50 }).cropZoom, 3)
  assert.equal(applyPatch(pos, { cropZoom: 0 }).cropZoom, 1)
  const original = [{ ...pos, x: -12, y: 4 }, { ...pos, x: 8, y: -6 }, { ...pos, x: 19, y: 12 }]
  for (const step of [1, 5]) {
    const moved = nudgePositions(original, [0, 1], step, -step)
    assert.deepEqual(moved.map(p => [p.x, p.y]), [[-12 + step, 4 - step], [8 + step, -6 - step], [19, 12]])
    assert.deepEqual(original.map(p => [p.x, p.y]), [[-12, 4], [8, -6], [19, 12]], 'input remains unchanged')
  }
})


test('layoutSnapshot keeps unknown settings, drops legacy keys and leaves local z values untouched', async () => {
  const { layoutSnapshot } = await bundle('src/components/admin/fields/immersive/utils.ts')
  assert.equal(typeof layoutSnapshot, 'function')
  const stored = { enabled: false, text: 'Keep me', newFeel: { future: true }, photos: ['legacy/a.jpg'], positions: [pos] }
  const local = { mobilePhotos: ['matrix/b.jpg'], mobilePositions: [{ ...pos, z: 73 }], desktopPhotos: ['matrix/a.jpg'], desktopPositions: [{ ...pos, z: 73 }, { ...pos, z: 73 }] }
  const before = structuredClone({ stored, local })
  assert.deepEqual(layoutSnapshot(stored, local), { enabled: false, text: 'Keep me', newFeel: { future: true }, ...local })
  assert.deepEqual(layoutSnapshot(undefined, local), local)
  assert.deepEqual({ stored, local }, before)
})

test('reorderDepth and applyTypedDepth preserve unmoved tie groups for front/back/up/down and typed ranks', async () => {
  const { reorderDepth, applyTypedDepth } = await bundle('src/components/admin/fields/immersive/utils.ts')
  const original = [10, 20, 20, 40].map((z, i) => ({ ...pos, x: i, z }))
  const cases = [[0, 'front', [3, 1, 1, 2]], [0, 'back', [1, 2, 2, 3]], [0, 'up', [2, 1, 1, 3]], [3, 'down', [1, 3, 3, 2]]]
  for (const [index, dir, expected] of cases) {
    const result = reorderDepth(original, index, dir)
    assert.deepEqual(result.map(p => p.z), expected, dir)
    assert.deepEqual(result.map(p => p.x), [0, 1, 2, 3])
    assert.equal(result[1].z, result[2].z, 'unmoved ties stay tied')
  }
  for (const [k, expected] of [[2, [2, 1, 1, 3]], [-10, [1, 2, 2, 3]], [99, [3, 1, 1, 2]]]) assert.deepEqual(applyTypedDepth(original, 0, k).map(p => p.z), expected)
  assert.deepEqual(original.map(p => p.z), [10, 20, 20, 40])
  assert.deepEqual(applyTypedDepth(original, 0, NaN), original)
  const hidden = [{ ...pos, w: 0, h: 0, z: 99 }, ...original]
  assert.deepEqual(reorderDepth(hidden, 0, 'front'), hidden)
  assert.equal(reorderDepth(hidden, 1, 'front')[0].z, 99)
})

test('canvasFrameStyle uses each viewport axis and the data-stage transform matches STAGE numerically', async () => {
  const { canvasFrameStyle } = await bundle('src/components/admin/fields/immersive/utils.ts')
  const { frameStyle, STAGE } = await bundle('src/lib/immersive-motion.ts')
  const source = await admin('fields/ImmersiveLayoutEditor.tsx')
  const style = source.match(/<div\s+data-stage\b[\s\S]*?style=\{\{([\s\S]*?)\}\}/)?.[1]
  assert.ok(style, 'data-stage owns the static transform')
  for (const canvas of [{ w: 280, h: 607 }, { w: 960, h: 540 }]) for (const p of [{ ...pos, x: -22, y: -28, w: 44, h: 22 }, { ...pos, x: 31, y: 19, w: 24, h: 39, br: 9 }]) {
    const expected = frameStyle(p), actual = canvasFrameStyle(p, canvas)
    for (const property of ['left', 'top', 'width', 'height']) assert.ok(Math.abs(pixels(actual[property], canvas.w, canvas.h) - pixels(expected[property], canvas.w, canvas.h)) < 1e-9, property)
    const origins = value => value.match(/calc\([^)]*\)/g).map(v => pixels(v, canvas.w, canvas.h))
    origins(actual['transform-origin']).forEach((value, i) => assert.ok(Math.abs(value - origins(expected['transform-origin'])[i]) < 1e-9))
    assert.equal(actual['z-index'], expected['z-index'])
    const stage = new Function('canvas', 'STAGE', `return ({ ${style} })`)(canvas, STAGE)
    const transform = stage.transform.match(/^translateY\(([\d.]+)(px|%)\) scale\(([\d.]+)\)$/)
    assert.ok(transform, stage.transform)
    assert.ok(Math.abs(Number(transform[1]) * (transform[2] === '%' ? canvas.h / 100 : 1) - canvas.h * 0.025) < 1e-9)
    assert.equal(Number(transform[3]), 0.9)
    assert.equal(stage.transformOrigin, 'center')
    // Compose the frame centre through STAGE around the canvas centre.
    const left = pixels(actual.left, canvas.w, canvas.h), top = pixels(actual.top, canvas.w, canvas.h)
    const x = canvas.w / 2 + (left + p.w / 200 * canvas.w - canvas.w / 2) * STAGE.scale
    const y = canvas.h / 2 + (top + p.h / 200 * canvas.h - canvas.h / 2) * STAGE.scale + canvas.h * STAGE.offsetY / 100
    assert.ok(Math.abs(x - (canvas.w / 2 + p.x / 100 * canvas.w * 0.9)) < 1e-9)
    assert.ok(Math.abs(y - (canvas.h / 2 + (p.y * 0.9 + 2.5) / 100 * canvas.h)) < 1e-9)
  }
})

test('validateImmersive rejects traversal segments and incomplete or half-hidden positions, but accepts literal double dots', () => {
  for (const filename of ['final..v2.jpg', '..final.jpg', 'final...jpg']) assert.equal(validateImmersive(gallery({ desktopPhotos: ['matrix/' + filename] })), null)
  for (const key of ['../a.jpg', 'matrix/..', './a.jpg', 'matrix/.', 'matrix/../a.jpg', 'matrix\\a.jpg']) assert.match(validateImmersive(gallery({ desktopPhotos: [key] })), /desktopPhotos/)
  for (const field of ['x', 'y', 'w', 'h', 'z']) {
    const partial = { ...pos }; delete partial[field]
    assert.match(validateImmersive(gallery({ desktopPositions: [partial] })), new RegExp('desktopPositions\\[0\\]\\.' + field))
  }
  for (const patch of [{ w: 0 }, { h: 0 }]) assert.match(validateImmersive(gallery({ desktopPositions: [{ ...pos, ...patch }] })), /desktopPositions\[0\]\.(w|h)/)
  assert.equal(validateImmersive({ desktopPositions: [pos, pos, null] }), null, 'missing photo key does not impose a zero-length limit')
})

test('unchanged over-limit stored copy is accepted while changed over-limit copy fails', () => {
  const stored = { text: 'x'.repeat(281), eyebrow: 'e'.repeat(81) }
  assert.equal(validateImmersive({ ...stored, intensity: 'balanced' }, stored), null)
  assert.match(validateImmersive({ text: 'y'.repeat(281) }, stored), /text/)
  assert.match(validateImmersive({ eyebrow: 'f'.repeat(81) }, stored), /eyebrow/)
})

test('card counter states / 280 and cropImageStyle is re-exported from the public motion module', async () => {
  const { all } = await renderCard({ text: 'Light', desktopPhotos: [], mobilePhotos: [] })
  assert.match(nodeText(all.find(n => n.props.id === 'immersive-tagline-count')), /5\s*\/\s*280/)
  const source = await admin('fields/immersive/utils.ts')
  assert.match(source, /export\s*\{\s*cropImageStyle\s*\}\s*from\s*['"][^'"]*immersive-motion['"]/) 
  const { cropImageStyle } = await bundle('src/components/admin/fields/immersive/utils.ts')
  assert.deepEqual(cropImageStyle(), { objectPosition: '50% 50%', transform: 'translate(0%, 0%) scale(1)', transformOrigin: 'center' })
  assert.deepEqual(cropImageStyle(20, 80, 2), { objectPosition: '20% 80%', transform: 'translate(30%, -30%) scale(2)', transformOrigin: 'center' })
  for (const [zoom, expected] of [[0, 1], [9, 3], [Infinity, 1], [NaN, 1]]) assert.match(cropImageStyle(50, 50, zoom).transform, new RegExp(`scale\\(${expected}\\)`))
})

test('readDeviceDraft keeps literal depths and ties on open and drops unavailable photos with their positions', async () => {
  const { readDeviceDraft } = await bundle('src/components/admin/fields/immersive/utils.ts')
  const available = new Set(['matrix/a.jpg', 'matrix/b.jpg', 'matrix/c.jpg'])
  const tied = [{ ...pos, z: 5 }, { ...pos, x: 10, z: 5 }, { ...pos, x: 20, z: 2 }]
  const opened = readDeviceDraft(['matrix/a.jpg', 'matrix/b.jpg', 'matrix/c.jpg'], tied, 'desktop', available)
  assert.deepEqual(opened.positions.map(p => p.z), [5, 5, 2], 'opening never renumbers depth')
  assert.deepEqual(opened.positions.map(p => p.x), [0, 10, 20])
  assert.equal(opened.removed, 0)
  assert.notStrictEqual(opened.positions[0], tied[0], 'draft positions are copies')
  const dropped = readDeviceDraft(['matrix/a.jpg', 'gone/x.jpg', 'matrix/c.jpg'], tied, 'desktop', available)
  assert.deepEqual(dropped.photos, ['matrix/a.jpg', 'matrix/c.jpg'])
  assert.deepEqual(dropped.positions.map(p => p.x), [0, 20], 'a removed photo takes its own position with it')
  assert.equal(dropped.removed, 1)
  const defaults = readDeviceDraft(['matrix/a.jpg', 'matrix/b.jpg'], null, 'mobile', available)
  assert.equal(defaults.positions.length, 2)
  assert.ok(defaults.positions.every(p => ['x', 'y', 'w', 'h', 'z'].every(key => Number.isFinite(p[key]))), 'null positions resolve to full defaults')
  assert.deepEqual(readDeviceDraft(undefined, undefined, 'desktop', available), { photos: [], positions: [], removed: 0 })
})
