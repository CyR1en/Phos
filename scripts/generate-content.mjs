import { readdir, stat, mkdir, readFile, writeFile, copyFile, rm, rename, unlink } from 'node:fs/promises'
import { existsSync, realpathSync } from 'node:fs'
import { join, extname, parse, dirname, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import sharp from 'sharp'
import yaml from 'yaml'
import Database from 'better-sqlite3'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DB_PATH = process.env.DB_PATH || join(ROOT, 'config', 'site.db')
const PHOTOS_SOURCE = process.env.PHOTOS_SOURCE || (existsSync('/photos') ? '/photos' : join(__dirname, '..', 'photos'))
const PUBLIC_DIR = join(ROOT, 'public')
const OUTPUT_DIR = join(PUBLIC_DIR, 'photos')
const CACHE_PATH = resolveCachePath(process.env.PHOTOS_CACHE_PATH || join(dirname(DB_PATH), 'photos-cache.json'))
const LEGACY_CACHE_PATH = join(OUTPUT_DIR, '.cache.json')
const CACHE_VERSION = 2
const MANIFEST_PATH = join(__dirname, '..', 'src', 'content', 'categories.json')
const GALLERIES_MANIFEST_PATH = join(__dirname, '..', 'src', 'content', 'galleries.json')

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tiff', '.bmp'])

const THUMB_WIDTH = 800
const MOBILE_THUMB_WIDTH = 400
const IMMERSIVE_WIDTH = 2200
const IMMERSIVE_MOBILE_WIDTH = 1100
const HD_SIZE = 3840
const VARIANT_DIRS = {
  thumb: 'thumbs',
  thumbMobile: 'thumbs-mobile',
  immersiveMobile: 'immersive-mobile',
  w1600: 'w1600',
  immersive: 'immersive',
  w2880: 'w2880',
  hd: 'hd',
}
const LADDER_TIERS = ['immersiveMobile', 'w1600', 'immersive', 'w2880', 'hd']
const TIER_WIDTHS = { immersiveMobile: IMMERSIVE_MOBILE_WIDTH, w1600: 1600, immersive: IMMERSIVE_WIDTH, w2880: 2880, hd: HD_SIZE }
// Keep the existing HD q82 and immersive q84 pending the plan's q75 visual tuning.
const WEBP_QUALITY = { immersiveMobile: 80, w1600: 75, immersive: 84, w2880: 75, hd: 82 }
const OUTPUT_DIRS = { full: 'full', ...VARIANT_DIRS, avif: 'avif', heroPortrait: 'hero-portrait', og: 'og' }
const PORTRAIT_SIZES = [[860, 1333], [1290, 2000]]
const COVER_TIERS = ['thumb', 'immersiveMobile', 'immersive']

function resolveCachePath(path) {
  const absolute = resolve(path)
  let existing = absolute
  // Resolve symlinked ancestors too, including /var -> /private/var on macOS,
  // so an override pointing at the legacy file is never mistaken for two files.
  while (!existsSync(existing)) existing = dirname(existing)
  return resolve(realpathSync(existing), relative(existing, absolute))
}

// Filenames may contain spaces or commas, either of which would split a srcset candidate;
// percent-encode the file segment so the same URL is valid in src, href and srcset.
function photoUrl(dir, catSlug, fileName) {
  return `/photos/${dir}/${catSlug}/${encodeURIComponent(fileName)}`
}
// sharp runs on libuv's threadpool, so more photos in flight than it has threads only costs memory.
const CONCURRENCY = Number(process.env.UV_THREADPOOL_SIZE) || 4

async function ensureDir(dir) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function titleize(name) {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// Focus accepts one integer percentage (horizontal, vertical centered), two (x/y),
// or position keywords (left/right/top/bottom/center); decimals are rejected.
function normaliseFocus(value, label) {
  if (value === undefined || value === null) return null

  if (typeof value === 'string' || typeof value === 'number') {
    const parts = String(value).trim().toLowerCase().split(/\s+/)
    if (parts.length >= 1 && parts.length <= 2) {
      if (parts.every((part) => /^\d+%?$/.test(part))) {
        const positions = parts.map((part) => Number(part.replace('%', '')))
        if (positions.every((position) => position >= 0 && position <= 100)) {
          return positions.map((position) => `${position}%`).join(' ')
        }
      }

      if (parts.every((part) => /^(top|bottom|left|right|center)$/.test(part))) {
        const horizontal = parts.filter((part) => part === 'left' || part === 'right').length
        const vertical = parts.filter((part) => part === 'top' || part === 'bottom').length
        if (horizontal <= 1 && vertical <= 1) return parts.join(' ')
      }
    }
  }

  console.warn(`[generate-content] Invalid focus in ${label}; ignoring value`)
  return null
}

function focusFractions(focus) {
  const parts = focus.split(/\s+/)
  let x = 50
  let y = 50
  if (parts.every((part) => /^\d+%$/.test(part))) {
    x = Number(parts[0].slice(0, -1))
    y = parts[1] ? Number(parts[1].slice(0, -1)) : 50
  } else {
    if (parts.includes('left')) x = 0
    if (parts.includes('right')) x = 100
    if (parts.includes('top')) y = 0
    if (parts.includes('bottom')) y = 100
  }
  return [x / 100, y / 100]
}

function coverCrop(image, source, w, h, focus) {
  if (!focus) return image.resize(w, h, { fit: 'cover', position: sharp.strategy.attention })
  const scale = Math.max(w / source.w, h / source.h)
  const rw = Math.max(w, Math.round(source.w * scale))
  const rh = Math.max(h, Math.round(source.h * scale))
  const [fx, fy] = focusFractions(focus)
  // CSS object-position distributes the overflow, rather than snapping focus to an edge.
  return image.resize(rw, rh, { fit: 'fill' }).extract({
    left: Math.round(fx * (rw - w)),
    top: Math.round(fy * (rh - h)),
    width: w,
    height: h,
  })
}

function createLimiter(concurrency) {
  let active = 0
  const queue = []
  const next = () => {
    if (active >= concurrency || queue.length === 0) return
    active++
    const { fn, resolve, reject } = queue.shift()
    Promise.resolve().then(fn).then(resolve, reject).finally(() => {
      active--
      next()
    })
  }
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject })
    next()
  })
}

