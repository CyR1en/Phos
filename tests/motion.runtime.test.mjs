import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bundle } from './helpers/bundle.mjs'
import { environment } from './helpers/runtime.mjs'

const fallbacks = {
  'out-expo': 'cubic-bezier(.16,1,.3,1)',
  sheet: 'cubic-bezier(.32,.72,0,1)',
  'in-out-sine': 'cubic-bezier(.37,0,.63,1)',
  exit: 'cubic-bezier(.4,0,1,1)',
}

test('motion easing reads trimmed computed --ease-<name> values and caches each name independently', async t => {
  const e = environment(t)
  const calls = []
  const tokens = Object.fromEntries(Object.keys(fallbacks).map((name, index) => ['--ease-' + name, `  cubic-bezier(0.${index + 1}, 0, 0.9, 1)  `]))
  globalThis.getComputedStyle = root => {
    assert.equal(root, e.document.documentElement)
    return { getPropertyValue: property => { calls.push(property); return tokens[property] || '' } }
  }
  const { easing } = await bundle('src/scripts/motion.ts', { fresh: true })
  for (const name of Object.keys(fallbacks)) {
    const property = '--ease-' + name
    const expected = tokens[property].trim()
    assert.equal(easing(name), expected)
    tokens[property] = 'linear'
    assert.equal(easing(name), expected, 'cached after token changes: ' + name)
  }
  assert.deepEqual(calls, Object.keys(fallbacks).map(name => '--ease-' + name))
})

for (const unavailable of ['missing', 'throws', 'empty']) {
  test(`motion easing uses and caches literal fallbacks when getComputedStyle ${unavailable}`, async t => {
    environment(t)
    let reads = 0
    if (unavailable === 'missing') delete globalThis.getComputedStyle
    else globalThis.getComputedStyle = () => {
      reads++
      if (unavailable === 'throws') throw new Error('styles unavailable')
      return { getPropertyValue: () => ' \n ' }
    }
    const { easing } = await bundle('src/scripts/motion.ts', { fresh: true })
    for (const [name, fallback] of Object.entries(fallbacks)) assert.equal(easing(name), fallback, name)
    assert.equal(reads, unavailable === 'missing' ? 0 : 4)
    let rereads = 0
    globalThis.getComputedStyle = () => {
      rereads++
      return { getPropertyValue: () => 'linear' }
    }
    for (const [name, fallback] of Object.entries(fallbacks)) assert.equal(easing(name), fallback, name)
    assert.equal(rereads, 0, 'cached fallbacks must not re-read computed styles, even when a reader throws')
  })
}

test('motion easing rejects unsupported CSS token values and caches the fallback', async t => {
  environment(t)
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'CSS')
  t.after(() => saved ? Object.defineProperty(globalThis, 'CSS', saved) : delete globalThis.CSS)
  const calls = []
  Object.defineProperty(globalThis, 'CSS', { configurable: true, value: {
    supports: (property, value) => { calls.push([property, value]); return value !== 'not-an-easing' },
  } })
  let reads = 0
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => { reads++; return '  not-an-easing  ' } })
  const { easing } = await bundle('src/scripts/motion.ts', { fresh: true })
  assert.equal(easing('out-expo'), fallbacks['out-expo'])
  assert.equal(easing('out-expo'), fallbacks['out-expo'])
  assert.equal(reads, 1)
  assert.deepEqual(calls, [['transition-timing-function', 'not-an-easing']])
})
