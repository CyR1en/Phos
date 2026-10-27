import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { atomicWriteFileSync } from '../lib/atomic-write.mjs'
import { publicConfigJson } from '../lib/config-secrets.mjs'
import { deepMerge } from '../lib/merge.mjs'

// The public bundle carries only the active palette. The admin's live preview (an iframe of the
// public site) switches palettes without a rebuild, so every theme is also concatenated into a
// plain stylesheet under public/ that the preview path loads on demand.
const allThemesUrl = new URL('../public/themes-all.css', import.meta.url)
const defaultsUrl = new URL('../src/content/site-config.json', import.meta.url)
const generatedUrl = new URL('../src/generated/', import.meta.url)
const configUrl = new URL('site-config.json', generatedUrl)
const pluginsUrl = new URL('plugins.mjs', generatedUrl)
mkdirSync(generatedUrl, { recursive: true })

function writeMissing(url, content) {
  try {
    writeFileSync(url, content, { flag: 'wx' })
    return true
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    return false
  }
}

const themesUrl = new URL('../src/styles/themes/', import.meta.url)
const outputUrl = new URL('../src/styles/active-theme.css', import.meta.url)
// The admin field editor needs the config's SHAPE for type inference; the build config itself
// carries SMTP credentials and must never be inlined into a public /_assets bundle.
const publicConfigUrl = new URL('../src/generated/site-config.public.json', import.meta.url)
const defaultsBytes = readFileSync(defaultsUrl)
const defaults = JSON.parse(defaultsBytes.toString('utf8'))
if (defaults.contact?.smtp?.pass || defaults.contact?.smtp?.user) {
  console.warn('Tracked defaults (src/content/site-config.json) contain SMTP credentials. Confirm your settings in the admin, then restore the defaults as described in docs/configuration.md.')
}
// A fresh clone can run type checks and build:site without opening the owner's database.
let config
if (existsSync(configUrl)) {
  const existingBytes = readFileSync(configUrl, 'utf8')
  config = deepMerge(defaults, JSON.parse(existingBytes), { skipUnknownKeys: true })
  const content = JSON.stringify(config, null, 2)
  if (content !== existingBytes) {
    // Re-read right before replacing: an admin save that landed meanwhile must not be clobbered.
    if (readFileSync(configUrl, 'utf8') !== existingBytes) {
      console.warn('src/generated/site-config.json changed while bootstrapping; keeping the newer file')
    } else {
      atomicWriteFileSync(configUrl, content)
    }
  }
} else {
  config = writeMissing(configUrl, defaultsBytes)
    ? defaults
    : deepMerge(defaults, JSON.parse(readFileSync(configUrl, 'utf8')), { skipUnknownKeys: true })
}
// Match discover-plugins' empty output without loading SQLite or replacing a discovered manifest.
if (!existsSync(pluginsUrl)) {
  writeMissing(pluginsUrl, 'export const plugins = []\nexport const components = {}\n')
}
// Match generate-content's empty-library JSON without scanning photos or opening SQLite.
for (const [filename, manifest] of [
  ['categories.json', { categories: [], heroPriority: [] }],
  ['galleries.json', { galleries: [] }],
]) {
  const url = new URL(filename, generatedUrl)
  if (!existsSync(url)) writeMissing(url, JSON.stringify(manifest, null, 2))
}
const themeFiles = readdirSync(themesUrl, { withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('.css'))
  .map(entry => entry.name)
  .sort()
const themes = new Set(themeFiles.map(name => `theme-${name.slice(0, -4)}`))
const configuredTheme = config.site?.theme
const theme = themes.has(configuredTheme) ? configuredTheme : 'theme-gallery'
if (configuredTheme && !themes.has(configuredTheme)) {
  console.warn(`Configured theme "${configuredTheme}" has no theme file; using ${theme}`)
}

function writeChanged(url, content) {
  if (existsSync(url) && readFileSync(url, 'utf8') === content) return false
  atomicWriteFileSync(url, content)
  return true
}

function sourceFiles(directory, extension, recursive = false) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
    if (recursive && entry.isDirectory()) return sourceFiles(url, extension, true)
    return entry.isFile() && entry.name.endsWith(extension) ? [url] : []
  })
}