// Shared by every category so the whole library encodes at most CONCURRENCY photos at once.
const limitEncode = createLimiter(CONCURRENCY)

// Results keep the order of `items`, not completion order.
function pMap(items, fn, concurrency) {
  const limit = createLimiter(concurrency)
  return Promise.all(items.map((item) => limit(() => fn(item))))
}

async function migrateLegacyCache() {
  if (CACHE_PATH === LEGACY_CACHE_PATH || !existsSync(LEGACY_CACHE_PATH)) return
  if (existsSync(CACHE_PATH)) {
    await rm(LEGACY_CACHE_PATH, { force: true })
    console.log(`Removed legacy public photo cache at ${LEGACY_CACHE_PATH}; using ${CACHE_PATH}`)
    return
  }
  await ensureDir(dirname(CACHE_PATH))
  try {
    await rename(LEGACY_CACHE_PATH, CACHE_PATH)
  } catch (error) {
    if (error.code !== 'EXDEV') throw error
    await copyFile(LEGACY_CACHE_PATH, CACHE_PATH)
    await unlink(LEGACY_CACHE_PATH)
  }
  console.log(`Migrated photo cache from ${LEGACY_CACHE_PATH} to ${CACHE_PATH}`)
}

async function loadCache() {
  try {
    const cache = JSON.parse(await readFile(CACHE_PATH, 'utf-8'))
    if (cache.version === CACHE_VERSION && cache.files) return cache
  } catch {
    // Missing or invalid caches are regenerated below.
  }
  return { version: CACHE_VERSION, files: {} }
}

let cacheSave = Promise.resolve()
function saveCache(cache) {
  const content = JSON.stringify({ ...cache, version: CACHE_VERSION }, null, 2)
  // Categories finish concurrently. Serialize atomic snapshots so an interrupted run
  // retains the last complete category instead of leaving a partial JSON file.
  cacheSave = cacheSave.then(async () => {
    await ensureDir(dirname(CACHE_PATH))
    await writeFile(`${CACHE_PATH}.tmp`, content)
    await rename(`${CACHE_PATH}.tmp`, CACHE_PATH)
  })
  return cacheSave
}

function getOrientedDimensions(metadata) {
  if (metadata.autoOrient) return metadata.autoOrient
  const swapDimensions = metadata.orientation >= 5 && metadata.orientation <= 8
  return {
    width: swapDimensions ? metadata.height : metadata.width,
    height: swapDimensions ? metadata.width : metadata.height,
  }
}

async function decodePixels(input) {
  // Decode once at HD size, then derive every variant from these sRGB pixels.
  const { data, info } = await sharp(input)
    .rotate()
    .resize(HD_SIZE, HD_SIZE, { fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true })
  return () => sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
}

function variantDimensions(info) {
  return { w: info.width, h: info.height }
}

function hasDimensions(variant) {
  return variant?.w > 0 && variant.h > 0
}

function avifName(name, tier) {
  return `${parse(name).name}-${TIER_WIDTHS[tier]}.avif`
}

