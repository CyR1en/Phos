import { readdir, stat, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, extname, parse, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import sharp from 'sharp'
import yaml from 'yaml'
import Database from 'better-sqlite3'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PHOTOS_SOURCE = process.env.PHOTOS_SOURCE || (existsSync('/photos') ? '/photos' : join(__dirname, '..', 'photos'))
const OUTPUT_DIR = join(__dirname, '..', 'public', 'photos')
const CACHE_PATH = process.env.PHOTOS_CACHE_PATH || join(OUTPUT_DIR, '.cache.json')
const CACHE_VERSION = 2
const MANIFEST_PATH = join(__dirname, '..', 'src', 'content', 'categories.json')
const GALLERIES_MANIFEST_PATH = join(__dirname, '..', 'src', 'content', 'galleries.json')
const ROOT = join(__dirname, '..')

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
  immersive: 'immersive',
  hd: 'hd',
}
const COVER_TIERS = ['thumb', 'immersiveMobile', 'immersive']

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

async function loadCache() {
  try {
    const cache = JSON.parse(await readFile(CACHE_PATH, 'utf-8'))
    if (cache.version === CACHE_VERSION && cache.files) return cache
  } catch {
    // Missing or invalid caches are regenerated below.
  }
  return { version: CACHE_VERSION, files: {} }
}

async function saveCache(cache) {
  await ensureDir(OUTPUT_DIR)
  await writeFile(CACHE_PATH, JSON.stringify({ ...cache, version: CACHE_VERSION }, null, 2))
}

function getOrientedDimensions(metadata) {
  if (metadata.autoOrient) return metadata.autoOrient
  const swapDimensions = metadata.orientation >= 5 && metadata.orientation <= 8
  return {
    width: swapDimensions ? metadata.height : metadata.width,
    height: swapDimensions ? metadata.width : metadata.height,
  }
}

function writeHd(image, hdPath) {
  return image
    .resize(HD_SIZE, HD_SIZE, { fit: 'inside', withoutEnlargement: true })
    .withIccProfile('srgb')
    .webp({ quality: 82 })
    .toFile(hdPath)
}

// Use encoded widths for every responsive ladder; tiers that add no pixels are dropped.
function buildSrcset(catSlug, name, variants, tiers = ['immersiveMobile', 'immersive', 'hd']) {
  const sizes = tiers
    .map((tier) => [photoUrl(VARIANT_DIRS[tier], catSlug, name), variants[tier].w])
    .sort((a, b) => a[1] - b[1])
  const candidates = []
  let prevWidth = 0
  for (const [url, w] of sizes) {
    if (w <= prevWidth) continue
    candidates.push(`${url} ${w}w`)
    prevWidth = w
  }
  return candidates.join(', ')
}

