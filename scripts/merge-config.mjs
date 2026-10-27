import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deepMerge } from '../lib/merge.mjs'
import { publicConfigJson } from '../lib/config-secrets.mjs'
import { atomicWriteFileSync } from '../lib/atomic-write.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const SOURCE_JSON = process.argv[2] || join(ROOT, 'src', 'content', 'site-config.json')
const DEST_JSON = process.argv[3] || join(ROOT, 'src', 'generated', 'site-config.json')
const PERSISTED_CONFIG_PATH = process.env.CONFIG_PATH || join(ROOT, 'config', 'site-config.json')

function readJSON(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf-8'))
  } catch {
    return null
  }
}

async function readFromSqlite() {
  const mod = await import('../lib/db.mjs')
  const { assembleConfig, hasOwnerConfig } = mod
  // A brand-new database has no owner config yet; preserve the persisted JSON instead of
  // overwriting it with empty defaults. Migrated or admin-saved databases are authoritative.
  return hasOwnerConfig() ? assembleConfig() : null
}

async function main() {
  const defaults = readJSON(SOURCE_JSON) || {}

  let live = await readFromSqlite()
  if (!live) {
    const persistedJson = existsSync(PERSISTED_CONFIG_PATH)
      ? readJSON(PERSISTED_CONFIG_PATH)
      : null
    live = persistedJson || {}
  }

  const merged = deepMerge(defaults, live, { skipUnknownKeys: true })
  atomicWriteFileSync(DEST_JSON, JSON.stringify(merged, null, 2))
  console.log(`Wrote merged config to ${DEST_JSON}`)

  // Only the build-time/persisted config keeps credentials; public/ is served as-is.
  const publicDir = join(ROOT, 'public')
  atomicWriteFileSync(join(publicDir, 'site-config.json'), publicConfigJson(merged))
  console.log(`Wrote merged config to ${join(publicDir, 'site-config.json')}`)
}

main().catch((err) => {
  console.error('merge-config error:', err)
  process.exit(1)
})