function encodeAvif(image) {
  // Effort 3 measured 4× faster than 4 with identical size and PSNR.
  // q50 measured ~2 dB below the WebP it replaces; use q62 for photo fidelity.
  return image.avif({ quality: 62, effort: 3, chromaSubsampling: '4:2:0' })
}

function writeLadderVariant(image, tier, path, format = 'webp') {
  // Keep stable tier URLs for small sources and legacy caches; srcsets deduplicate
  // their actual widths, and withoutEnlargement prevents duplicate tiers upscaling.
  const resized = image
    .resize(TIER_WIDTHS[tier], tier === 'hd' ? HD_SIZE : null, { fit: 'inside', withoutEnlargement: true })
    .withIccProfile('srgb')
  return (format === 'avif' ? encodeAvif(resized) : resized.webp({ quality: WEBP_QUALITY[tier] })).toFile(path)
}

function writePhotoVariant(image, tier, path) {
  if (tier === 'thumb' || tier === 'thumbMobile') {
    return image
      .resize(tier === 'thumb' ? THUMB_WIDTH : MOBILE_THUMB_WIDTH, null, { fit: 'inside', withoutEnlargement: true })
      .sharpen({ sigma: 0.5 })
      .webp({ quality: tier === 'thumb' ? 82 : 75, smartSubsample: true })
      .toFile(path)
  }
  return writeLadderVariant(image, tier, path)
}

// Use encoded widths for every responsive ladder; tiers that add no pixels are dropped.
function buildSrcset(catSlug, name, variants, tiers = LADDER_TIERS, format = 'webp') {
  return formatSrcset(tiers.map((tier) => [
    photoUrl(format === 'avif' ? 'avif' : VARIANT_DIRS[tier], catSlug, format === 'avif' ? avifName(name, tier) : name),
    variants[tier].w,
  ]))
}

function formatSrcset(sizes) {
  sizes.sort((a, b) => a[1] - b[1])
  const candidates = []
  let prevWidth = 0
  for (const [url, w] of sizes) {
    if (w <= prevWidth) continue
    candidates.push(`${url} ${w}w`)
    prevWidth = w
  }
  return candidates.join(', ')
}

function ogUrl(catSlug, photo) {
  return photoUrl('og', catSlug, `${parse(photo.filename).name}.jpg`)
}

// Hero AVIF ladders and portrait crops share one decoded source with the OG crop.
// Gallery covers request only the OG crop.
async function generatePhotoAssets(catSlug, photo, cache, hero = false) {
  const cached = cache.files[`${catSlug}/${photo.filename}`]
  const name = parse(photo.filename).name
  const source = cached.variants.hd
  const ogPath = join(OUTPUT_DIR, 'og', catSlug, `${name}.jpg`)
  // A re-encoded source (fresh cache entry) invalidates every crop derived from it.
  const sourceChanged = Boolean(cached.avifStale)
  const changedOgFocus = sourceChanged || cached.og?.focus !== photo.focus || (photo.focus && cached.og?.framing !== 'object-position')
  const needsOg = changedOgFocus || !existsSync(ogPath)
  const portraitSizes = hero ? PORTRAIT_SIZES.filter(([w, h]) => Math.max(w / source.w, h / source.h) <= 1) : []
  const canPortrait = portraitSizes.length > 0
  const portraitPath = (w, format) => join(OUTPUT_DIR, 'hero-portrait', catSlug, `${name}-${w}.${format}`)
  const avifPath = (tier) => join(OUTPUT_DIR, 'avif', catSlug, avifName(photo.filename, tier))
  const changedPortraitFocus = sourceChanged || cached.heroPortrait?.focus !== photo.focus || (photo.focus && cached.heroPortrait?.framing !== 'object-position')
  const missingPortrait = canPortrait
    ? ['webp', 'avif'].flatMap((format) => portraitSizes
      .filter(([w]) => changedPortraitFocus || !existsSync(portraitPath(w, format)))
      .map(([w, h]) => ({ w, h, format })))
    : []
  const missingAvif = hero ? LADDER_TIERS.filter((tier) => cached.avifStale || !existsSync(avifPath(tier))) : []

  if (canPortrait) {
    if (changedPortraitFocus) cached.heroPortrait = { focus: photo.focus, framing: 'object-position', webp: {}, avif: {} }
    cached.heroPortrait.webp ||= {}
    cached.heroPortrait.avif ||= {}
  }
  if (hero) cached.variants.avif ||= {}

  if (needsOg || missingPortrait.length || missingAvif.length) {
    await limitEncode(async () => {
      const pixels = await decodePixels(join(OUTPUT_DIR, 'full', catSlug, photo.filename))
      await Promise.all([
        ...(needsOg ? [coverCrop(pixels(), source, 1200, 630, photo.focus)
          .withIccProfile('srgb')
          .jpeg({ quality: 80 })
          .toFile(ogPath)
          .then((info) => { cached.og = { focus: photo.focus, framing: 'object-position', ...variantDimensions(info) } })] : []),
        ...missingPortrait.map(async ({ w, h, format }) => {
          const image = coverCrop(pixels(), source, w, h, photo.focus).withIccProfile('srgb')
          const info = await (format === 'avif' ? encodeAvif(image) : image.webp({ quality: 75 })).toFile(portraitPath(w, format))
          cached.heroPortrait[format][w] = variantDimensions(info)
        }),
        ...missingAvif.map(async (tier) => {
          cached.variants.avif[tier] = variantDimensions(await writeLadderVariant(pixels(), tier, avifPath(tier), 'avif'))
        }),
      ])
    })
  }

  // Recover absent cache keys from existing files without rewriting their bytes or mtimes.
  await Promise.all([
    ...(hero ? LADDER_TIERS.filter((tier) => !hasDimensions(cached.variants.avif[tier])).map(async (tier) => {
      cached.variants.avif[tier] = variantDimensions(await sharp(avifPath(tier)).metadata())
    }) : []),
    ...['webp', 'avif'].flatMap((format) => portraitSizes.filter(([w]) => !hasDimensions(cached.heroPortrait[format][w])).map(async ([w]) => {
      cached.heroPortrait[format][w] = variantDimensions(await sharp(portraitPath(w, format)).metadata())
    })),
  ])
  if (hero) delete cached.avifStale

  const portraitSrcset = (format) => formatSrcset(portraitSizes.map(([w]) => [
    photoUrl('hero-portrait', catSlug, `${name}-${w}.${format}`),
    cached.heroPortrait[format][w].w,
  ]))
  return {
    ogImage: ogUrl(catSlug, photo),
    ...(hero ? { srcsetAvif: buildSrcset(catSlug, photo.filename, cached.variants.avif, LADDER_TIERS, 'avif') } : {}),
    heroPortrait: canPortrait ? { srcset: portraitSrcset('webp'), srcsetAvif: portraitSrcset('avif') } : null,
  }
}

