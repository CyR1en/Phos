import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { bundle } from './helpers/bundle.mjs'

const siteUrl = 'https://phos.test'
const configOg = { image: '/social/configured.jpg', imageAlt: 'Configured cover', imageWidth: 1600, imageHeight: 900 }
const hero = { ogImage: '/photos/og/hero.jpg', full: '/photos/full/hero.jpg', title: 'An explicit hero title', titleIsAuto: false }
const resolve = async options => {
  const { resolveOpenGraph } = await bundle('src/lib/og.ts')
  const { url, alt, width, height } = resolveOpenGraph({ siteUrl, ...options })
  return { url, alt, width, height }
}
const expected = (url, alt, width, height) => ({ url, alt, width, height })

const cases = [
  ['configured image carries its own alt and configured dimensions', { configOg, hero }, expected(siteUrl + configOg.image, configOg.imageAlt, 1600, 900)],
  ['absolute configured URL is not prefixed with the site URL', { configOg: { ...configOg, image: 'https://cdn.example.test/cover.jpg' }, hero }, expected('https://cdn.example.test/cover.jpg', configOg.imageAlt, 1600, 900)],
  ['home passing the configured image keeps configured alt and dimensions', { image: configOg.image, configOg, hero }, expected(siteUrl + configOg.image, configOg.imageAlt, 1600, 900)],
  ['absolute and relative forms of the configured image share metadata', { image: siteUrl + configOg.image, configOg, hero }, expected(siteUrl + configOg.image, configOg.imageAlt, 1600, 900)],
  ['explicit hero title supplies alt and the OG crop supplies dimensions', { hero }, expected(siteUrl + hero.ogImage, hero.title, 1200, 630)],
  ['auto hero title supplies no alt', { hero: { ...hero, titleIsAuto: true } }, expected(siteUrl + hero.ogImage, undefined, 1200, 630)],
  ['photos/og dimensions override configured dimensions', { configOg: { ...configOg, image: '/photos/og/configured.jpg' } }, expected(siteUrl + '/photos/og/configured.jpg', configOg.imageAlt, 1200, 630)],
  ['photos/full never inherits configured dimensions', { configOg: { ...configOg, image: '/photos/full/configured.jpg' } }, expected(siteUrl + '/photos/full/configured.jpg', configOg.imageAlt, undefined, undefined)],
  ['page-provided full hero preserves explicit title without inventing dimensions', { image: hero.full, configOg, hero }, expected(siteUrl + hero.full, hero.title, undefined, undefined)],
  ['page gallery image does not borrow config or unrelated hero alt', { image: '/photos/og/gallery.jpg', configOg, hero }, expected(siteUrl + '/photos/og/gallery.jpg', undefined, 1200, 630)],
  ['empty hero and config produce no URL or metadata', { hero: {}, configOg: {} }, expected(undefined, undefined, undefined, undefined)],
]
for (const [name, input, output] of cases) test('OG resolver: ' + name, async () => assert.deepEqual(await resolve(input), output))

test('BaseLayout passes the first hero and configured OG to the resolver and emits its alt', async () => {
  const source = await readFile(new URL('../src/layouts/BaseLayout.astro', import.meta.url), 'utf8')
  const call = source.match(/\bresolveOpenGraph\s*\(\s*\{([\s\S]*?)\}\s*\)/)?.[1]
  assert.ok(call, 'BaseLayout calls the shared resolver')
  assert.match(call, /\bhero\s*:\s*(?:manifest\.)?heroPriority\s*\[\s*0\s*\]/)
  assert.match(call, /(?:^|,)\s*configOg\s*(?::\s*configOg\s*)?(?=,|$)/, 'resolver receives the configured OG alias')
  assert.match(source, /\bconst\s+configOg\s*=\s*config\.site\??\.og[ \t]*;?[ \t]*$/m, 'alias is the complete configured OG object')
  const fields = source.match(/const\s*\{([^}]+)\}\s*=\s*resolveOpenGraph\s*\(/)?.[1]
  assert.ok(fields, 'resolver fields are consumed by the layout')
  const alt = fields.match(/\balt\s*:\s*(\w+)/)?.[1] || (/\balt\s*(?:,|$)/.test(fields) ? 'alt' : null)
  assert.ok(alt, 'alt comes from the resolver result')
  const meta = source.match(/<meta\b[^>]*\bproperty=['"]og:image:alt['"][^>]*\/>/)?.[0]
  assert.ok(meta, 'BaseLayout emits og:image:alt')
  assert.match(meta, new RegExp('\\bcontent=\\{\\s*' + alt + '\\s*\\}'), 'meta content uses the resolver alt')
})