// `outputs` holds the filenames already present in each output dir for this category.
async function processPhoto(srcPath, catSlug, file, photoMeta, outputs, cache) {
  const relPath = `${catSlug}/${file}`
  const srcStat = await stat(srcPath)

  const thumbName = `${parse(file).name}.webp`
  const fullPath = join(OUTPUT_DIR, 'full', catSlug, file)
  const thumbPath = join(OUTPUT_DIR, 'thumbs', catSlug, thumbName)
  const mobileThumbPath = join(OUTPUT_DIR, 'thumbs-mobile', catSlug, thumbName)
  const immersivePath = join(OUTPUT_DIR, 'immersive', catSlug, thumbName)
  const immersiveMobilePath = join(OUTPUT_DIR, 'immersive-mobile', catSlug, thumbName)
  const hdPath = join(OUTPUT_DIR, 'hd', catSlug, thumbName)
  const metaInfo = photoMeta[file] || {}

  let cached = cache.files[relPath]
  if (
    cached &&
    Object.keys(VARIANT_DIRS).every((tier) => cached.variants?.[tier]?.w > 0 && cached.variants[tier].h > 0) &&
    cached.mtimeMs === srcStat.mtimeMs &&
    cached.size === srcStat.size &&
    outputs.full.has(file) &&
    outputs.thumbs.has(thumbName) &&
    outputs.thumbsMobile.has(thumbName) &&
    outputs.immersive.has(thumbName) &&
    outputs.immersiveMobile.has(thumbName)
  ) {
    // Backfill only the HD variant so existing libraries don't re-encode everything.
    if (!outputs.hd.has(thumbName)) {
      const hd = await limitEncode(() => writeHd(sharp(srcPath).rotate(), hdPath))
      cached.variants.hd = { w: hd.width, h: hd.height }
    }
  } else {
    cached = cache.files[relPath] = await limitEncode(async () => {
      const srcBuf = await readFile(srcPath)
      const imgMeta = await sharp(srcBuf).metadata()
      const { width, height } = getOrientedDimensions(imgMeta)

      // Decode the source once at HD size; every smaller variant resizes these pixels
      // instead of decoding the full-resolution file again.
      const { data, info } = await sharp(srcBuf)
        .rotate()
        .resize(HD_SIZE, HD_SIZE, { fit: 'inside', withoutEnlargement: true })
        .raw()
        .toBuffer({ resolveWithObject: true })
      const pixels = () => sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })

      const [blur, , thumb, thumbMobile, immersive, immersiveMobile, hd] = await Promise.all([
        pixels()
          .resize(20, null, { fit: 'inside' })
          .webp({ quality: 30 })
          .toBuffer()
          .then(b => `data:image/webp;base64,${b.toString('base64')}`)
          .catch(() => ''),

        copyFile(srcPath, fullPath),

        pixels()
          .resize(THUMB_WIDTH, null, { fit: 'inside', withoutEnlargement: true })
          .sharpen({ sigma: 0.5 })
          .webp({ quality: 82, smartSubsample: true })
          .toFile(thumbPath),

        pixels()
          .resize(MOBILE_THUMB_WIDTH, null, { fit: 'inside', withoutEnlargement: true })
          .sharpen({ sigma: 0.5 })
          .webp({ quality: 75, smartSubsample: true })
          .toFile(mobileThumbPath),

        pixels()
          .resize(IMMERSIVE_WIDTH, null, { fit: 'inside', withoutEnlargement: true })
          .withIccProfile('srgb')
          .webp({ quality: 84 })
          .toFile(immersivePath),

        pixels()
          .resize(IMMERSIVE_MOBILE_WIDTH, null, { fit: 'inside', withoutEnlargement: true })
          .withIccProfile('srgb')
          .webp({ quality: 80 })
          .toFile(immersiveMobilePath),

        writeHd(pixels(), hdPath),
      ])

      return {
        mtimeMs: srcStat.mtimeMs,
        size: srcStat.size,
        width,
        height,
        blur,
        format: imgMeta.format,
        variants: {
          thumb: { w: thumb.width, h: thumb.height },
          thumbMobile: { w: thumbMobile.width, h: thumbMobile.height },
          immersiveMobile: { w: immersiveMobile.width, h: immersiveMobile.height },
          immersive: { w: immersive.width, h: immersive.height },
          hd: { w: hd.width, h: hd.height },
        },
      }
    })
  }

  return {
    filename: file,
    title: metaInfo.title || titleize(parse(file).name),
    description: metaInfo.description || '',
    focus: normaliseFocus(metaInfo.focus, `${srcPath} (_meta.yaml photos.${file}.focus)`),
    full: photoUrl('full', catSlug, file),
    thumb: photoUrl(VARIANT_DIRS.thumb, catSlug, thumbName),
    thumbMobile: photoUrl(VARIANT_DIRS.thumbMobile, catSlug, thumbName),
    immersive: photoUrl(VARIANT_DIRS.immersive, catSlug, thumbName),
    immersiveMobile: photoUrl(VARIANT_DIRS.immersiveMobile, catSlug, thumbName),
    hd: photoUrl(VARIANT_DIRS.hd, catSlug, thumbName),
    srcset: buildSrcset(catSlug, thumbName, cached.variants),
    gridSrcset: buildSrcset(catSlug, thumbName, cached.variants, ['thumbMobile', 'thumb', 'immersiveMobile']),
    width: cached.width,
    height: cached.height,
    blur: cached.blur,
    hero_priority: metaInfo.hero_priority || 0,
  }
}