async function publicPalette() {
  const { default: postcss } = await import('postcss')
  const referenced = new Set()
  const collect = (url, pattern) => {
    if (!existsSync(url)) return // a scanned file may be deleted; never let that disable trimming
    for (const match of readFileSync(url, 'utf8').matchAll(pattern)) referenced.add(match[1])
  }
  const cssFiles = [
    ...['core.css', 'tokens.css', 'interface.css'].map(name => new URL(`../src/styles/${name}`, import.meta.url)),
    ...sourceFiles(new URL('../src/styles/public/', import.meta.url), '.css'),
  ]
  for (const url of cssFiles) collect(url, /var\(\s*(--[\w-]+)/g)
  const componentFiles = [
    ...sourceFiles(new URL('../src/components/', import.meta.url), '.astro'),
    ...sourceFiles(new URL('../src/layouts/', import.meta.url), '.astro'),
    ...sourceFiles(new URL('../src/pages/', import.meta.url), '.astro', true),
  ]
  for (const url of componentFiles) collect(url, /(--[a-zA-Z_][\w-]*)/g)

  const themeUrl = new URL(`${theme.slice('theme-'.length)}.css`, themesUrl)
  const root = postcss.parse(readFileSync(themeUrl, 'utf8'), { from: themeUrl.pathname })
  // Palettes are plain custom-property selector blocks. If their grammar grows,
  // preserve the full source via @import until the filter understands it.
  for (const node of root.nodes) {
    if (node.type === 'comment') continue
    if (node.type !== 'rule' || node.nodes.some(child => child.type !== 'comment' && (child.type !== 'decl' || !child.prop.startsWith('--')))) {
      throw new Error('Theme contains rules other than custom-property selector blocks')
    }
  }
  const declarations = []
  const dependencies = new Map()
  root.walkDecls(declaration => {
    declarations.push(declaration)
    const names = dependencies.get(declaration.prop) || new Set()
    for (const match of declaration.value.matchAll(/var\(\s*(--[\w-]+)/g)) names.add(match[1])
    dependencies.set(declaration.prop, names)
  })
  // A token can have different dependencies in light and dark blocks. Keep the
  // union, recursively, so both selectors always resolve their custom properties.
  const queue = [...referenced]
  for (let i = 0; i < queue.length; i++) {
    for (const name of dependencies.get(queue[i]) || []) {
      if (referenced.has(name)) continue
      referenced.add(name)
      queue.push(name)
    }
  }
  let kept = 0
  const keptTokens = new Set()
  for (const declaration of declarations) {
    if (referenced.has(declaration.prop)) {
      kept++
      keptTokens.add(declaration.prop)
    } else declaration.remove()
  }
  root.walkComments(comment => comment.remove())
  console.log(`Active palette ${theme}: kept ${kept}, dropped ${declarations.length - kept} declarations (${keptTokens.size} tokens)`)
  return root.toString().trim() + '\n'
}

let content
try {
  content = await publicPalette()
} catch (error) {
  console.warn(`Could not trim active theme; using full @import: ${error.message}`)
  content = `@import "./themes/${theme.slice('theme-'.length)}.css";\n`
}
if (writeChanged(outputUrl, content)) console.log(`Wrote active theme: ${theme}`)
const publicConfig = publicConfigJson(config)
writeChanged(publicConfigUrl, publicConfig)
// The static copy under public/ (served by hosts without the admin proxy) must be stripped too,
// even when the build skips the DB sync that would otherwise rewrite it.
writeChanged(new URL('../public/site-config.json', import.meta.url), publicConfig)

// Keep admin previews untrimmed so palette switching needs no rebuild.
const allThemes = themeFiles
  .map(name => `/* ${name} */\n` + readFileSync(new URL(name, themesUrl), 'utf8'))
  .join('\n')
if (writeChanged(allThemesUrl, allThemes)) {
  console.log('Wrote public/themes-all.css for the admin preview')
}
