import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrateFromJson, getMeta, open } from '../lib/db.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const DEFAULT_CONFIG_PATH = process.env.CONFIG_PATH_DEFAULT || join(ROOT, 'src', 'content', 'site-config.json')
const PERSISTED_CONFIG_PATH = process.env.CONFIG_PATH || join(ROOT, 'config', 'site-config.json')

function readJSON(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf-8'))
  } catch {
    return null
  }
}

function deepMerge(target, source) {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      result[key] &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}

function main() {
  open()

  const migratedAt = getMeta('migrated_at')
  if (migratedAt) {
    console.log(`Already migrated at ${migratedAt}, skipping.`)
    return
  }

  const defaults = existsSync(DEFAULT_CONFIG_PATH) ? readJSON(DEFAULT_CONFIG_PATH) : null
  const persisted = existsSync(PERSISTED_CONFIG_PATH) ? readJSON(PERSISTED_CONFIG_PATH) : null

  if (!defaults && !persisted) {
    console.log('No source JSON found, skipping migration.')
    return
  }

  const merged = defaults
    ? persisted
      ? deepMerge(defaults, persisted)
      : defaults
    : persisted

  migrateFromJson(merged)
  console.log(`Migrated config to SQLite (source: ${persisted ? PERSISTED_CONFIG_PATH : DEFAULT_CONFIG_PATH})`)
}

main()
