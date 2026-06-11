import { readdir, stat, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, extname, parse, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import sharp from 'sharp'
import yaml from 'yaml'
import Database from 'better-sqlite3'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PHOTOS_SOURCE = process.env.PHOTOS_SOURCE || '/photos'
const OUTPUT_DIR = join(__dirname, '..', 'public', 'photos')
const CACHE_PATH = process.env.PHOTOS_CACHE_PATH || join(OUTPUT_DIR, '.cache.json')
const MANIFEST_PATH = join(__dirname, '..', 'src', 'content', 'categories.json')
const GALLERIES_MANIFEST_PATH = join(__dirname, '..', 'src', 'content', 'galleries.json')
const ROOT = join(__dirname, '..')

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tiff', '.bmp'])

const THUMB_WIDTH = 800
const THUMB_HEIGHT = 600
const MOBILE_THUMB_WIDTH = 400
const CONCURRENCY = 4

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

async function pMap(items, fn, concurrency) {
  const results = []
  const executing = new Set()
  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item)).then(r => results.push(r))
    executing.add(p)
    const clean = () => executing.delete(p)
    p.then(clean, clean)
    if (executing.size >= concurrency) {
      await Promise.race(executing)
    }
  }
  await Promise.all(executing)
  return results
}

async function loadCache() {
  try {
    return JSON.parse(await readFile(CACHE_PATH, 'utf-8'))
  } catch {
    return { version: 1, files: {} }
  }
}

async function saveCache(cache) {
  await ensureDir(OUTPUT_DIR)
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2))
}

