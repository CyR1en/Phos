import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { cp, mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { repoRoot, bundle } from './helpers/bundle.mjs'
import { assertImmersiveScene, assertImmersiveImages, keyframeStops, assertFrameGeometry } from './helpers/immersive-contracts.mjs'
import postcss from 'postcss'

const run = promisify(execFile)
test('isolated Astro builds render immersive manifest scenes with default and saved layouts', {
  skip: process.env.PHOS_BUILD_FIXTURES !== '1' && 'opt-in: PHOS_BUILD_FIXTURES=1 node --test tests/build-fixtures.test.mjs',
  timeout: 600000,
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
  const { frameStyle, peakSizes, ASPECT, INTENSITY } = await bundle('src/lib/immersive-motion.ts')
  const photosByKey = new Map(manifest.categories.flatMap(category => category.photos.map(photo => [category.slug + '/' + photo.filename, photo])))
  const { DEFAULT_POSITIONS } = await bundle('src/lib/immersive-defaults.ts')
  for (const saved of [false, true]) await t.test(saved ? 'saved device positions' : 'default device positions', async () => {
    const desktopPositions = saved ? keys.map((_, i) => ({ x: -24 + i * 9, y: 13 - i * 6, w: 23 + i, h: 18 + i * 2, z: 10 + i, br: i + 2, cropX: 35 + i, cropZoom: 1.1 })) : null
    const mobilePositions = saved ? keys.map((_, i) => ({ x: 20 - i * 7, y: -22 + i * 9, w: 35 + i, h: 18 + i, z: 20 - i, br: i + 3 })) : null
    config.home.immersiveGallery = {
      ...config.home.immersiveGallery, enabled: true, text: 'Lorem ipsum is deliberately rendered verbatim.', eyebrow: 'Photographs',
      intensity: 'balanced', scrollLength: 'short', atmosphere: 'stars',
      desktopPhotos: keys, mobilePhotos: keys, desktopPositions, mobilePositions,
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
    const cssFiles = (await readdir(join(ROOT, 'dist/_assets'))).filter(name => name.endsWith('.css'))
    const css = (await Promise.all(cssFiles.map(name => readFile(join(ROOT, 'dist/_assets', name), 'utf8')))).join('\n')
    const section = assertImmersiveScene(html, css, config.home.immersiveGallery)
    assert.equal(section.querySelectorAll('.immersive-layer').length, keys.length * 2)
    assertImmersiveImages(section)
    assert.match(section.getAttribute('style'), /140lvh/, 'short Feel setting reaches section height')
    const inline = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(([, code]) => code).join('\n')
    for (const device of ['mobile', 'desktop']) {
      const stops = keyframeStops(inline, 'immersive-layer-0', device)
      const max = Math.max(...stops.map(s => Number(s.props.get('transform').match(/scale\(([\d.]+)\)/)[1])))
      assert.ok(Math.abs(max / 2.5491212546 - 1) < 0.01, `${device}: balanced maximum ${max}`)
    }
    for (const scene of section.querySelectorAll('.immersive-scene')) {
      const positions = scene.dataset.device === 'mobile' ? mobilePositions : desktopPositions
      for (const [index, layer] of scene.querySelectorAll('.immersive-layer').entries()) {
        const styles = new Map()
        postcss.parse('a{' + layer.getAttribute('style') + '}').walkDecls(decl => styles.set(decl.prop, decl.value))
        const slot = Number(styles.get('--immersive-layer'))
        const position = saved ? positions[slot] : DEFAULT_POSITIONS[slot % 7][scene.dataset.device]
        for (const [property, value] of Object.entries(frameStyle(position))) assert.equal(styles.get(property), value, `${scene.dataset.device}[${index}].${property}`)
        assertFrameGeometry(styles, position)
        const image = layer.querySelector('img')
        const photo = photosByKey.get(keys[slot])
        const aspect = photo.width && photo.height ? photo.width / photo.height : 1
        const covered = Math.max(position.w, position.h / ASPECT[scene.dataset.device] * aspect)
        const expectedSizes = peakSizes({ pos: { ...position, w: covered } }, INTENSITY.balanced, scene.dataset.device)
        assert.equal(image.getAttribute('sizes'), expectedSizes.first, `${scene.dataset.device}[${index}] first-paint sizes follow the model`)
        assert.equal(image.getAttribute('data-sizes-peak'), expectedSizes.peak, `${scene.dataset.device}[${index}] peak sizes follow the model`)
        assert.notEqual(expectedSizes.peak, expectedSizes.first, 'peak sizes request a larger rendition than first paint')
        const urls = [image.getAttribute('src'), ...image.getAttribute('srcset').split(',').map(candidate => candidate.trim().split(/\s+/)[0])]
        for (const url of urls) {
          assert.match(url, /^\/photos\//, 'manifest provides local image URLs')
          const path = decodeURIComponent(new URL(url, 'https://phos.test').pathname)
          assert.ok(existsSync(join(ROOT, 'public', path)), `${scene.dataset.device} source exists: ${url}`)
        }
      }
    }
  })
})