// The last successfully written gallery manifest remains live when SQLite is unavailable.
// Preserve every OG/portrait URL it references, including references in nested photo data.
function selectedAssets(categories, heroPriority, galleries) {
  const expected = new Map(categories.map((cat) => [cat.slug, { og: new Set(), heroPortrait: new Set(), avif: new Set() }]))
  const collect = (value, gallery = false) => {
    if (Array.isArray(value)) {
      for (const item of value) collect(item, gallery)
    } else if (value && typeof value === 'object') {
      for (const item of Object.values(value)) collect(item, gallery)
    } else if (typeof value === 'string') {
      for (const candidate of value.split(', ')) {
        const match = candidate.split(' ')[0].match(/^\/photos\/(og|hero-portrait|avif)\/([^/]+)\/([^/]+)$/)
        if (!match || (gallery && match[1] === 'avif')) continue
        const [, dir, catSlug, name] = match
        const key = dir === 'hero-portrait' ? 'heroPortrait' : dir
        if (!expected.has(catSlug)) expected.set(catSlug, { og: new Set(), heroPortrait: new Set(), avif: new Set() })
        expected.get(catSlug)[key].add(decodeURIComponent(name))
      }
    }
  }
  collect(heroPriority)
  // Stable tier files can share an encoded width; srcset deduplication must not
  // make pruning delete those files and trigger an encode on every warm run.
  for (const hero of heroPriority) {
    const filename = decodeURIComponent(hero.full.split('/').at(-1))
    for (const tier of LADDER_TIERS) expected.get(hero.category).avif.add(avifName(filename, tier))
  }
  collect(galleries, true)
  return expected
}

async function pruneSelectedAssets(categories, heroPriority, galleries) {
  const expected = selectedAssets(categories, heroPriority, galleries)
  for (const key of ['og', 'heroPortrait', 'avif']) {
    if (galleries === null && key !== 'avif') continue
    const root = join(OUTPUT_DIR, OUTPUT_DIRS[key])
    if (!existsSync(root)) continue
    for (const catSlug of await readdir(root)) {
      const dir = join(root, catSlug)
      const names = expected.get(catSlug)?.[key] || new Set()
      const files = await readdir(dir)
      await Promise.all(files.filter((name) => !names.has(name)).map((name) => rm(join(dir, name), { force: true })))
    }
  }
}

