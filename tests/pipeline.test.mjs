import { test } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import {
  mkdir,
  writeFile,
  readFile,
  readdir,
  stat,
  rm,
  utimes,
  cp,
  mkdtemp,
  symlink
} from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { repoRoot } from './helpers/bundle.mjs'

// Tier-specific expectations: change this table and the selections together when the
// generator adds a rendition. All width descriptors must match the actual output.
const MAX_EDGE = 3840
const CACHE_VERSION = 2
const TIERS = {
  thumb: { dir: 'thumbs', width: 800 },
  thumbMobile: { dir: 'thumbs-mobile', width: 400 },
  immersiveMobile: { dir: 'immersive-mobile', width: 1100, icc: true },
  w1600: { dir: 'w1600', width: 1600, icc: true },
  w2880: { dir: 'w2880', width: 2880, icc: true },
  immersive: { dir: 'immersive', width: 2200, icc: true },
  hd: { dir: 'hd', width: Infinity, icc: true }
}
const STAGE_TIERS = ['immersiveMobile', 'w1600', 'immersive', 'w2880', 'hd']
const PORTRAIT_SIZES = [
  [860, 1333],
  [1290, 2000]
]
const OG_SIZE = [1200, 630]
const GRID_TIERS = ['thumbMobile', 'thumb', 'immersiveMobile']
const COVER_TIERS = ['thumb', 'immersiveMobile', 'immersive']
const THUMB_ENCODINGS = [
  ['thumbs', 800, 82],
  ['thumbs-mobile', 400, 75]
]
function widths(width, height, tiers) {
  return [
    ...new Set(
      tiers.map((key) =>
        Math.round(
          width * Math.min(1, TIERS[key].width / width, MAX_EDGE / Math.max(width, height))
        )
      )
    )
  ].sort((a, b) => a - b)
}
const coverWidths = (w, h) => widths(w, h, COVER_TIERS)
const gridWidths = (w, h) => widths(w, h, GRID_TIERS)
const stageWidths = (w, h) => widths(w, h, STAGE_TIERS)

