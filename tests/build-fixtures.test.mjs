import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { cp, mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { repoRoot } from './helpers/bundle.mjs'

const run = promisify(execFile)
const decodeAttribute = value => value.replace(/&(?:amp|quot|apos|lt|gt|#(x[\da-f]+|\d+));/gi, (entity, number) => number
  ? String.fromCodePoint(parseInt(number.replace(/^x/i, ''), /^x/i.test(number) ? 16 : 10))
  : ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' }[entity.toLowerCase()]))
const attributes = tag => new Map([...tag.matchAll(/([^\s=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)]
  .map(([, name, double, single, bare]) => [name, decodeAttribute(double ?? single ?? bare ?? '')]))
function photoUrls(value) {
  if (typeof value === 'string') return value.startsWith('/photos/') ? [value] : []
  return value && typeof value === 'object' ? Object.values(value).flatMap(photoUrls) : []
}

test('isolated Astro build serves immersive manifest sources with the gallery enabled', {
  skip: process.env.PHOS_BUILD_FIXTURES !== '1' && 'opt-in: PHOS_BUILD_FIXTURES=1 node --test tests/build-fixtures.test.mjs',
  timeout: 300000,
}, async t => {
  const ROOT = await realpath(await mkdtemp(join(tmpdir(), 'phos-build-fixture-')))
  t.after(() => rm(ROOT, { recursive: true, force: true }))
  const excluded = ['node_modules', 'dist', 'public/photos', '.git', 'config', 'AppData']
  await cp(repoRoot, ROOT, { recursive: true, filter: path => {
    const name = relative(repoRoot, path).split('\\').join('/')
    return !excluded.some(exclusion => name === exclusion || name.startsWith(exclusion + '/'))
  } })
  // A node_modules symlink makes Astro derive metadata from the real checkout.
  // APFS clonefile keeps the copy cheap while retaining a genuinely separate tree.
  try {
    await run('cp', ['-cR', join(repoRoot, 'node_modules'), join(ROOT, 'node_modules')], { timeout: 60000 })
  } catch {
    await rm(join(ROOT, 'node_modules'), { recursive: true, force: true })
    await run('cp', ['-R', join(repoRoot, 'node_modules'), join(ROOT, 'node_modules')], { timeout: 120000 })
  }
  await mkdir(join(ROOT, 'src/generated'), { recursive: true })
  for (const entry of await readdir(join(repoRoot, 'src/generated'))) {
    if (entry.endsWith('.json')) await cp(join(repoRoot, 'src/generated', entry), join(ROOT, 'src/generated', entry))
  }
  await mkdir(join(ROOT, 'public'), { recursive: true })
  await symlink(join(repoRoot, 'public/photos'), join(ROOT, 'public/photos'), 'dir')
  const manifest = JSON.parse(await readFile(join(ROOT, 'src/generated/categories.json'), 'utf8'))
  const keys = manifest.categories.flatMap(category => category.photos.map(photo => category.slug + '/' + photo.filename)).slice(0, 6)
  assert.equal(keys.length, 6, 'build fixture requires six generated manifest photos')
  const configPath = join(ROOT, 'src/generated/site-config.json')
  const config = JSON.parse(await readFile(configPath, 'utf8'))
  config.home.immersiveGallery = {
    ...config.home.immersiveGallery, enabled: true,
    desktopPhotos: keys, mobilePhotos: keys, desktopPositions: null, mobilePositions: null,
  }
  if (Array.isArray(config.home.layout) && !config.home.layout.includes('immersiveGallery')) config.home.layout.push('immersiveGallery')
  await writeFile(configPath, JSON.stringify(config, null, 2))
  try {
    await run('npx', ['astro', 'build'], {
      cwd: ROOT, env: { ...process.env, PHOS_SKIP_CONFIG_SYNC: '1', PUBLIC_SITE_URL: 'https://phos.test' },
      timeout: 240000, maxBuffer: 16 * 1024 * 1024,
    })
  } catch (error) {
    assert.fail(`isolated Astro build failed (${error.code ?? error.signal}):\n${error.stdout ?? ''}\n${error.stderr ?? ''}`)
  }
  const html = await readFile(join(ROOT, 'dist/index.html'), 'utf8')
  const islands = [...html.matchAll(/<astro-island\b[^>]*>/g)].map(([tag]) => attributes(tag))
  const gallery = islands.find(attrs => /immersive-scroll-gallery/.test(attrs.get('component-url') || ''))
  assert.ok(gallery, 'enabled gallery emits an astro-island')
  assert.equal(gallery.get('client'), 'only', 'browser-only island avoids gallery SSR')
  const props = JSON.parse(gallery.get('props') || '{}')
  assert.ok(Object.hasOwn(props, 'sources'), 'serialized island props include sources')
  const urls = photoUrls(props.sources)
  assert.equal(urls.length, keys.length * 3, 'each selected photo has thumb, immersive and mobile sources')
  for (const url of urls) {
    const path = decodeURIComponent(new URL(url, 'https://phos.test').pathname)
    assert.ok(existsSync(join(ROOT, 'public', path)), 'serialized manifest URL exists: ' + url)
  }
  const markup = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
  for (const [tag] of markup.matchAll(/<[a-z][\w:-]*\b[^>]*>/gi)) {
    for (const field of ['src', 'srcset', 'href', 'data-src', 'data-srcset']) {
      for (const [url] of (attributes(tag).get(field) || '').matchAll(/\/photos\/immersive\/[^\s,"'<>]+/g)) {
        const path = decodeURIComponent(new URL(url, 'https://phos.test').pathname)
        assert.ok(existsSync(join(ROOT, 'public', path)), 'SSR immersive reference exists: ' + url)
      }
    }
  }
})