// `outputs` holds the filenames already present in each output dir for this category.
async function processPhoto(srcPath, catSlug, file, photoMeta, outputs, cache) {
  const relPath = `${catSlug}/${file}`
  const srcStat = await stat(srcPath)

  const thumbName = `${parse(file).name}.webp`
  const fullPath = join(OUTPUT_DIR, 'full', catSlug, file)
  const variantPath = (tier) => join(OUTPUT_DIR, VARIANT_DIRS[tier], catSlug, thumbName)
  const metaInfo = photoMeta[file] || {}

  let cached = cache.files[relPath]
  if (cached && cached.mtimeMs === srcStat.mtimeMs && cached.size === srcStat.size) {
    cached.variants ||= {}
    const missing = Object.keys(VARIANT_DIRS).filter((tier) => !outputs[tier].has(thumbName))
    if (!outputs.full.has(file)) await copyFile(srcPath, fullPath)
    if (missing.length) {
      await limitEncode(async () => {
        const pixels = await decodePixels(srcPath)
        await Promise.all(missing.map(async (tier) => {
          cached.variants[tier] = variantDimensions(await writePhotoVariant(pixels(), tier, variantPath(tier)))
        }))
      })
    }
    // A version-2 entry can predate new variant keys. Read existing dimensions;
    // only absent files need an encode, including missing thumbnails or HD.
    await Promise.all(Object.keys(VARIANT_DIRS).filter((tier) => !hasDimensions(cached.variants[tier])).map(async (tier) => {
      cached.variants[tier] = variantDimensions(await sharp(variantPath(tier)).metadata())
    }))
  } else {
    cached = cache.files[relPath] = await limitEncode(async () => {
      const srcBuf = await readFile(srcPath)
      const imgMeta = await sharp(srcBuf).metadata()
      const { width, height } = getOrientedDimensions(imgMeta)
      const pixels = await decodePixels(srcBuf)

      const [blur, , variants] = await Promise.all([
        pixels()
          .resize(20, null, { fit: 'inside' })
          .webp({ quality: 30 })
          .toBuffer()
          .then(b => `data:image/webp;base64,${b.toString('base64')}`)
          .catch(() => ''),
        copyFile(srcPath, fullPath),
        Promise.all(Object.keys(VARIANT_DIRS).map(async (tier) => [tier, variantDimensions(await writePhotoVariant(pixels(), tier, variantPath(tier)))])),
      ])

      return {
        mtimeMs: srcStat.mtimeMs,
        size: srcStat.size,
        width,
        height,
        blur,
        format: imgMeta.format,
        avifStale: true,
        variants: Object.fromEntries(variants),
      }
    })
  }

  return {
    filename: file,
    title: metaInfo.title || titleize(parse(file).name),
    // Captions hide filename-derived titles and show authored descriptions.
    titleIsAuto: !metaInfo.title,
    description: metaInfo.description || '',
    focus: normaliseFocus(metaInfo.focus, `${srcPath} (_meta.yaml photos.${file}.focus)`),
    full: photoUrl('full', catSlug, file),
    thumb: photoUrl(VARIANT_DIRS.thumb, catSlug, thumbName),
    thumbMobile: photoUrl(VARIANT_DIRS.thumbMobile, catSlug, thumbName),
    immersive: photoUrl(VARIANT_DIRS.immersive, catSlug, thumbName),
    immersiveMobile: photoUrl(VARIANT_DIRS.immersiveMobile, catSlug, thumbName),
    hd: photoUrl(VARIANT_DIRS.hd, catSlug, thumbName),
    srcset: buildSrcset(catSlug, thumbName, cached.variants),
    heroSrc: photoUrl(VARIANT_DIRS.immersive, catSlug, thumbName),
    gridSrcset: buildSrcset(catSlug, thumbName, cached.variants, ['thumbMobile', 'thumb', 'immersiveMobile']),
    width: cached.width,
    height: cached.height,
    blur: cached.blur,
    hero_priority: metaInfo.hero_priority || 0,
  }
}