async function processCategory(dirName, cache) {
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
    if (IMAGE_EXTENSIONS.has(extname(d.name).toLowerCase()) && !d.name.startsWith('.')) {
      if (d.isSymbolicLink()) {
        console.warn(`[generate-content] Skipping symlink: ${join(entryPath, d.name)}`)
        continue
      }
      files.push(d.name)
    }
  }
  files.sort()

  if (files.length === 0) return null

  const fullDir = join(OUTPUT_DIR, 'full', catSlug)
  const thumbDir = join(OUTPUT_DIR, 'thumbs', catSlug)
  const mobileThumbDir = join(OUTPUT_DIR, 'thumbs-mobile', catSlug)
  const immersiveDir = join(OUTPUT_DIR, 'immersive', catSlug)
  const immersiveMobileDir = join(OUTPUT_DIR, 'immersive-mobile', catSlug)
  const hdDir = join(OUTPUT_DIR, 'hd', catSlug)
  await ensureDir(fullDir)
  await ensureDir(thumbDir)
  await ensureDir(mobileThumbDir)
  await ensureDir(immersiveDir)
  await ensureDir(immersiveMobileDir)
  await ensureDir(hdDir)

  // One listing per output dir replaces several existsSync calls per photo.
  const [full, thumbs, thumbsMobile, immersive, immersiveMobile, hd] = await Promise.all(
    [fullDir, thumbDir, mobileThumbDir, immersiveDir, immersiveMobileDir, hdDir].map(async (dir) => new Set(await readdir(dir)))
  )
  const outputs = { full, thumbs, thumbsMobile, immersive, immersiveMobile, hd }

  // Outputs for photos that no longer exist in the source folder are pruned BEFORE encoding.
  // Doing it afterwards would, on case-insensitive filesystems (macOS APFS), delete the file a
  // case-only rename just regenerated, because `A.webp` and `a.webp` share one directory entry.
  const expectedWebp = new Set(files.map((f) => `${parse(f).name}.webp`))
  const currentFiles = new Set(files)
  const stale = []
  for (const [key, dir, expected] of [
    ['full', fullDir, currentFiles],
    ['thumbs', thumbDir, expectedWebp],
    ['thumbsMobile', mobileThumbDir, expectedWebp],
    ['immersive', immersiveDir, expectedWebp],
    ['immersiveMobile', immersiveMobileDir, expectedWebp],
    ['hd', hdDir, expectedWebp],
  ]) {
    for (const name of outputs[key]) {
      if (expected.has(name)) continue
      stale.push(join(dir, name))
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

async function scanPhotos(sourceDir) {
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
    if (entry.isSymbolicLink()) {
      console.warn(`[generate-content] Skipping symlink: ${join(sourceDir, entry.name)}`)
      continue
    }
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      slugToDir[slugify(entry.name)] = entry.name
    }
  }

  const results = await pMap(
    Object.values(slugToDir),
    (dirName) => processCategory(dirName, cache),
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
          title: p.title,
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

  await saveCache(cache)

  return { categories, heroPriority, cache }
}

async function main() {
  console.log('Syncing site config from SQLite...')
  try {
    execSync('node scripts/merge-config.mjs', { cwd: ROOT, stdio: 'pipe' })
  } catch (err) {
    console.warn(`merge-config failed: ${err.message}`)
  }

  console.log('Scanning photos directory...')
  const { categories, heroPriority, cache } = await scanPhotos(PHOTOS_SOURCE)

  if (categories.length === 0) {
    console.log('No photos found. Place photos in the photos/ directory.')
  } else {
    const total = categories.reduce((s, c) => s + c.photos.length, 0)
    const heroCount = heroPriority.length
    console.log(`Found ${categories.length} categories with ${total} photos (${heroCount} in hero)`)
  }

  // OUTPUT_DIR can exist without any variants (empty library, fresh volume).
  if (existsSync(join(OUTPUT_DIR, 'full'))) {
    const existing = await readdir(join(OUTPUT_DIR, 'full'))
    for (const cat of existing) {
      const existingCat = categories.find((c) => c.slug === cat)
      if (!existingCat) {
        await rm(join(OUTPUT_DIR, 'full', cat), { recursive: true, force: true }).catch(() => {})
        await rm(join(OUTPUT_DIR, 'thumbs', cat), { recursive: true, force: true }).catch(() => {})
        await rm(join(OUTPUT_DIR, 'thumbs-mobile', cat), { recursive: true, force: true }).catch(() => {})
        await rm(join(OUTPUT_DIR, 'immersive', cat), { recursive: true, force: true }).catch(() => {})
        await rm(join(OUTPUT_DIR, 'immersive-mobile', cat), { recursive: true, force: true }).catch(() => {})
        await rm(join(OUTPUT_DIR, 'hd', cat), { recursive: true, force: true }).catch(() => {})
      }
    }
  }

  const manifest = { categories, heroPriority }

  await ensureDir(dirname(MANIFEST_PATH))
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2))

  console.log(`Manifest written to ${MANIFEST_PATH}`)

  // Generate galleries manifest from SQLite
  try {
    const DB_PATH = process.env.DB_PATH || join(ROOT, 'config', 'site.db')
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

      const galleries = dbGalleries.map(g => {
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

        return {
          slug: g.slug,
          name: g.name,
          description: g.description || '',
          cover: coverPhoto?.thumb || null,
          coverFull: coverPhoto?.full || null,
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

      await ensureDir(dirname(GALLERIES_MANIFEST_PATH))
      await writeFile(GALLERIES_MANIFEST_PATH, JSON.stringify({ galleries }, null, 2))
      console.log(`Galleries manifest written to ${GALLERIES_MANIFEST_PATH} (${galleries.length} galleries)`)
    }
  } catch (err) {
    console.warn(`Gallery manifest generation skipped: ${err.message}`)
  }
}

main().catch((err) => {
  console.error('Error generating content:', err)
  process.exit(1)
})
