import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const css = await readFile(new URL('../src/styles/themes/gallery.css', import.meta.url), 'utf8')
const declarations = new Map(
  [...css.matchAll(/--color-phos-([\w-]+):\s*(#[\da-f]{6})\s*;/gi)].map(([, name, hex]) => [
    name,
    hex
  ])
)

function luminance(hex) {
  assert.match(hex || '', /^#[\da-f]{6}$/i, 'palette token exists and is an sRGB hex color')
  const [r, g, b] = [1, 3, 5]
    .map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

for (const mode of ['light', 'dark']) {
  for (const foreground of ['text', 'muted', 'subtle', 'error']) {
    for (const background of ['base', 'surface']) {
      test(`gallery ${mode}: ${foreground} on ${background} meets WCAG AA text contrast`, () => {
        const prefix = mode === 'dark' ? 'dark-' : ''
        const a = luminance(declarations.get(prefix + foreground))
        const b = luminance(declarations.get(prefix + background))
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
        assert.ok(ratio >= 4.5, `contrast ${ratio.toFixed(3)}:1 is below 4.5:1`)
      })
    }
  }
}