async function processCategory(dirName, cache, previousAssets) {
  const entryPath = join(PHOTOS_SOURCE, dirName)
  const catSlug = slugify(dirName)

  // Dirent types come from the listing itself, so no per-file lstat is needed to spot symlinks.
  const dirents = await readdir(entryPath, { withFileTypes: true })

  let meta = {}
  // _meta.yaml: photos.<filename>.focus sets object-position; cover_focus overrides the cover photo's focus.
  const metaPath = join(entryPath, '_meta.yaml')
  const metaEntry = dirents.find((d) => d.name === '_meta.yaml')
  if (metaEntry?.isSymbolicLink()) {
    console.warn(`[generate-content] Skipping symlinked meta file: ${metaPath}`)
  } else if (metaEntry) {
    try {
      meta = yaml.parse(await readFile(metaPath, 'utf-8')) || {}
    } catch (e) {
      console.warn(`Warning: failed to parse ${metaPath}: ${e.message}`)
    }
  }

  const files = []
  for (const d of dirents) {
    if (d.name.startsWith('.')) continue
    if (IMAGE_EXTENSIONS.has(extname(d.name).toLowerCase())) {
      if (d.isSymbolicLink()) {
        console.warn(`[generate-content] Skipping symlink: ${join(entryPath, d.name)}`)
        continue
      }
      if (d.isFile()) files.push(d.name)
    }
  }
  files.sort()

  if (files.length === 0) return null

  // One listing per output dir replaces several existsSync calls per photo.
  const outputs = Object.fromEntries(await Promise.all(Object.entries(OUTPUT_DIRS).map(async ([key, dir]) => {
    const path = join(OUTPUT_DIR, dir, catSlug)
    await ensureDir(path)
    return [key, new Set(await readdir(path))]
  })))

  // Outputs for photos that no longer exist in the source folder are pruned BEFORE encoding.
  // Doing it afterwards would, on case-insensitive filesystems (macOS APFS), delete the file a
  // case-only rename just regenerated, because `A.webp` and `a.webp` share one directory entry.
  const expectedWebp = new Set(files.map((f) => `${parse(f).name}.webp`))
  const currentFiles = new Set(files)
  const expected = {
    full: currentFiles,
    ...Object.fromEntries(Object.keys(VARIANT_DIRS).map((tier) => [tier, expectedWebp])),
    avif: new Set(files.flatMap((f) => LADDER_TIERS.map((tier) => avifName(f, tier)))),
    heroPortrait: new Set(files.flatMap((f) => PORTRAIT_SIZES.flatMap(([w]) => ['webp', 'avif'].map((format) => `${parse(f).name}-${w}.${format}`)))),
    og: new Set(files.map((f) => `${parse(f).name}.jpg`)),
  }
  const stale = []
  for (const [key, dir] of Object.entries(OUTPUT_DIRS)) {
    for (const name of outputs[key]) {
      if (['og', 'heroPortrait'].includes(key) && (previousAssets === null || previousAssets.get(catSlug)?.[key].has(name))) continue
      if (expected[key].has(name)) continue
      stale.push(join(OUTPUT_DIR, dir, catSlug, name))
      outputs[key].delete(name)
    }
  }
  await Promise.all(stale.map((p) => rm(p, { force: true }).catch(() => {})))

  const photoMeta = meta.photos || {}
  const coverFile = meta.cover || files[0]

  // Encoding is throttled globally by limitEncode; cache hits only cost a stat.
  const photos = await Promise.all(
    files.map((file) => processPhoto(join(entryPath, file), catSlug, file, photoMeta, outputs, cache))
  )

  // Every cover field derives from the photo that actually exists; a stale `cover:` in
  // _meta.yaml falls back to the first photo instead of emitting URLs that 404.
  const coverPhoto = photos.find((p) => p.filename === coverFile) || photos[0]
  if (meta.cover && coverPhoto.filename !== meta.cover) {
    console.warn(`[generate-content] ${dirName}/_meta.yaml cover "${meta.cover}" not found; using ${coverPhoto.filename}`)
  }

  return {
    slug: catSlug,
    name: meta.name || titleize(dirName),
    description: meta.description || '',
    cover: coverPhoto.thumb,
    coverThumbMobile: coverPhoto.thumbMobile,
    coverFull: coverPhoto.full,
    coverSrcset: buildSrcset(catSlug, `${parse(coverPhoto.filename).name}.webp`, cache.files[`${catSlug}/${coverPhoto.filename}`].variants, COVER_TIERS),
    coverWidth: coverPhoto?.width || null,
    coverHeight: coverPhoto?.height || null,
    coverBlur: coverPhoto?.blur || '',
    coverFocus: normaliseFocus(meta.cover_focus, `${metaPath} cover_focus`) ?? coverPhoto.focus,
    order: meta.order ?? 99,
    offer_service: meta.offer_service !== false,
    photoCount: photos.length,
    photos,
  }
}

