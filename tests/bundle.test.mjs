import { test } from 'node:test'
import assert from 'node:assert/strict'
import { astroScriptBlocks, astroScripts } from './helpers/bundle.mjs'

test('Astro extraction: self-closing scripts do not consume a following block', () => {
  const blocks = astroScriptBlocks('<script src="/external.js" /><script>const value: number = 1</script><script is:inline>window.value = 2</script>')
  assert.deepEqual(blocks, [
    { code: '', inline: false },
    { code: 'const value: number = 1', inline: false },
    { code: 'window.value = 2', inline: true },
  ])
})

test('Astro extraction: every non-src attribute implies inline JS', () => {
  for (const attribute of ['is:inline', 'type="module"', 'defer', 'data-test="a > b"', 'nonce="test"']) {
    const blocks = astroScriptBlocks(`<script src="/external.js" ${attribute}>window.value = 1</script>`)
    assert.equal(blocks[0].inline, true, attribute)
  }
  assert.equal(astroScriptBlocks('<script src="/external.js"></script>')[0].inline, false)
})

test('Astro extraction: executable component and inline scripts use strict mode', async () => {
  for (const [path, options] of [['src/components/Header.astro', {}], ['src/layouts/BaseLayout.astro', { inline: true }]]) {
    for (const code of await astroScripts(path, options)) assert.match(code, /^'use strict';/)
  }
})
