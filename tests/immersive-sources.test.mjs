import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import ts from 'typescript'
import { repoRoot } from './helpers/bundle.mjs'
import { home, scene } from './helpers/immersive-frontmatter.mjs'
import { deviceMedia, keyframeStops } from './helpers/immersive-contracts.mjs'
import postcss from 'postcss'

const read = path => readFile(join(repoRoot, path), 'utf8')
const synthetic = () => ({
  categories: [{ slug: 'matrix', order: 0, photos: Array.from({ length: 7 }, (_, i) => ({
    filename: `photo ${i}.jpg`, thumb: `/photos/thumbs/matrix/photo%20${i}.webp`, full: `/photos/full/matrix/photo%20${i}.jpg`,
    width: 1200, height: 800, srcset: `/photos/w1600/matrix/photo%20${i}.webp 1200w`,
  })) }], heroPriority: [],
})

test('home renders the server immersive component with hasNext and either device populated', async () => {
  const page = await read('src/pages/index.astro')
  assert.match(page, /import\s+ImmersiveGallery\s+from\s+['"]@components\/ImmersiveGallery\.astro['"]/)
  const tag = page.match(/<ImmersiveGallery\b[\s\S]*?\/>/)?.[0]
  assert.ok(tag)
  for (const prop of ['mobilePhotos', 'desktopPhotos', 'mobilePositions', 'desktopPositions', 'hasNext']) assert.match(tag, new RegExp('\\b' + prop + '=\\{'))
  assert.doesNotMatch(tag, /client:/)
  assert.match(page, /(?:desktopPhotos\.length\s*\|\|\s*mobilePhotos\.length|mobilePhotos\.length\s*\|\|\s*desktopPhotos\.length)/)
  assert.doesNotMatch(page, /immersiveSources|sources=|immersive-scroll-gallery/)
})

test('home pairs filtered manifest photos with their original device positions', async () => {
  const manifest = synthetic(), defaults = JSON.parse(await read('src/content/site-config.json'))
  const keys = manifest.categories[0].photos.slice(0, 2).map(photo => 'matrix/' + photo.filename)
  const desktopPositions = [0, 1, 2, 3].map(x => ({ x, y: 10, w: 20, h: 30, z: 1 }))
  const mobilePositions = [4, 5, 6].map(x => ({ x, y: 20, w: 30, h: 40, z: 2 }))
  defaults.home.immersiveGallery = {
    enabled: true, desktopPhotos: ['missing/before.jpg', keys[0], 'missing/middle.jpg', keys[1]], desktopPositions,
    mobilePhotos: [keys[1], 'missing/mobile.jpg', keys[0]], mobilePositions,
  }
  const result = await home(manifest, defaults)
  const key = photo => typeof photo === 'string' ? photo : `${photo.category}/${photo.filename}`
  assert.deepEqual(result.desktopPhotos.map(key), keys)
  assert.deepEqual(result.mobilePhotos.map(key), [...keys].reverse())
  assert.deepEqual(result.desktopPositions, [desktopPositions[1], desktopPositions[3]])
  assert.deepEqual(result.mobilePositions, [mobilePositions[0], mobilePositions[2]])
  defaults.home.immersiveGallery.desktopPositions = null
  defaults.home.immersiveGallery.mobilePositions = null
  const fallback = await home(manifest, defaults)
  assert.equal(fallback.desktopPositions, null)
  assert.equal(fallback.mobilePositions, null)
})

test('server immersive markup consumes manifest photo objects without source maps or constructed variant paths', async () => {
  const component = await read('src/components/ImmersiveGallery.astro')
  assert.match(component, /from\s+['"]@lib\/immersive-motion['"]/)
  assert.doesNotMatch(component, /\bsources\s*[:=]|\/photos\/(?:immersive|w\d+|thumbs)\//)
  assert.match(component, /frameStyle\(layer\.pos\)/)
  assert.match(component, /resolveLayers\(/)
  assert.match(component, /sceneKeyframes\(/)
  assert.match(component, /photo\.(?:gridSrcset|srcset)/)
  assert.match(component, /data-config="home\.immersiveGallery\.text"/)
  assert.doesNotMatch(component, /framer|client:(?:only|load|visible)/i)
})

test('Selected work does not borrow immersive photos while the gallery is enabled', async () => {
  const manifest = synthetic(), config = JSON.parse(await read('src/content/site-config.json'))
  config.home.selectedWork = { enabled: true, photos: [] }
  config.home.immersiveGallery = { enabled: true, desktopPhotos: manifest.categories[0].photos.slice(3, 6).map(p => 'matrix/' + p.filename), mobilePhotos: [] }
  const enabled = await home(manifest, config)
  // Two distinct automatic picks remain, so Selected work pads with the next photograph outside the scene
  // (never a scene photo) to reach the three tiles the grid needs.
  const scene = new Set(config.home.immersiveGallery.desktopPhotos)
  assert.deepEqual(enabled.selected.map(p => p.filename), manifest.categories[0].photos.slice(0, 3).map(p => p.filename))
  assert.equal(enabled.selected.filter(p => scene.has('matrix/' + p.filename)).length, 0, 'no scene photo is borrowed')
})

test('public tagline keeps configured Lorem text and fresh layout puts immersive second', async () => {
  const page = await read('src/pages/index.astro')
  assert.doesNotMatch(page, /\/\^lorem[^\n]*/i)
  const defaults = JSON.parse(await read('src/content/site-config.json'))
  defaults.home.layout = undefined
  const result = await home(synthetic(), defaults)
  assert.equal(result.layout[1], 'immersiveGallery')
  defaults.home.immersiveGallery.text = 'Lorem ipsum is deliberately rendered verbatim.'
  assert.equal((await home(synthetic(), defaults)).immersiveText, defaults.home.immersiveGallery.text)
  const tracked = JSON.parse(await read('src/content/site-config.json'))
  assert.equal(tracked.home.layout[1], 'immersiveGallery')
})

test('framer-motion is absent from dependencies and public UI imports', async () => {
  const pkg = JSON.parse(await read('package.json'))
  for (const key of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) assert.ok(!Object.hasOwn(pkg[key] ?? {}, 'framer-motion'), key)
  const { readdir } = await import('node:fs/promises')
  async function scan(dir) {
    const entries = await readdir(join(repoRoot, dir), { withFileTypes: true })
    for (const entry of entries) {
      const path = `${dir}/${entry.name}`
      if (entry.isDirectory()) await scan(path)
      else if (entry.name.endsWith('.tsx')) {
        const source = await read(path)
        const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
        for (const statement of ast.statements.filter(ts.isImportDeclaration)) assert.doesNotMatch(statement.moduleSpecifier.text, /^framer(?:-motion)?(?:\/|$)/, path)
      }
    }
  }
  await scan('src/components/ui')
})

test('tracked defaults enable the gallery for fresh installs and place it right after the subheading', async () => {
  const defaults = JSON.parse(await read('src/content/site-config.json'))
  const gallery = defaults.home.immersiveGallery
  assert.equal(gallery.enabled, true)
  assert.doesNotMatch(gallery.text, /^lorem/i, 'fresh installs get a real starter tagline')
  assert.deepEqual([gallery.intensity, gallery.scrollLength, gallery.atmosphere], ['dramatic', 'standard', 'stars'])
  assert.equal(defaults.home.layout.indexOf('immersiveGallery'), 1)
})


test('hasNext executes the actual template expression for a final and a followed gallery', async () => {
  const page = await read('src/pages/index.astro'), component = await read('src/components/ImmersiveGallery.astro')
  const expression = page.match(/hasNext=\{([^}]+)\}/)?.[1]
  assert.ok(expression)
  const attribute = component.match(/data-has-next=\{([^}]+)\}/)?.[1]
  assert.ok(attribute, 'component exposes the handoff attribute')
  const config = JSON.parse(await read('src/content/site-config.json'))
  config.home.immersiveGallery = { enabled: true, desktopPhotos: ['matrix/photo 0.jpg'], mobilePhotos: [] }
  config.home.selectedWork = { enabled: false }
  config.home.showcase = { enabled: false }
  config.home.services.enabled = false
  config.home.testimonials.enabled = false
  config.home.hero.subheading = ''
  for (const followed of [false, true]) {
    config.home.layout = ['immersiveGallery', 'cta']
    config.home.cta.enabled = followed
    const { visibleLayout } = await home(synthetic(), config)
    assert.deepEqual(visibleLayout, followed ? ['immersiveGallery', 'cta'] : ['immersiveGallery'])
    const sectionIndex = visibleLayout.indexOf('immersiveGallery')
    const hasNext = new Function('sectionIndex', 'visibleLayout', 'return ' + expression)(sectionIndex, visibleLayout)
    assert.equal(hasNext, followed)
    assert.equal(Boolean(new Function('hasNext', 'return ' + attribute)(hasNext)), followed)
  }
  assert.match(page, /return\s+visibleLayout\[sectionIndex\s*-\s*1\]\s*===\s*['"]immersiveGallery['"][\s\S]*?\?\s*<div\s+class=['"]immersive-next['"]>\{content\}<\/div>/)
})

test('executed scene frontmatter scopes every layer to its correct device media and preserves Feel settings', async () => {
  const manifest = synthetic()
  const photos = manifest.categories[0].photos.slice(0, 6)
  const result = await scene({ mobilePhotos: photos, desktopPhotos: photos, intensity: 'balanced', scrollLength: 'short' })
  assert.equal(result.travel, 140)
  assert.equal(result.strength, 0.75)
  const blocks = []
  postcss.parse(result.keyframes).walkAtRules('media', rule => blocks.push(deviceMedia(rule.params)))
  assert.deepEqual(blocks, ['mobile', 'desktop'])
  for (const device of ['mobile', 'desktop']) {
    const stops = keyframeStops(result.keyframes, 'immersive-layer-0', device)
    assert.ok(stops.length >= 24)
    const max = Math.max(...stops.map(s => Number(s.props.get('transform').match(/scale\(([\d.]+)\)/)[1])))
    assert.ok(Math.abs(max / 2.5491212546 - 1) < 0.01, `${device} balanced max scale ${max}`)
  }
})

test('Selected work automatic choices share at most one scene photo when enough alternatives exist', async () => {
  const manifest = synthetic()
  manifest.categories = Array.from({ length: 6 }, (_, i) => ({ ...manifest.categories[0], slug: `category-${i}`, order: i }))
  const config = JSON.parse(await read('src/content/site-config.json'))
  config.home.selectedWork = { enabled: true, photos: [] }
  config.home.immersiveGallery = { enabled: true, desktopPhotos: ['category-0/photo 0.jpg', 'category-0/photo 1.jpg', 'category-1/photo 0.jpg'], mobilePhotos: ['category-1/photo 1.jpg'] }
  const result = await home(manifest, config)
  const sceneKeys = new Set([...config.home.immersiveGallery.desktopPhotos, ...config.home.immersiveGallery.mobilePhotos])
  assert.ok(result.selected.length >= 3, 'Selected work remains populated')
  assert.ok(result.selected.filter(p => sceneKeys.has(`${p.category}/${p.filename}`)).length <= 1)
})

test('scene frontmatter limits mobile ladders to 1100w and desktop ladders to 2200w', async () => {
  const photo = { ...synthetic().categories[0].photos[0], srcset: [320, 640, 1100, 1600, 2200, 2880].map(w => `/photos/w${w}/matrix/a.webp ${w}w`).join(', ') }
  const result = await scene({ mobilePhotos: [photo], desktopPhotos: [photo] })
  for (const { device, photos } of result.scenes) {
    const candidates = photos[0].srcset.split(',').map(s => Number(s.trim().match(/ (\d+)w$/)[1]))
    assert.ok(candidates.length > 0)
    assert.ok(Math.max(...candidates) <= (device === 'mobile' ? 1100 : 2200))
  }
})

test('public image LQIP is placed on the img and stars use prefixed or CSS-side masks', async () => {
  const [component, css] = await Promise.all([read('src/components/ImmersiveGallery.astro'), read('src/styles/public/immersive.css')])
  const image = component.match(/<img\b[\s\S]*?\/>/)?.[0]
  assert.ok(image)
  assert.match(image, /photo\.blur|(?:image|photo)Style\(/)
  // CSS-side masks are run through the build's prefixer; inline-only unprefixed masks are insufficient.
  assert.ok(/-webkit-mask/.test(component) || /\.immersive-stars[\s\S]*?mask-image\s*:/.test(css))
  assert.match(css, /@media[^{}]*\bprint\b[^{}]*\{[\s\S]*?\.immersive/)
})


test('visible automatic Selected work still shares at most one photo when initial fallback candidates overlap', async () => {
  const manifest = synthetic()
  manifest.categories = Array.from({ length: 3 }, (_, i) => ({ ...manifest.categories[0], slug: `category-${i}`, order: i }))
  const config = JSON.parse(await read('src/content/site-config.json'))
  config.home.selectedWork = { enabled: true, photos: [] }
  config.home.immersiveGallery = { enabled: true, desktopPhotos: ['category-0/photo 0.jpg', 'category-0/photo 1.jpg', 'category-1/photo 0.jpg', 'category-1/photo 1.jpg'], mobilePhotos: [] }
  const result = await home(manifest, config)
  const keys = new Set(config.home.immersiveGallery.desktopPhotos)
  if (result.visibleLayout.includes('selectedWork')) assert.ok(result.selected.filter(p => keys.has(`${p.category}/${p.filename}`)).length <= 1, 'fallback still renders four overlapping scene photos')
})
