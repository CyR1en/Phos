import { readdirSync, readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, join, dirname, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPluginConfig } from '../lib/db.mjs'
import { deepMerge } from '../lib/merge.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PLUGINS_DIR = resolve(__dirname, '..', 'plugins')
const OUT_DIR = resolve(__dirname, '..', 'src', 'generated')
const OUT_FILE = join(OUT_DIR, 'plugins.mjs')

// Keep this heuristic in sync with src/components/admin/secret-keys.ts.
function isSecretKey(path) {
  const words = path
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  return words.some((word, index) =>
    /^(?:pass|password|passwd|secret|token|credential|credentials|auth|bearer)$/.test(word) ||
    (word === 'key' && /^(?:api|private|secret|access)$/.test(words[index - 1] ?? '')),
  )
}

function warnSecretConfigKeys(name, config, parent = '') {
  if (!config || typeof config !== 'object') return
  for (const [key, value] of Object.entries(config)) {
    const path = parent ? `${parent}.${key}` : key
    if (isSecretKey(path)) {
      console.warn(`[plugins] ${name}: config key "${path}" looks secret; it is passed as build-time props, so never forward it to an island, define:vars or rendered markup`)
    }
    warnSecretConfigKeys(name, value, path)
  }
}

function discover() {
  if (!existsSync(PLUGINS_DIR)) return []
  const plugins = []
  for (const name of readdirSync(PLUGINS_DIR)) {
    const dir = join(PLUGINS_DIR, name)
    if (!statSync(dir).isDirectory()) continue
    const manifestPath = join(dir, 'plugin.json')
    if (!existsSync(manifestPath)) {
      console.warn(`[plugins] ${name}: missing plugin.json, skipping`)
      continue
    }
    let manifest
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch (e) {
      console.warn(`[plugins] ${name}: invalid plugin.json, skipping (${e.message})`)
      continue
    }
    if (!manifest.entry) {
      console.warn(`[plugins] ${name}: manifest missing "entry", skipping`)
      continue
    }
    const entryPath = resolve(dir, manifest.entry)
    const rel = relative(dir, entryPath)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      console.error(`[discover-plugins] Plugin "${name}" entry path escapes plugin directory: ${manifest.entry}`)
      continue
    }
    if (!existsSync(entryPath)) {
      console.warn(`[plugins] ${name}: entry ${manifest.entry} not found, skipping`)
      continue
    }
    let config = {}
    let configSource = 'none'
    if (manifest.config) {
      const configPath = resolve(dir, manifest.config)
      const configRel = relative(dir, configPath)
      if (configRel.startsWith('..') || isAbsolute(configRel)) {
        console.error(`[discover-plugins] Plugin "${name}" config path escapes plugin directory: ${manifest.config}`)
        continue
      }
      if (existsSync(configPath)) {
        try {
          config = JSON.parse(readFileSync(configPath, 'utf8'))
          configSource = 'json'
        } catch (e) {
          console.warn(`[plugins] ${name}: invalid config file, using empty (${e.message})`)
        }
      }
    }
    if (manifest.admin === true) {
      const row = getPluginConfig(name)
      if (row) {
        config = deepMerge(config, row.config)
        configSource = 'json+sqlite'
      }
    }
    warnSecretConfigKeys(name, config)
    plugins.push({
      name,
      slot: manifest.slot || null,
      config,
      entryRel: relative(OUT_DIR, entryPath).replace(/\\/g, '/'),
      configSource,
    })
  }
  return plugins
}

const plugins = discover()
mkdirSync(OUT_DIR, { recursive: true })

if (plugins.length === 0) {
  writeFileSync(OUT_FILE, `export const plugins = []\nexport const components = {}\n`)
} else {
  const importLines = plugins
    .map((p, index) => `import plugin${index} from ${JSON.stringify(p.entryRel)}`)
    .join('\n')
  const componentMap = plugins
    .map((p, index) => `  ${JSON.stringify(p.name)}: plugin${index}`)
    .join(',\n')
  const exportData = JSON.stringify(
    plugins.map((p) => ({ name: p.name, slot: p.slot, config: p.config })),
    null,
    2
  )
  writeFileSync(
    OUT_FILE,
    `${importLines}\n\nexport const plugins = ${exportData}\n\nexport const components = {\n${componentMap}\n}\n`
  )
}

console.log(`[plugins] discovered ${plugins.length}: ${plugins.map((p) => `${p.name} (${p.configSource})`).join(', ') || '(none)'}`)