async function scanPhotos(sourceDir, previousGalleries) {
  let entries
  try {
    entries = await readdir(sourceDir, { withFileTypes: true })
  } catch {
    console.warn(`Warning: photos directory not found at ${sourceDir}`)
    return { categories: [], heroPriority: [], cache: { version: CACHE_VERSION, files: {} } }
  }

  const cache = await loadCache()

  const slugToDir = {}
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (entry.isSymbolicLink()) {
      console.warn(`[generate-content] Skipping symlink: ${join(sourceDir, entry.name)}`)
      continue
    }
    if (entry.isDirectory()) {
      slugToDir[slugify(entry.name)] = entry.name
    }
  }

  const previousAssets = previousGalleries === null ? null : selectedAssets([], [], previousGalleries)
  const results = await pMap(
    Object.values(slugToDir),
    async (dirName) => {
      const category = await processCategory(dirName, cache, previousAssets)
      await saveCache(cache)
      return category
    },
    CONCURRENCY
  )

  const categories = results.filter(Boolean)

  // Pruning after processing is equivalent to pruning before: processPhoto only touches
  // entries for files that still exist, so the directory tree is walked once, not twice.
  const activeRelPaths = new Set(categories.flatMap((c) => c.photos.map((p) => `${c.slug}/${p.filename}`)))
  for (const relPath of Object.keys(cache.files)) {
    if (!activeRelPaths.has(relPath)) {
      delete cache.files[relPath]
    }
  }

  categories.sort((a, b) => a.order - b.order)

  let config = {}
  try {
    const configPath = join(ROOT, 'src', 'content', 'site-config.json')
    if (existsSync(configPath)) {
      config = JSON.parse(await readFile(configPath, 'utf-8'))
    }
  } catch (err) {
    console.warn('Could not read site-config.json for hero photos:', err.message)
  }

  const heroPhotosConfig = config?.home?.hero?.photos || []
  
  const heroPriority = []
  for (const photoPath of heroPhotosConfig) {
    const [catSlug, filename] = photoPath.split('/')
    const cat = categories.find(c => c.slug === catSlug)
    if (cat) {
      const p = cat.photos.find(photo => photo.filename === filename)
      if (p) {
        heroPriority.push({
          full: p.full,
          thumb: p.thumb,
          thumbMobile: p.thumbMobile,
          hd: p.hd,
          srcset: p.srcset,
          heroSrc: p.heroSrc,
          heroPortrait: null,
          ogImage: ogUrl(cat.slug, p),
          title: p.title,
          titleIsAuto: p.titleIsAuto,
          description: p.description,
          focus: p.focus,
          blur: p.blur,
          width: p.width,
          height: p.height,
          category: cat.slug,
          categoryName: cat.name,
          hero_priority: heroPhotosConfig.length - heroPriority.length, // Keep order
        })
      }
    }
  }

  const selected = new Map()
  for (const hero of heroPriority) {
    const photo = categories.find((cat) => cat.slug === hero.category).photos.find((p) => p.full === hero.full)
    const key = `${hero.category}/${photo.filename}`
    if (!selected.has(key)) selected.set(key, { catSlug: hero.category, photo, heroes: [] })
    selected.get(key).heroes.push(hero)
  }
  await Promise.all([...selected.values()].map(async ({ catSlug, photo, heroes }) => {
    const assets = await generatePhotoAssets(catSlug, photo, cache, heroes.length > 0)
    for (const hero of heroes) Object.assign(hero, assets)
    await saveCache(cache)
  }))

  return { categories, heroPriority, cache }
}

