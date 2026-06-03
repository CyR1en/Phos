import { readdir, stat, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, extname, parse } from 'node:path'
import sharp from 'sharp'
import yaml from 'yaml'

const PHOTOS_SOURCE = process.env.PHOTOS_SOURCE || join(import.meta.dirname, '..', 'photos')
const OUTPUT_DIR = join(import.meta.dirname, '..', 'public', 'photos')
const MANIFEST_PATH = join(import.meta.dirname, '..', 'src', 'content', 'categories.json')

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tiff', '.bmp'])

const THUMB_WIDTH = 800
const THUMB_HEIGHT = 600
const MOBILE_THUMB_WIDTH = 400

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

async function getImageMetadata(filePath) {
  try {
    const meta = await sharp(filePath).metadata()
    return { width: meta.width, height: meta.height, format: meta.format }
  } catch {
    return { width: null, height: null, format: null }
  }
}

async function generateBlurPlaceholder(filePath) {
  try {
    const buf = await sharp(filePath)
      .resize(20, null, { fit: 'inside' })
      .webp({ quality: 30 })
      .toBuffer()
    return `data:image/webp;base64,${buf.toString('base64')}`
  } catch {
    return ''
  }
}

async function stripExif(inputPath, outputPath) {
  try {
    await sharp(inputPath).withMetadata({ icc: false, exif: false, xmp: false, iptc: false }).toFile(outputPath)
  } catch {
    await copyFile(inputPath, outputPath)
  }
}

async function generateThumbnail(inputPath, outputPath) {
  await ensureDir(parse(outputPath).dir)
  await sharp(inputPath)
    .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(outputPath)
}

async function scanPhotos(sourceDir) {
  const categories = []

  let entries
  try {
    entries = await readdir(sourceDir)
  } catch {
    console.warn(`Warning: photos directory not found at ${sourceDir}`)
    return { categories: [], featured: [] }
  }

  for (const entry of entries) {
    const entryPath = join(sourceDir, entry)
    const entryStat = await stat(entryPath)

    if (!entryStat.isDirectory() || entry.startsWith('.')) continue

    const catSlug = slugify(entry)
    const catDir = entryPath

    let meta = {}
    const metaPath = join(catDir, '_meta.yaml')
    if (existsSync(metaPath)) {
      try {
        const raw = await readFile(metaPath, 'utf-8')
        meta = yaml.parse(raw) || {}
      } catch (e) {
        console.warn(`Warning: failed to parse ${metaPath}: ${e.message}`)
      }
    }

    const files = (await readdir(catDir)).filter(
      (f) => IMAGE_EXTENSIONS.has(extname(f).toLowerCase()) && !f.startsWith('.')
    ).sort()

    if (files.length === 0) continue

    const fullDir = join(OUTPUT_DIR, 'full', catSlug)
    const thumbDir = join(OUTPUT_DIR, 'thumbs', catSlug)
    const mobileThumbDir = join(OUTPUT_DIR, 'thumbs-mobile', catSlug)
    await ensureDir(fullDir)
    await ensureDir(thumbDir)
    await ensureDir(mobileThumbDir)

    const photoMeta = meta.photos || {}
    const coverFile = meta.cover || files[0]

    const photos = []

    for (const file of files) {
      const srcPath = join(catDir, file)
      const fullPath = join(fullDir, file)
      const thumbName = `${parse(file).name}.webp`
      const thumbPath = join(thumbDir, thumbName)

      await stripExif(srcPath, fullPath)
      await generateThumbnail(srcPath, thumbPath)
      await sharp(srcPath)
        .resize(MOBILE_THUMB_WIDTH, null, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75 })
        .toFile(join(mobileThumbDir, thumbName))

      const metaInfo = photoMeta[file] || {}
      const imgMeta = await getImageMetadata(srcPath)
      const blur = await generateBlurPlaceholder(srcPath)

      photos.push({
        filename: file,
        title: metaInfo.title || titleize(parse(file).name),
        description: metaInfo.description || '',
        full: `/photos/full/${catSlug}/${file}`,
        thumb: `/photos/thumbs/${catSlug}/${thumbName}`,
        thumbMobile: `/photos/thumbs-mobile/${catSlug}/${thumbName}`,
        width: imgMeta.width,
        height: imgMeta.height,
        blur,
        featured: metaInfo.featured || 0,
      })
    }

    const coverPhoto = photos.find((p) => p.filename === coverFile) || photos[0]

    categories.push({
      slug: catSlug,
      name: meta.name || titleize(entry),
      description: meta.description || '',
      cover: `/photos/thumbs/${catSlug}/${parse(coverFile).name}.webp`,
      coverFull: `/photos/full/${catSlug}/${coverFile}`,
      coverWidth: coverPhoto?.width || null,
      coverHeight: coverPhoto?.height || null,
      coverBlur: coverPhoto?.blur || '',
      order: meta.order ?? 99,
      photoCount: photos.length,
      photos,
    })
  }

  categories.sort((a, b) => a.order - b.order)

  const featured = categories
    .flatMap((cat) =>
      cat.photos
        .filter((p) => p.featured > 0)
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
          featured: p.featured,
        }))
    )
    .sort((a, b) => b.featured - a.featured)

  return { categories, featured }
}

async function main() {
  console.log('Scanning photos directory...')
  const { categories, featured } = await scanPhotos(PHOTOS_SOURCE)

  if (categories.length === 0) {
    console.log('No photos found. Place photos in the photos/ directory.')
  } else {
    const total = categories.reduce((s, c) => s + c.photos.length, 0)
    const featuredCount = featured.length
    console.log(`Found ${categories.length} categories with ${total} photos (${featuredCount} featured)`)
  }

  if (existsSync(OUTPUT_DIR)) {
    const existing = await readdir(join(OUTPUT_DIR, 'full'))
    for (const cat of existing) {
      const catPath = join(OUTPUT_DIR, 'full', cat)
      const existingCat = categories.find((c) => c.slug === cat)
      if (!existingCat) {
        await rm(catPath, { recursive: true, force: true }).catch(() => {})
        await rm(join(OUTPUT_DIR, 'thumbs', cat), { recursive: true, force: true }).catch(() => {})
      }
    }
  }

  const manifest = { categories, featured }

  await ensureDir(parse(MANIFEST_PATH).dir)
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2))

  console.log(`Manifest written to ${MANIFEST_PATH}`)
}

main().catch((err) => {
  console.error('Error generating content:', err)
  process.exit(1)
})