test('isolated content generator', { timeout: 180000 }, async (t) => {
  let sharp
  try {
    sharp = (await import('sharp')).default
    await sharp({ create: { width: 1, height: 1, channels: 3, background: 'red' } })
      .png()
      .toBuffer()
  } catch (error) {
    const message = 'sharp cannot load: ' + error.message
    if (process.env.PHOS_ALLOW_NO_SHARP === '1') {
      t.skip(message + ' (explicit PHOS_ALLOW_NO_SHARP=1 opt-out)')
      return
    }
    assert.fail(message + '; install sharp, or explicitly opt out with PHOS_ALLOW_NO_SHARP=1')
  }
  const ROOT = await mkdtemp(join(tmpdir(), 'phos-pipeline-'))
  t.after(() => rm(ROOT, { recursive: true, force: true }))
  assert.notEqual(ROOT, repoRoot)
  await mkdir(join(ROOT, 'scripts'), { recursive: true })
  await cp(join(repoRoot, 'scripts/generate-content.mjs'), join(ROOT, 'scripts/generate-content.mjs'))
  // A tripwire, not the real merge-config: even a caught execution must fail this test.
  const syncSentinel = join(ROOT, 'merge-config-ran')
  await writeFile(join(ROOT, 'scripts/merge-config.mjs'), [
    "import { writeFileSync } from 'node:fs'",
    "writeFileSync(new URL('../merge-config-ran', import.meta.url), 'executed')",
    "throw new Error('PHOS_SKIP_CONFIG_SYNC was ignored')"
  ].join('\n'))
  await symlink(join(repoRoot, 'node_modules'), join(ROOT, 'node_modules'), 'dir')
  const OUT = join(ROOT, 'public/photos')
  const SRC = join(ROOT, 'photos')
  const EVIDENCE = join(ROOT, 'evidence')

  for (const p of ['photos', 'public', 'src/content', 'config'])
    await rm(join(ROOT, p), { recursive: true, force: true })
  for (const p of ['photos', 'src/content', 'config', 'evidence'])
    await mkdir(join(ROOT, p), { recursive: true })
  const schema = new Database(join(ROOT, 'config/site.db'))
  schema.exec(
    'CREATE TABLE galleries (id INTEGER PRIMARY KEY, slug TEXT, name TEXT, description TEXT, cover TEXT, order_num INTEGER, created_at INTEGER); CREATE TABLE gallery_photos (gallery_id INTEGER, category TEXT, filename TEXT, position INTEGER)'
  )
  schema.close()
  const srgbSeed = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'red' } })
    .withIccProfile('srgb')
    .png()
    .toBuffer()
  const SRGB_ICC = (await sharp(srgbSeed).metadata()).icc
  function isSrgb(icc) {
    return !!icc && icc.equals(SRGB_ICC)
  }
  const tiers = Object.fromEntries(Object.entries(TIERS).map(([key, value]) => [key, value.dir]))
  const rgb = [
    [220, 30, 30],
    [30, 200, 50],
    [30, 50, 220],
    [220, 200, 30]
  ]
  const checks = []
  const timings = []
  const details = {}
  function check(id, condition, evidence) {
    checks.push({ id, pass: Boolean(condition), evidence })
  }
  async function json(p) {
    return JSON.parse(await readFile(p, 'utf8'))
  }
  async function save(name, value) {
    await writeFile(join(EVIDENCE, name), JSON.stringify(value, null, 2))
  }
  function hash(buf) {
    return createHash('sha256').update(buf).digest('hex')
  }
  async function files(dir) {
    if (!existsSync(dir)) return []
    const result = []
    for (const d of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, d.name)
      if (d.isDirectory()) result.push(...(await files(p)))
      else if (d.isFile()) result.push(p)
    }
    return result.sort()
  }
  async function snapshot() {
    const obj = {}
    for (const p of [...(await files(OUT)), ...(await files(join(ROOT, 'src/content')))]) {
      const s = await stat(p)
      obj[relative(ROOT, p)] = { hash: hash(await readFile(p)), mtimeMs: s.mtimeMs, size: s.size }
    }
    return obj
  }
  function diff(a, b, key = 'hash') {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
      (k) => a[k]?.[key] !== b[k]?.[key]
    )
  }
  function images(s) {
    return Object.fromEntries(
      Object.entries(s).filter(([p]) => p.startsWith('public/photos/') && !p.endsWith('.json'))
    )
  }
  function run(label, env = {}) {
    const start = performance.now()
    const r = spawnSync(process.execPath, ['scripts/generate-content.mjs'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PHOTOS_SOURCE: SRC,
        PHOTOS_CACHE_PATH: join(OUT, '.cache.json'),
        DB_PATH: join(ROOT, 'config/site.db'),
        CONFIG_PATH: join(ROOT, 'config/missing.json'),
        PHOS_SKIP_CONFIG_SYNC: '1',
        UV_THREADPOOL_SIZE: '2',
        ...env
      },
      encoding: 'utf8',
      timeout: 90000,
      maxBuffer: 10 * 1024 * 1024
    })
    const seconds = (performance.now() - start) / 1000
    const record = { label, seconds, status: r.status, stdout: r.stdout, stderr: r.stderr }
    timings.push(record)
    if (r.status !== 0) throw new Error(JSON.stringify(record))
    check('configSync.' + label, !existsSync(syncSentinel), 'merge-config must not execute')
    check('configSync.' + label + '.message', /Skipping site config sync/.test(r.stdout), r.stdout)
    return record
  }
  async function fixture(name, w, h, { orientation, alpha = false } = {}) {
    const channels = alpha ? 4 : 3
    const data = Buffer.alloc(w * h * channels)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const q = (y >= h / 2 ? 2 : 0) + (x >= w / 2 ? 1 : 0),
          i = (y * w + x) * channels
        const texture = ((Math.floor(x / 17) + Math.floor(y / 23)) % 2) * 8
        for (let c = 0; c < 3; c++) data[i + c] = rgb[q][c] + texture
        if (alpha) data[i + 3] = [0, 96, 176, 255][q]
      }
    let p = sharp(data, { raw: { width: w, height: h, channels } })
    if (orientation) p = p.withMetadata({ orientation })
    await mkdir(dirname(join(SRC, name)), { recursive: true })
    await (alpha ? p.png() : p.jpeg({ quality: 95, chromaSubsampling: '4:4:4' })).toFile(
      join(SRC, name)
    )
  }
  async function sample(input, ignoreIcc = false) {
    const { data, info } = await sharp(input, { ignoreIcc })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const points = [
      [0.2, 0.2],
      [0.8, 0.2],
      [0.2, 0.8],
      [0.8, 0.8]
    ]
    return points.map(([x, y]) => {
      const i =
        (Math.floor(info.height * y) * info.width + Math.floor(info.width * x)) * info.channels
      return [...data.subarray(i, i + 3)]
    })
  }
  function label(pixel) {
    return rgb
      .map((c) => c.reduce((s, v, i) => s + (v - pixel[i]) ** 2, 0))
      .reduce((best, v, i, a) => (v < a[best] ? i : best), 0)
  }
  const specs = [
    ['a', 'a-landscape.jpg', 3000, 2000, {}],
    ['b', 'b-portrait.jpg', 2000, 3000, {}],
    ['c', 'c-orientation6.jpg', 3000, 2000, { orientation: 6 }],
    ['d', 'd-orientation8.jpg', 3000, 2000, { orientation: 8 }],
    ['e', 'e-orientation3.jpg', 3000, 2000, { orientation: 3 }],
    ['f', 'f-tiny.jpg', 300, 200, {}],
    ['g', 'g-between.jpg', 900, 600, {}],
    ['h', 'h-alpha.png', 1200, 800, { alpha: true }],
    ['j', 'j-panorama.jpg', 16000, 4000, {}],
    ['k', 'My Photo.JPG', 2000, 1200, {}],
    ['l', 'l-small-hero.jpg', 1400, 933, {}]
  ]
  await mkdir(EVIDENCE, { recursive: true })
  for (const [, name, w, h, opts] of specs) await fixture('Matrix/' + name, w, h, opts)
  await fixture('No Meta/z-last.jpg', 640, 480)
  await fixture('No Meta/a-first.jpg', 800, 600)
  await writeFile(
    join(SRC, 'Matrix/_meta.yaml'),
    'name: Fidelity Matrix\ndescription: Explicit portrait cover\ncover: b-portrait.jpg\nphotos:\n  b-portrait.jpg:\n    title: Portrait override\n    description: Metadata description\n    hero_priority: 7\n  gradient.png:\n    focus: "34% 50%"\n'
  )
  // Smooth horizontal gradient plus a magenta square: the square's edge locates
  // the crop to one pixel, which an 8-bit gradient alone cannot do at this size.
  const gradient = Buffer.alloc(6000 * 4000 * 3)
  for (let y = 0; y < 4000; y++) {
    for (let x = 0; x < 6000; x++) {
      const at = (y * 6000 + x) * 3
      const marker = x >= 2400 && x < 3000 && y >= 1800 && y < 2400
      const gray = Math.round(32 + 192 * x / 5999)
      gradient[at] = marker ? 245 : gray
      gradient[at + 1] = marker ? 20 : gray
      gradient[at + 2] = marker ? 200 : gray
    }
  }
  const gradientSource = join(SRC, 'Matrix/gradient.png')
  await sharp(gradient, { raw: { width: 6000, height: 4000, channels: 3 } })
    .png()
    .toFile(gradientSource)
  // Attach P3 ICC bytes directly to an untagged JPEG so its RGB values are known P3 coordinates.
  const p3Seed = await sharp({
    create: { width: 16, height: 16, channels: 3, background: { r: 230, g: 80, b: 40 } }
  })
    .withIccProfile('p3')
    .jpeg()
    .toBuffer()
  const p3Icc = (await sharp(p3Seed).metadata()).icc
  const untagged = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 230, g: 80, b: 40 } }
  })
    .jpeg({ quality: 100, chromaSubsampling: '4:4:4' })
    .toBuffer()
  const payload = Buffer.concat([Buffer.from('ICC_PROFILE\0', 'ascii'), Buffer.from([1, 1]), p3Icc])
  const app2 = Buffer.alloc(4)
  app2[0] = 255
  app2[1] = 226
  app2.writeUInt16BE(payload.length + 2, 2)
  await writeFile(
    join(SRC, 'Matrix/i-p3.jpg'),
    Buffer.concat([untagged.subarray(0, 2), app2, payload, untagged.subarray(2)])
  )
  await writeFile(join(EVIDENCE, 'p3-source.icc'), p3Icc)
  await save('environment.json', {
    node: process.version,
    sharp: sharp.versions,
    scriptSha256: hash(await readFile(join(ROOT, 'scripts/generate-content.mjs'))),
    p3IccLength: p3Icc.length
  })
  let heroConfig = ['matrix/b-portrait.jpg', 'matrix/f-tiny.jpg', 'matrix/l-small-hero.jpg', 'matrix/gradient.png']
  const writeHeroConfig = () => writeFile(
    join(ROOT, 'src/content/site-config.json'),
    JSON.stringify({ home: { hero: { photos: heroConfig } } })
  )
  await writeHeroConfig()
  run('01-cold')
  const manifest = await json(join(ROOT, 'src/content/categories.json'))
  const cache = await json(join(OUT, '.cache.json'))
  await save('01-categories.json', manifest)
  await save('01-cache.json', cache)
  check('cache.version', cache.version === CACHE_VERSION, cache.version)
  const cat = manifest.categories.find((c) => c.slug === 'matrix'),
    noMeta = manifest.categories.find((c) => c.slug === 'no-meta')
  const mapping = Object.fromEntries(cat.photos.map((p) => [p.filename, p]))
  async function srcset(value, context, expectedWidths) {
    const parsed = []
    for (const part of value.split(', ')) {
      const m = part.match(/^(.*) (\d+)w$/)
      if (!m) {
        check(context + '.syntax', false, part)
        continue
      }
      const url = m[1],
        w = Number(m[2])
      check(context + '.url-safe.' + w, !/[\t\n\f\r ,]/.test(url), {
        url,
        reason: 'srcset URLs must not contain unescaped ASCII whitespace or commas'
      })
      const meta = await sharp(join(ROOT, 'public', decodeURIComponent(url))).metadata()
      check(context + '.width.' + w, w === meta.width, { url, descriptor: w, actual: meta.width })
      parsed.push({ url, w, h: meta.height })
    }
    check(
      context + '.ascending-dedup',
      parsed.every((p, i) => i === 0 || p.w > parsed[i - 1].w),
      parsed
    )
    if (expectedWidths)
      check(
        context + '.candidates',
        JSON.stringify(parsed.map((p) => p.w)) === JSON.stringify(expectedWidths),
        { expectedWidths, actual: parsed.map((p) => p.w) }
      )
    return parsed
  }
  const dimensionEvidence = []
  for (const [id, name, storedW, storedH, opts] of [...specs, ['i', 'i-p3.jpg', 1200, 800, {}]]) {
    const p = mapping[name]
    const swap = [6, 8].includes(opts.orientation),
      w = swap ? storedH : storedW,
      h = swap ? storedW : storedH
    check(id + '.manifest', p.width === w && p.height === h, {
      actual: [p.width, p.height],
      expected: [w, h]
    })
    const variantDims = {}
    for (const [tier, dir] of Object.entries(tiers)) {
      const out = join(OUT, dir, 'matrix', name.replace(/\.[^.]+$/, '.webp'))
      const m = await sharp(out).metadata()
      const scale =
        tier === 'hd'
          ? Math.min(1, MAX_EDGE / Math.max(w, h))
          : Math.min(1, TIERS[tier].width / w, MAX_EDGE / Math.max(w, h))
      const expected = [Math.round(w * scale), Math.round(h * scale)]
      check(id + '.' + tier + '.dimensions', m.width === expected[0] && m.height === expected[1], {
        actual: [m.width, m.height],
        expected
      })
      check(
        id + '.' + tier + '.cached',
        cache.files['matrix/' + name].variants[tier].w === m.width &&
          cache.files['matrix/' + name].variants[tier].h === m.height,
        cache.files['matrix/' + name].variants[tier]
      )
      variantDims[tier] = {
        w: m.width,
        h: m.height,
        size: (await stat(out)).size,
        iccLength: m.icc?.length || 0,
        hasAlpha: m.hasAlpha
      }
      if (TIERS[tier].icc) check(id + '.' + tier + '.icc', isSrgb(m.icc), m.icc?.length || 0)
      if (id !== 'i' && id !== 'h') {
        const labels = (await sample(out)).map(label),
          expectedLabels =
            opts.orientation === 6
              ? [2, 0, 3, 1]
              : opts.orientation === 8
                ? [1, 3, 0, 2]
                : opts.orientation === 3
                  ? [3, 2, 1, 0]
                  : [0, 1, 2, 3]
        check(
          id + '.' + tier + '.pixels',
          JSON.stringify(labels) === JSON.stringify(expectedLabels),
          { labels, expectedLabels }
        )
      }
    }
    await srcset(p.srcset, id + '.srcset', stageWidths(w, h))
    check(id + '.noCategoryAvif', !Object.hasOwn(p, 'srcsetAvif'), p.srcsetAvif)
    await srcset(p.gridSrcset, id + '.gridSrcset', gridWidths(w, h))
    check(id + '.blur.dataUrl', p.blur.startsWith('data:image/webp;base64,'), p.blur.slice(0, 28))
    const bm = await sharp(Buffer.from(p.blur.split(',')[1], 'base64')).metadata()
    check(
      id + '.blur.aspect',
      Math.abs(bm.width / bm.height - w / h) <= Math.max(0.02, w / h / bm.height),
      { actual: [bm.width, bm.height], expectedRatio: w / h }
    )
    if (id !== 'i' && id !== 'h')
      check(
        id + '.blur.orientation',
        JSON.stringify((await sample(Buffer.from(p.blur.split(',')[1], 'base64'))).map(label)) ===
          JSON.stringify(
            opts.orientation === 6
              ? [2, 0, 3, 1]
              : opts.orientation === 8
                ? [1, 3, 0, 2]
                : opts.orientation === 3
                  ? [3, 2, 1, 0]
                  : [0, 1, 2, 3]
          ),
        { samples: await sample(Buffer.from(p.blur.split(',')[1], 'base64')) }
      )
    check(id + '.heroDefault', p.hero_priority === (id === 'b' ? 7 : 0), p.hero_priority)
    dimensionEvidence.push({
      id,
      name,
      manifest: [p.width, p.height],
      variants: variantDims,
      srcset: p.srcset,
      gridSrcset: p.gridSrcset,
      blur: [bm.width, bm.height]
    })
  }
  for (const category of manifest.categories) {
    check('assets.noCategoryOg.' + category.slug, !Object.hasOwn(category, 'coverOg'), category.coverOg)
    for (const photo of category.photos) {
      check('assets.noCategoryAvif.' + category.slug + '/' + photo.filename,
        !Object.hasOwn(photo, 'srcsetAvif'), photo.srcsetAvif)
    }
  }
  const expectedAvifs = []
  for (const heroPath of heroConfig) {
    const name = heroPath.slice('matrix/'.length)
    const id = name.replace(/\.[^.]+$/, '')
    const photo = mapping[name]
    const hero = manifest.heroPriority.find((entry) => entry.full === photo.full)
    await srcset(hero.srcsetAvif, id + '.heroSrcsetAvif', stageWidths(photo.width, photo.height))
    for (const tier of STAGE_TIERS) {
      const nominal = TIERS[tier].width === Infinity ? MAX_EDGE : TIERS[tier].width
      const path = join(OUT, 'avif', 'matrix', name.replace(/\.[^.]+$/, '-' + nominal + '.avif'))
      expectedAvifs.push(path)
      const metadata = await sharp(path).metadata()
      const cached = cache.files['matrix/' + name].variants?.avif?.[tier]
      const scale = Math.min(
        1,
        TIERS[tier].width / photo.width,
        MAX_EDGE / Math.max(photo.width, photo.height)
      )
      check(
        id + '.avif.' + tier + '.dimensions',
        metadata.width === Math.round(photo.width * scale) &&
          metadata.height === Math.round(photo.height * scale),
        metadata
      )
      check(
        id + '.avif.' + tier + '.cached',
        cached?.w === metadata.width && cached?.h === metadata.height,
        cached
      )
      check(id + '.avif.' + tier + '.icc', isSrgb(metadata.icc), metadata.icc?.length)
    }
  }
  check('assets.heroAvifsOnly',
    JSON.stringify(await files(join(OUT, 'avif'))) === JSON.stringify(expectedAvifs.sort()),
    { expected: expectedAvifs, actual: await files(join(OUT, 'avif')) })
  const heroes = manifest.heroPriority
  check(
    'assets.heroSelection',
    heroes.length === heroConfig.length &&
      heroes[0].full === mapping['b-portrait.jpg'].full &&
      heroes[0].title === 'Portrait override'
  )
  check('assets.tinyHeroNoCrop', heroes[1].heroPortrait === null)
  check('assets.smallLandscapeNoCrop', heroes[2].heroPortrait === null, heroes[2].heroPortrait)
  check('assets.smallLandscapeNoCropFiles',
    !(await files(join(OUT, 'hero-portrait'))).some((path) => path.includes('l-small-hero-')))
  for (const tier of ['w1600', 'w2880', 'hd']) {
    const metadata = await sharp(join(OUT, TIERS[tier].dir, 'matrix/l-small-hero.webp')).metadata()
    check('assets.smallLandscapeNoUpscale.' + tier, metadata.width <= 1400, metadata.width)
  }
  for (const [format, field] of [
    ['webp', 'srcset'],
    ['avif', 'srcsetAvif']
  ]) {
    const crops = await srcset(
      heroes[0].heroPortrait[field],
      'assets.heroPortrait.' + format,
      PORTRAIT_SIZES.map(([w]) => w)
    )
    for (const crop of crops) {
      const expected = PORTRAIT_SIZES.find(([w]) => w === crop.w)
      check('assets.heroPortrait.' + format + '.' + crop.w, crop.h === expected[1], crop)
    }
  }
  for (const [name, url] of [['hero', heroes[0].ogImage]]) {
    const metadata = await sharp(join(ROOT, 'public', decodeURIComponent(url))).metadata()
    check(
      'assets.og.' + name,
      metadata.width === OG_SIZE[0] && metadata.height === OG_SIZE[1] && metadata.format === 'jpeg',
      metadata
    )
  }
  async function markerBounds(input) {
    const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    let left = info.width
    let top = info.height
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const at = (y * info.width + x) * info.channels
        if (data[at] - data[at + 1] > 100 && data[at + 2] - data[at + 1] > 100) {
          left = Math.min(left, x)
          top = Math.min(top, y)
        }
      }
    }
    assert.ok(left < info.width && top < info.height, 'gradient marker is visible')
    return { left, top }
  }
  // Independently cover-scale the source, then locate the same marker in each
  // encoded crop. CSS percentages align the leftover space, not a gravity bucket.
  const scaledSource = await sharp(gradientSource)
    .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer()
  const gradientHero = heroes[3]
  check('focus.normalized', gradientHero.focus === '34% 50%', gradientHero.focus)
  const cropCases = [['og', gradientHero.ogImage, ...OG_SIZE]]
  for (const [format, field] of [['webp', 'srcset'], ['avif', 'srcsetAvif']]) {
    const crops = await srcset(gradientHero.heroPortrait?.[field] || '', 'focus.' + format,
      PORTRAIT_SIZES.map(([w]) => w))
    for (const crop of crops) cropCases.push([format + '.' + crop.w, crop.url, crop.w, crop.h])
  }
  for (const [name, url, w, h] of cropCases) {
    const scale = Math.max(w / 3840, h / 2560)
    const rw = Math.round(3840 * scale)
    const rh = Math.round(2560 * scale)
    const reference = await sharp(scaledSource).resize(rw, rh, { fit: 'fill' }).png().toBuffer()
    const before = await markerBounds(reference)
    const after = await markerBounds(join(ROOT, 'public', decodeURIComponent(url)))
    const left = before.left - after.left
    const top = before.top - after.top
    const expectedLeft = Math.round(0.34 * (rw - w))
    const expectedTop = Math.round(0.5 * (rh - h))
    check('focus.' + name + '.left', Math.abs(left - expectedLeft) <= 1,
      { actual: left, expected: expectedLeft, rw, w })
    check('focus.' + name + '.top', Math.abs(top - expectedTop) <= 1,
      { actual: top, expected: expectedTop, rh, h })
  }
  check(
    'l.category-metadata',
    cat.name === 'Fidelity Matrix' &&
      cat.cover === mapping['b-portrait.jpg'].thumb &&
      cat.coverFull === mapping['b-portrait.jpg'].full &&
      cat.coverWidth === 2000 &&
      cat.coverHeight === 3000 &&
      mapping['b-portrait.jpg'].title === 'Portrait override' &&
      mapping['b-portrait.jpg'].description === 'Metadata description',
    {
      name: cat.name,
      cover: cat.cover,
      coverWidth: cat.coverWidth,
      coverHeight: cat.coverHeight,
      photo: mapping['b-portrait.jpg']
    }
  )
  await srcset(cat.coverSrcset, 'l.coverSrcset', coverWidths(2000, 3000))
  check('l.coverBlur', cat.coverBlur === mapping['b-portrait.jpg'].blur, cat.coverBlur)
  check(
    'm.default-cover',
    noMeta.cover === noMeta.photos[0].thumb &&
      noMeta.photos[0].filename === 'a-first.jpg' &&
      noMeta.coverWidth === 800 &&
      noMeta.coverHeight === 600,
    {
      cover: noMeta.cover,
      first: noMeta.photos[0].filename,
      width: noMeta.coverWidth,
      height: noMeta.coverHeight
    }
  )
  await srcset(noMeta.coverSrcset, 'm.coverSrcset', coverWidths(800, 600))
  // Full remains the byte-for-byte source; it preserves EXIF and P3.
  for (const p of cat.photos)
    check(
      'full-copy.' + p.filename,
      hash(await readFile(join(SRC, 'Matrix', p.filename))) ===
        hash(await readFile(join(ROOT, 'public', decodeURIComponent(p.full)))),
      p.full
    )
  // Check alpha separately from RGB because fully transparent RGB is intentionally undefined.
  const alpha = []
  for (const [tier, dir] of Object.entries(tiers)) {
    const path = join(OUT, dir, 'matrix/h-alpha.webp')
    const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true })
    const av = [
      [0.2, 0.2],
      [0.8, 0.2],
      [0.2, 0.8],
      [0.8, 0.8]
    ].map(
      ([x, y]) =>
        data[
          (Math.floor(info.height * y) * info.width + Math.floor(info.width * x)) * info.channels +
            3
        ]
    )
    alpha.push({ tier, channels: info.channels, alpha: av })
    check(
      'h.' + tier + '.alpha',
      info.channels === 4 && JSON.stringify(av) === '[0,96,176,255]',
      av
    )
  }
  details.alpha = alpha
  const source = join(SRC, 'Matrix/i-p3.jpg')
  const rawSource = (await sample(source, true))[0]
  const reference = await sharp(source)
    .withIccProfile('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true })
  const refPixel = [...reference.data.subarray(0, 3)]
  const profiles = []
  for (const [tier, dir] of Object.entries(tiers)) {
    const path = join(OUT, dir, 'matrix/i-p3.webp')
    const actual = (await sample(path, true))[0],
      deltas = actual.map((v, i) => v - refPixel[i])
    check(
      'i.' + tier + '.srgbConversion',
      deltas.every((v) => Math.abs(v) <= 5),
      { rawP3: rawSource, srgbReference: refPixel, actual, deltas }
    )
    const m = await sharp(path).metadata()
    profiles.push({
      tier,
      actual,
      deltas,
      iccLength: m.icc?.length || 0,
      iccHasSrgbDescription: isSrgb(m.icc)
    })
    if (tier === 'hd') await writeFile(join(EVIDENCE, 'hd-srgb.icc'), m.icc)
  }
  details.p3 = { rawP3: rawSource, srgbReference: refPixel, profiles }
  await save('dimensions.json', dimensionEvidence)
  const first = await snapshot()
  await save('01-snapshot.json', first)
  run('02-warm')
  const second = await snapshot()
  await save('02-snapshot.json', second)
  check('cache1.hashes', diff(first, second).length === 0, diff(first, second))
  check(
    'cache1.imageMtimes',
    diff(images(first), images(second), 'mtimeMs').length === 0,
    diff(images(first), images(second), 'mtimeMs')
  )
  await rm(join(OUT, 'hd'), { recursive: true })
  const poison = await json(join(OUT, '.cache.json'))
  poison.files['matrix/c-orientation6.jpg'].variants.hd = { w: 1, h: 1 }
  await writeFile(join(OUT, '.cache.json'), JSON.stringify(poison, null, 2))
  run('03-hd-backfill')
  const backfill = await snapshot()
  await save('03-snapshot.json', backfill)
  check(
    'cache2.nonHdUntouched',
    diff(images(second), images(backfill), 'mtimeMs').filter(
      (p) => !p.startsWith('public/photos/hd/')
    ).length === 0,
    diff(images(second), images(backfill), 'mtimeMs')
  )
  const hdMeta = await sharp(join(OUT, 'hd/matrix/c-orientation6.webp')).metadata()
  const hc = await json(join(OUT, '.cache.json'))
  check(
    'cache2.hdOriented',
    hdMeta.width === 2000 &&
      hdMeta.height === 3000 &&
      JSON.stringify((await sample(join(OUT, 'hd/matrix/c-orientation6.webp'))).map(label)) ===
        '[2,0,3,1]',
    {
      dims: [hdMeta.width, hdMeta.height],
      pixels: await sample(join(OUT, 'hd/matrix/c-orientation6.webp'))
    }
  )
  check(
    'cache2.hdCacheUpdated',
    hc.files['matrix/c-orientation6.jpg'].variants.hd.w === 2000 &&
      hc.files['matrix/c-orientation6.jpg'].variants.hd.h === 3000,
    hc.files['matrix/c-orientation6.jpg'].variants.hd
  )
  check('cache2.hdIcc', isSrgb(hdMeta.icc), hdMeta.icc?.length)
  await rm(join(OUT, 'avif'), { recursive: true })
  run('03b-avif-backfill')
  const avifBackfill = await snapshot()
  const avifChanges = diff(images(backfill), images(avifBackfill), 'mtimeMs')
  check('cache2.avifOnlyHeroBackfill',
    avifChanges.length === heroConfig.length * STAGE_TIERS.length &&
      avifChanges.every((path) => path.startsWith('public/photos/avif/')),
    avifChanges)
  check('cache2.avifBackfillWebpMtimes',
    avifChanges.filter((path) => path.endsWith('.webp')).length === 0, avifChanges)
  check('cache2.avifBackfillInventory',
    JSON.stringify(await files(join(OUT, 'avif'))) === JSON.stringify(expectedAvifs),
    await files(join(OUT, 'avif')))
  const oldCache = await json(join(OUT, '.cache.json'))
  oldCache.version = 1
  await writeFile(join(OUT, '.cache.json'), JSON.stringify(oldCache, null, 2))
  run('04-v1-cache')
  const legacy = await snapshot()
  await save('04-snapshot.json', legacy)
  check(
    'cache3.everyImageRegenerated',
    Object.keys(images(avifBackfill)).every((p) => legacy[p].mtimeMs > avifBackfill[p].mtimeMs),
    {
      regenerated: diff(images(avifBackfill), images(legacy), 'mtimeMs').length,
      total: Object.keys(images(avifBackfill)).length
    }
  )
  check('cache3.currentVersion', (await json(join(OUT, '.cache.json'))).version === CACHE_VERSION)
  const touched = join(SRC, 'Matrix/a-landscape.jpg')
  const ts = await stat(touched)
  await utimes(touched, ts.atime, new Date(ts.mtimeMs + 10000))
  run('05-source-touch')
  const touchSnap = await snapshot()
  await save('05-snapshot.json', touchSnap)
  const touchedImages = diff(images(legacy), images(touchSnap), 'mtimeMs')
  check(
    'cache4.onePhotoRegenerated',
    touchedImages.length === 1 + Object.keys(TIERS).length &&
      touchedImages.every((p) => /\/a-landscape(?:-\d+)?\.(?:jpg|webp|avif)$/.test(p)),
    touchedImages
  )
  const heroTouched = join(SRC, 'Matrix/b-portrait.jpg')
  const heroTs = await stat(heroTouched)
  await utimes(heroTouched, heroTs.atime, new Date(heroTs.mtimeMs + 10000))
  run('05b-hero-source-touch')
  const heroTouchSnap = await snapshot()
  await save('05b-snapshot.json', heroTouchSnap)
  const heroTouchedImages = diff(images(touchSnap), images(heroTouchSnap), 'mtimeMs')
  const portraitCount = PORTRAIT_SIZES.length * 2 // webp + avif per crop
  const under = (dir) => heroTouchedImages.filter((p) => p.startsWith(`public/photos/${dir}/`)).length
  check(
    'cache4.heroSourceRegeneratesDerivedAssets',
    heroTouchedImages.length === 1 + Object.keys(TIERS).length + STAGE_TIERS.length + portraitCount + 1 &&
      heroTouchedImages.every((p) => /\/b-portrait(?:-\d+)?\.(?:jpg|webp|avif)$/.test(p)) &&
      under('og') === 1 &&
      under('hero-portrait') === portraitCount &&
      under('avif') === STAGE_TIERS.length,
    heroTouchedImages
  )
  await rm(join(SRC, 'Matrix/f-tiny.jpg'))
  run('06-source-remove')
  const prunedCache = await json(join(OUT, '.cache.json'))
  check('cache5.cachePruned', !prunedCache.files['matrix/f-tiny.jpg'])
  const stale = (await files(OUT)).filter((p) => /\/f-tiny(?:-\d+)?\.(jpg|webp|avif)$/.test(p))
  check('cache5.outputsPruned', stale.length === 0, stale)
  check(
    'cache5.manifestPruned',
    !(await json(join(ROOT, 'src/content/categories.json'))).categories
      .find((c) => c.slug === 'matrix')
      .photos.some((p) => p.filename === 'f-tiny.jpg')
  )
  const db = new Database(join(ROOT, 'config/site.db'))
  const insert = db.prepare(
    'INSERT INTO galleries (slug,name,description,cover,order_num,created_at) VALUES (?,?,?,?,?,?)'
  )
  const explicit = insert.run(
    'explicit',
    'Explicit',
    'Orientation 6 explicit cover',
    'matrix/c-orientation6.jpg',
    1,
    1
  ).lastInsertRowid
  const fallback = insert.run('fallback', 'Fallback', 'First photo', null, 2, 2).lastInsertRowid
  insert.run('empty', 'Empty', 'No photos', null, 3, 3)
  const add = db.prepare(
    'INSERT INTO gallery_photos (gallery_id,category,filename,position) VALUES (?,?,?,?)'
  )
  add.run(explicit, 'matrix', 'a-landscape.jpg', 0)
  add.run(explicit, 'matrix', 'c-orientation6.jpg', 1)
  add.run(fallback, 'matrix', 'b-portrait.jpg', 0)
  add.run(fallback, 'matrix', 'a-landscape.jpg', 1)
  db.close()
  run('07-galleries')
  const galleries = (await json(join(ROOT, 'src/content/galleries.json'))).galleries
  await save('07-galleries.json', { galleries })
  for (const g of galleries) {
    if (g.slug === 'empty') {
      check(
        'galleries.empty',
        g.cover === null &&
          g.coverSrcset === '' &&
          g.coverWidth === null &&
          g.coverHeight === null &&
          g.photoCount === 0,
        g
      )
      continue
    }
    const expected =
      g.slug === 'explicit' ? mapping['c-orientation6.jpg'] : mapping['b-portrait.jpg']
    const og = await sharp(join(ROOT, 'public', decodeURIComponent(g.coverOg))).metadata()
    check('galleries.' + g.slug + '.og', og.width === OG_SIZE[0] && og.height === OG_SIZE[1] &&
      og.format === 'jpeg', { width: og.width, height: og.height, format: og.format })
    check(
      'galleries.' + g.slug + '.cover',
      g.cover === expected.thumb &&
        g.coverWidth === expected.width &&
        g.coverHeight === expected.height &&
        g.coverFull === expected.full &&
        g.coverBlur === expected.blur,
      { cover: g.cover, width: g.coverWidth, height: g.coverHeight }
    )
    await srcset(g.coverSrcset, 'galleries.' + g.slug + '.coverSrcset', coverWidths(2000, 3000))
    for (const p of g.photos) {
      check(
        'galleries.' + g.slug + '.photo.' + p.filename,
        p.category === 'matrix' && p.gridSrcset === mapping[p.filename].gridSrcset,
        { category: p.category, gridSrcset: p.gridSrcset }
      )
      await srcset(p.gridSrcset, 'galleries.' + g.slug + '.' + p.filename + '.gridSrcset')
    }
  }

  // Additional executable probes from probes.mjs, using the same isolated fixture.
  const script = await readFile(join(ROOT, 'scripts/generate-content.mjs'), 'utf8')
  const functionText = script.match(
    /function getOrientedDimensions\(metadata\) \{[\s\S]*?\n\}/
  )?.[0]
  assert.ok(functionText, 'generator still exposes the orientation fallback helper')
  const getDimensions = new Function('return (' + functionText + ')')()
  for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const actual = getDimensions({ width: 3000, height: 2000, orientation })
    const swapped = orientation >= 5
    check(
      'probes.orientation.' + orientation,
      actual.width === (swapped ? 2000 : 3000) && actual.height === (swapped ? 3000 : 2000),
      actual
    )
  }
  check(
    'probes.autoOrientPrecedence',
    JSON.stringify(
      getDimensions({
        width: 3000,
        height: 2000,
        orientation: 6,
        autoOrient: { width: 111, height: 222 }
      })
    ) === '{"width":111,"height":222}'
  )
  for (const [name, expected] of [
    ['hd-srgb.icc', /sRGB/],
    ['p3-source.icc', /P3/]
  ]) {
    const icc = await readFile(join(EVIDENCE, name))
    check('probes.iccSignature.' + name, icc.toString('ascii', 36, 40) === 'acsp')
    // ICC descriptions can use UTF-16BE mluc tags.
    check(
      'probes.iccDescription.' + name,
      expected.test(icc.toString('ascii').replaceAll('\0', ''))
    )
  }
  for (const [dir, width, quality] of THUMB_ENCODINGS) {
    const { data, info } = await sharp(join(SRC, 'Matrix/b-portrait.jpg'))
      .rotate()
      .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true })
    const pixels = () =>
      sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    const actual = await readFile(join(OUT, dir, 'matrix/b-portrait.webp'))
    const reference = await pixels()
      .resize(width, null, { fit: 'inside', withoutEnlargement: true })
      .sharpen({ sigma: 0.5 })
      .webp({ quality, smartSubsample: true })
      .toBuffer()
    const noSharpen = await pixels()
      .resize(width, null, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality, smartSubsample: true })
      .toBuffer()
    const noSmart = await pixels()
      .resize(width, null, { fit: 'inside', withoutEnlargement: true })
      .sharpen({ sigma: 0.5 })
      .webp({ quality })
      .toBuffer()
    check('probes.encoding.' + dir, actual.equals(reference))
    check('probes.sharpen.' + dir, !actual.equals(noSharpen))
    check('probes.smartSubsample.' + dir, !actual.equals(noSmart))
  }
  await writeFile(join(SRC, 'No Meta/_meta.yaml'), 'name: No Meta\ncover: missing-cover.jpg\n')
  run('08-stale-cover')
  const staleCover = (await json(join(ROOT, 'src/content/categories.json'))).categories.find(
    (category) => category.slug === 'no-meta'
  )
  check(
    'probes.staleCover',
    staleCover.cover === staleCover.photos[0].thumb &&
      staleCover.coverFull === staleCover.photos[0].full &&
      staleCover.coverWidth === 800 &&
      staleCover.coverHeight === 600,
    staleCover
  )
  check(
    'probes.staleCoverExists',
    existsSync(join(ROOT, 'public', decodeURIComponent(staleCover.cover)))
  )
  // Remove selection without removing the source: stale hero-only outputs must go.
  heroConfig = heroConfig.filter((path) => path !== 'matrix/gradient.png')
  await writeHeroConfig()
  run('09-hero-deselected')
  for (const dir of ['hero-portrait', 'avif', 'og']) {
    const stale = (await files(join(OUT, dir))).filter((path) => /\/gradient(?:-\d+)?\./.test(path))
    check('selection.' + dir + '.pruned', stale.length === 0, stale)
  }
  const deselected = await json(join(ROOT, 'src/content/categories.json'))
  check('selection.sourceRemains', deselected.categories.find((category) => category.slug === 'matrix')
    .photos.some((photo) => photo.filename === 'gradient.png'))
  check('selection.heroRemoved', !deselected.heroPriority.some((photo) => photo.full === gradientHero.full))

  // Model the last good gallery manifest retaining real selected-asset URLs, then
  // make SQLite unreadable and deselect that hero. No manifest or referenced asset
  // may be lost just because the current DB cannot be read.
  const galleryPath = join(ROOT, 'src/content/galleries.json')
  const previousGalleries = await json(galleryPath)
  previousGalleries.galleries.find((gallery) => gallery.slug === 'fallback').photos[0].heroPortrait =
    heroes[0].heroPortrait
  const preservedManifest = JSON.stringify(previousGalleries, null, 2)
  await writeFile(galleryPath, preservedManifest)
  const protectedAssets = new Map()
  for (const url of preservedManifest.match(/\/photos\/(?:og|hero-portrait)\/[^\s,"\\]+/g) || []) {
    const path = join(ROOT, 'public', decodeURIComponent(url))
    protectedAssets.set(path, { hash: hash(await readFile(path)), mtimeMs: (await stat(path)).mtimeMs })
  }
  assert.ok([...protectedAssets.keys()].some((path) => path.includes('/og/')))
  assert.ok([...protectedAssets.keys()].some((path) => path.includes('/hero-portrait/')))
  heroConfig = heroConfig.filter((path) => path !== 'matrix/b-portrait.jpg')
  await writeHeroConfig()
  const invalidDb = join(ROOT, 'config/unreadable.db')
  await writeFile(invalidDb, 'not a SQLite database')
  const unreadableRun = run('10-unreadable-gallery-db', { DB_PATH: invalidDb })
  check('unreadable.warning', /Gallery manifest generation skipped/.test(unreadableRun.stderr), unreadableRun.stderr)
  check('unreadable.manifestPreserved', await readFile(galleryPath, 'utf8') === preservedManifest)
  for (const [path, before] of protectedAssets) {
    check('unreadable.assetPreserved.' + relative(OUT, path), existsSync(path), relative(OUT, path))
    if (existsSync(path)) {
      check('unreadable.assetUntouched.' + relative(OUT, path),
        hash(await readFile(path)) === before.hash && (await stat(path)).mtimeMs === before.mtimeMs)
    }
  }
  const groups = Map.groupBy(checks, (item) => item.id.split('.')[0])
  for (const [name, assertions] of groups) {
    await t.test(name + ' (' + assertions.length + ' assertions)', () => {
      const failures = assertions.filter((assertion) => !assertion.pass)
      assert.equal(failures.length, 0, failures.map((assertion) =>
        assertion.id + ': ' + JSON.stringify(assertion.evidence)).join('\n'))
    })
  }
  t.diagnostic(
    checks.length + ' pipeline assertions; copied generator SHA256 ' + hash(Buffer.from(script))
  )
  for (const { label, seconds } of timings) t.diagnostic(label + ': ' + seconds.toFixed(3) + 's')
})
