import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { brotliCompress, constants, gzip } from 'node:zlib'

const gzipAsync = promisify(gzip)
const brotliAsync = promisify(brotliCompress)
const extensions = new Set([
  '.html', '.css', '.js', '.mjs', '.svg', '.json', '.xml', '.txt', '.webmanifest',
])

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else if (entry.isFile()) yield path
  }
}

async function currentSidecar(path, sourceStat) {
  try {
    const sidecarStat = await stat(path)
    return sidecarStat.mtimeMs >= sourceStat.mtimeMs ? sidecarStat : null
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function main() {
  const args = process.argv.slice(2)
  const paths = args.filter(arg => arg !== '--brotli')
  if (paths.length > 1 || paths.some(arg => arg.startsWith('-'))) {
    throw new Error('Usage: node scripts/compress-dist.mjs [dist-directory] [--brotli]')
  }

  const directory = paths[0] ? resolve(paths[0]) : fileURLToPath(new URL('../dist/', import.meta.url))
  const formats = [{
    name: 'gzip',
    extension: '.gz',
    compress: data => gzipAsync(data, { level: 9 }),
    written: 0,
    skipped: 0,
    bytes: 0,
  }]

  // Opt in with --brotli, then enable brotli_static on in nginx after installing
  // and loading its Brotli module. gzip_static works without that module.
  if (args.includes('--brotli')) {
    formats.push({
      name: 'brotli',
      extension: '.br',
      compress: data => brotliAsync(data, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
      }),
      written: 0,
      skipped: 0,
      bytes: 0,
    })
  }

  let files = 0
  let bytes = 0

  for await (const path of walk(directory)) {
    if (!extensions.has(extname(path).toLowerCase())) continue
    const sourceStat = await stat(path)
    if (sourceStat.size < 1024) continue

    files++
    bytes += sourceStat.size
    let source

    for (const format of formats) {
      const outputPath = `${path}${format.extension}`
      const existing = await currentSidecar(outputPath, sourceStat)
      if (existing) {
        format.skipped++
        format.bytes += existing.size
        continue
      }

      source ??= await readFile(path)
      const compressed = await format.compress(source)
      await writeFile(outputPath, compressed)
      format.written++
      format.bytes += compressed.length
    }
  }

  console.log(formats.map(format =>
    `${format.name}: ${files} files (${format.written} written, ${format.skipped} up to date), ${bytes} -> ${format.bytes} bytes`
  ).join('; '))
}

main().catch(error => {
  console.error('compress-dist:', error.message)
  process.exitCode = 1
})