async function main() {
  if (CACHE_PATH === PUBLIC_DIR || CACHE_PATH.startsWith(`${PUBLIC_DIR}${sep}`)) {
    console.warn(`[generate-content] Photo cache ${CACHE_PATH} is inside public/ and will be published; set PHOTOS_CACHE_PATH outside public/`)
  }
  await migrateLegacyCache()

  if (process.env.PHOS_SKIP_CONFIG_SYNC === '1') {
    console.log('Skipping site config sync (PHOS_SKIP_CONFIG_SYNC=1)')
  } else {
    console.log('Syncing site config from SQLite...')
    try {
      execSync('node scripts/merge-config.mjs', { cwd: ROOT, stdio: 'pipe' })
    } catch (err) {
      console.warn(`merge-config failed: ${err.message}`)
    }
  }

  let previousGalleries = []
  try {
    previousGalleries = JSON.parse(await readFile(GALLERIES_MANIFEST_PATH, 'utf-8')).galleries
    if (!Array.isArray(previousGalleries)) throw new Error('Invalid galleries manifest')
  } catch (err) {
    if (err.code !== 'ENOENT') {
      previousGalleries = null
      console.warn(`Could not read previous galleries; preserving OG/portrait files: ${err.message}`)
    }
  }

  console.log('Scanning photos directory...')
  const { categories, heroPriority, cache } = await scanPhotos(PHOTOS_SOURCE, previousGalleries)

  if (categories.length === 0) {
    console.log('No photos found. Place photos in the photos/ directory.')
  } else {
    const total = categories.reduce((s, c) => s + c.photos.length, 0)
    const heroCount = heroPriority.length
    console.log(`Found ${categories.length} categories with ${total} photos (${heroCount} in hero)`)
  }

  // OUTPUT_DIR can exist without any variants (empty library, fresh volume).
  const activeCategories = new Set(categories.map((cat) => cat.slug))
  for (const dir of Object.values(OUTPUT_DIRS)) {
    const path = join(OUTPUT_DIR, dir)
    if (!existsSync(path)) continue
    for (const cat of await readdir(path)) {
      if (!activeCategories.has(cat)) await rm(join(path, cat), { recursive: true, force: true }).catch(() => {})
    }
  }

  const manifest = { categories, heroPriority }

  await ensureDir(dirname(MANIFEST_PATH))
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2))

  console.log(`Manifest written to ${MANIFEST_PATH}`)

  // Generate galleries manifest from SQLite
  let galleries = []
  let galleriesWritten = false
  try {
    if (existsSync(DB_PATH)) {
      const db = new Database(DB_PATH, { readonly: true })
      db.pragma('foreign_keys = ON')

      const dbGalleries = db.prepare(`
        SELECT g.*, COUNT(gp.gallery_id) AS photo_count
        FROM galleries g
        LEFT JOIN gallery_photos gp ON gp.gallery_id = g.id
        GROUP BY g.id
        ORDER BY g.order_num, g.created_at
      `).all()

      const categoryMap = new Map(categories.map(c => [c.slug, c]))

      const allPhotos = db.prepare(
        'SELECT gallery_id, category, filename, position FROM gallery_photos ORDER BY position'
      ).all()

      const photoMap = new Map()
      for (const p of allPhotos) {
        let list = photoMap.get(p.gallery_id)
        if (!list) {
          list = []
          photoMap.set(p.gallery_id, list)
        }
        list.push({ category: p.category, filename: p.filename, position: p.position })
      }

      const galleryCovers = new Map()
      galleries = dbGalleries.map(g => {
        const dbPhotos = photoMap.get(g.id) || []

        const photos = dbPhotos
          .map(p => {
            const cat = categoryMap.get(p.category)
            if (!cat) return null
            const photo = cat.photos.find(ph => ph.filename === p.filename)
            return photo ? { ...photo, category: p.category } : null
          })
          .filter(Boolean)

        const coverRef = g.cover
        let coverPhoto = null
        if (coverRef) {
          const [catSlug, ...fileParts] = coverRef.split('/')
          const coverFile = fileParts.join('/')
          const cat = categoryMap.get(catSlug)
          const photo = cat?.photos.find(ph => ph.filename === coverFile)
          if (photo) coverPhoto = { ...photo, category: catSlug }
        }
        if (!coverPhoto && photos.length > 0) coverPhoto = photos[0]
        if (coverPhoto) galleryCovers.set(`${coverPhoto.category}/${coverPhoto.filename}`, coverPhoto)

        return {
          slug: g.slug,
          name: g.name,
          description: g.description || '',
          cover: coverPhoto?.thumb || null,
          coverFull: coverPhoto?.full || null,
          coverOg: coverPhoto ? ogUrl(coverPhoto.category, coverPhoto) : null,
          coverBlur: coverPhoto?.blur || '',
          coverFocus: coverPhoto?.focus ?? null,
          coverSrcset: coverPhoto
            ? buildSrcset(coverPhoto.category, `${parse(coverPhoto.filename).name}.webp`, cache.files[`${coverPhoto.category}/${coverPhoto.filename}`].variants, COVER_TIERS)
            : '',
          coverWidth: coverPhoto?.width || null,
          coverHeight: coverPhoto?.height || null,
          order: g.order_num,
          photoCount: photos.length,
          photos,
        }
      })

      db.close()
      await Promise.all([...galleryCovers.values()].map((photo) => generatePhotoAssets(photo.category, photo, cache)))

      await ensureDir(dirname(GALLERIES_MANIFEST_PATH))
      await writeFile(GALLERIES_MANIFEST_PATH, JSON.stringify({ galleries }, null, 2))
      galleriesWritten = true
      console.log(`Galleries manifest written to ${GALLERIES_MANIFEST_PATH} (${galleries.length} galleries)`)
    }
  } catch (err) {
    console.warn(`Gallery manifest generation skipped: ${err.message}`)
  }

  await pruneSelectedAssets(categories, heroPriority, galleriesWritten ? galleries : previousGalleries)
  for (const entry of Object.values(cache.files)) delete entry.avifStale
  await saveCache(cache)
}

main().catch((err) => {
  console.error('Error generating content:', err)
  process.exit(1)
})