async function processPhoto(srcPath, catSlug, file, photoMeta, cache) {
  const relPath = `${catSlug}/${file}`
  const srcStat = await stat(srcPath)

  const thumbName = `${parse(file).name}.webp`
  const fullPath = join(OUTPUT_DIR, 'full', catSlug, file)
  const thumbPath = join(OUTPUT_DIR, 'thumbs', catSlug, thumbName)
  const mobileThumbPath = join(OUTPUT_DIR, 'thumbs-mobile', catSlug, thumbName)
  const metaInfo = photoMeta[file] || {}

  const cached = cache.files[relPath]
  if (
    cached &&
    cached.mtimeMs === srcStat.mtimeMs &&
    cached.size === srcStat.size &&
    existsSync(fullPath) &&
    existsSync(thumbPath) &&
    existsSync(mobileThumbPath)
  ) {
    return {
      filename: file,
      title: metaInfo.title || titleize(parse(file).name),
      description: metaInfo.description || '',
      full: `/photos/full/${catSlug}/${file}`,
      thumb: `/photos/thumbs/${catSlug}/${thumbName}`,
      thumbMobile: `/photos/thumbs-mobile/${catSlug}/${thumbName}`,
      width: cached.width,
      height: cached.height,
      blur: cached.blur,
      hero_priority: metaInfo.hero_priority || 0,
    }
  }

  const srcBuf = await readFile(srcPath)
  const imgMeta = await sharp(srcBuf).metadata().then(m => ({ width: m.width, height: m.height, format: m.format }))

  const [blur] = await Promise.all([
    sharp(srcBuf)
      .resize(20, null, { fit: 'inside' })
      .webp({ quality: 30 })
      .toBuffer()
      .then(b => `data:image/webp;base64,${b.toString('base64')}`)
      .catch(() => ''),

    copyFile(srcPath, fullPath),

    sharp(srcBuf)
      .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(thumbPath),

    sharp(srcBuf)
      .resize(MOBILE_THUMB_WIDTH, null, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toFile(mobileThumbPath),
  ])

  cache.files[relPath] = {
    mtimeMs: srcStat.mtimeMs,
    size: srcStat.size,
    width: imgMeta.width,
    height: imgMeta.height,
    blur,
    format: imgMeta.format,
  }

  return {
    filename: file,
    title: metaInfo.title || titleize(parse(file).name),
    description: metaInfo.description || '',
    full: `/photos/full/${catSlug}/${file}`,
    thumb: `/photos/thumbs/${catSlug}/${thumbName}`,
    thumbMobile: `/photos/thumbs-mobile/${catSlug}/${thumbName}`,
    width: imgMeta.width,
    height: imgMeta.height,
    blur,
    hero_priority: metaInfo.hero_priority || 0,
  }
}

async function processCategory(entry, cache) {
  const entryPath = join(PHOTOS_SOURCE, entry)
  const entryStat = await stat(entryPath)

  if (!entryStat.isDirectory() || entry.startsWith('.')) return null

  const catSlug = slugify(entry)

  let meta = {}
  const metaPath = join(entryPath, '_meta.yaml')
  if (existsSync(metaPath)) {
    try {
      meta = yaml.parse(await readFile(metaPath, 'utf-8')) || {}
    } catch (e) {
      console.warn(`Warning: failed to parse ${metaPath}: ${e.message}`)
    }
  }

  const files = (await readdir(entryPath)).filter(
    (f) => IMAGE_EXTENSIONS.has(extname(f).toLowerCase()) && !f.startsWith('.')
  ).sort()

  if (files.length === 0) return null

  const fullDir = join(OUTPUT_DIR, 'full', catSlug)
  const thumbDir = join(OUTPUT_DIR, 'thumbs', catSlug)
  const mobileThumbDir = join(OUTPUT_DIR, 'thumbs-mobile', catSlug)
  await ensureDir(fullDir)
  await ensureDir(thumbDir)
  await ensureDir(mobileThumbDir)

  const photoMeta = meta.photos || {}
  const coverFile = meta.cover || files[0]

  const photos = await pMap(
    files,
    (file) => processPhoto(join(entryPath, file), catSlug, file, photoMeta, cache),
    CONCURRENCY
  )

  const coverPhoto = photos.find((p) => p.filename === coverFile) || photos[0]

  return {
    slug: catSlug,
    name: meta.name || titleize(entry),
    description: meta.description || '',
    cover: `/photos/thumbs/${catSlug}/${parse(coverFile).name}.webp`,
    coverFull: `/photos/full/${catSlug}/${coverFile}`,
    coverWidth: coverPhoto?.width || null,
    coverHeight: coverPhoto?.height || null,
    coverBlur: coverPhoto?.blur || '',
    order: meta.order ?? 99,
    offer_service: meta.offer_service !== false,
    photoCount: photos.length,
    photos,
  }
}

async function scanPhotos(sourceDir) {
  let entries
  try {
    entries = await readdir(sourceDir)
  } catch {
    console.warn(`Warning: photos directory not found at ${sourceDir}`)
    return { categories: [], heroPriority: [] }
  }

  const cache = await loadCache()

  const slugToDir = {}
  for (const entry of entries) {
    const entryPath = join(sourceDir, entry)
    let s
    try { s = await stat(entryPath) } catch { continue }
    if (s.isDirectory() && !entry.startsWith('.')) {
      slugToDir[slugify(entry)] = entry
    }
  }

  const activeRelPaths = new Set()
  for (const [slug, dirName] of Object.entries(slugToDir)) {
    const catFiles = await readdir(join(sourceDir, dirName))
    for (const f of catFiles) {
      if (IMAGE_EXTENSIONS.has(extname(f).toLowerCase()) && !f.startsWith('.')) {
        activeRelPaths.add(`${slug}/${f}`)
      }
    }
  }

  for (const relPath of Object.keys(cache.files)) {
    if (!activeRelPaths.has(relPath)) {
      delete cache.files[relPath]
    }
  }

  const results = await pMap(
    Object.keys(slugToDir),
    (entry) => processCategory(entry, cache),
    CONCURRENCY
  )

  const categories = results.filter(Boolean)
  categories.sort((a, b) => a.order - b.order)

  const heroPriority = categories
    .flatMap((cat) =>
      cat.photos
        .filter((p) => p.hero_priority > 0)
        .map((p) => ({
          full: p.full,
          thumb: p.thumb,
          thumbMobile: p.thumbMobile,
          title: p.title,
          description: p.description,
          blur: p.blur,
          width: p.width,
          height: p.height,
          category: cat.slug,
          categoryName: cat.name,
          hero_priority: p.hero_priority,
        }))
    )
    .sort((a, b) => b.hero_priority - a.hero_priority)

  await saveCache(cache)

  return { categories, heroPriority }
}

async function main() {
  console.log('Syncing site config from SQLite...')
  try {
    execSync('node scripts/merge-config.mjs', { cwd: ROOT, stdio: 'pipe' })
  } catch (err) {
    console.warn(`merge-config failed: ${err.message}`)
  }

  console.log('Scanning photos directory...')
  const { categories, heroPriority } = await scanPhotos(PHOTOS_SOURCE)

  if (categories.length === 0) {
    console.log('No photos found. Place photos in the photos/ directory.')
  } else {
    const total = categories.reduce((s, c) => s + c.photos.length, 0)
    const heroCount = heroPriority.length
    console.log(`Found ${categories.length} categories with ${total} photos (${heroCount} in hero)`)
  }

  if (existsSync(OUTPUT_DIR)) {
    const existing = await readdir(join(OUTPUT_DIR, 'full'))
    for (const cat of existing) {
      const existingCat = categories.find((c) => c.slug === cat)
      if (!existingCat) {
        await rm(join(OUTPUT_DIR, 'full', cat), { recursive: true, force: true }).catch(() => {})
        await rm(join(OUTPUT_DIR, 'thumbs', cat), { recursive: true, force: true }).catch(() => {})
        await rm(join(OUTPUT_DIR, 'thumbs-mobile', cat), { recursive: true, force: true }).catch(() => {})
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

      const galleries = dbGalleries.map(g => {
        const dbPhotos = db.prepare(
          'SELECT category, filename, position FROM gallery_photos WHERE gallery_id = ? ORDER BY position'
        ).all(g.id)

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
          if (cat) coverPhoto = cat.photos.find(ph => ph.filename === coverFile) || null
        }
        if (!coverPhoto && photos.length > 0) coverPhoto = photos[0]

        return {
          slug: g.slug,
          name: g.name,
          description: g.description || '',
          cover: coverPhoto?.thumb || null,
          coverFull: coverPhoto?.full || null,
          coverBlur: coverPhoto?.blur || '',
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
