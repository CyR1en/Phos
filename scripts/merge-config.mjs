import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const DB_PATH = process.env.DB_PATH || join(ROOT, 'config', 'site.db')
const SOURCE_JSON = process.argv[2] || join(ROOT, 'src', 'content', 'site-config.json')
const DEST_JSON = process.argv[3] || join(ROOT, 'src', 'content', 'site-config.json')

function deepMerge(target, source) {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (!(key in target)) continue
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key] = deepMerge(result[key], source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}

function readJSON(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf-8'))
  } catch {
    return null
  }
}

async function readFromSqlite() {
  const mod = await import('../lib/db.mjs')
  const { assembleConfig } = mod
  return assembleConfig()
}

async function main() {
  const defaults = readJSON(SOURCE_JSON) || {}

  let live = await readFromSqlite()
  if (!live) {
    const persistedJson = process.env.CONFIG_PATH && existsSync(process.env.CONFIG_PATH)
      ? readJSON(process.env.CONFIG_PATH)
      : null
    live = persistedJson || {}
  }

  const merged = deepMerge(defaults, live)
  const dir = dirname(DEST_JSON)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(DEST_JSON, JSON.stringify(merged, null, 2), 'utf-8')
  console.log(`Wrote merged config to ${DEST_JSON}`)
}

main().catch((err) => {
  console.error('merge-config error:', err)
  process.exit(1)
})
