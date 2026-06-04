import { readFileSync, writeFileSync, existsSync } from 'node:fs'

function deepMerge(target, source) {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key] = deepMerge(result[key], source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}

const [, , defaultPath, persistedPath] = process.argv

const defaults = JSON.parse(readFileSync(defaultPath, 'utf-8'))
const existing = existsSync(persistedPath) ? JSON.parse(readFileSync(persistedPath, 'utf-8')) : {}
const merged = deepMerge(defaults, existing)
writeFileSync(persistedPath, JSON.stringify(merged, null, 2), 'utf-8')
