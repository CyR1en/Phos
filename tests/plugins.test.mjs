import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { cp, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { astroScriptBlocks, repoRoot } from './helpers/bundle.mjs'
import { pluginManifestImports } from './helpers/source-contracts.mjs'

// Never follow sandbox node_modules links into the checkout. Every regular file,
// including public outputs, config/ and nested generated directories, is scanned.
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? walk(path) : entry.isFile() ? [path] : []
  })
}

async function sandbox(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'phos-plugin-config-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'scripts'), { recursive: true })
  await cp(join(repoRoot, 'scripts/discover-plugins.mjs'), join(root, 'scripts/discover-plugins.mjs'))
  await cp(join(repoRoot, 'lib'), join(root, 'lib'), { recursive: true })
  await symlink(join(repoRoot, 'node_modules'), join(root, 'node_modules'), 'dir')
  const plugin = async (name, config = {}) => {
    const directory = join(root, 'plugins', name)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'plugin.json'), JSON.stringify({ entry: "entry's.mjs", slot: 'home', config: 'config.json' }))
    await writeFile(join(directory, "entry's.mjs"), `export default () => ${JSON.stringify(name)}\n`)
    await writeFile(join(directory, 'config.json'), JSON.stringify(config))
  }
  const discover = () => {
    const result = spawnSync(process.execPath, ['scripts/discover-plugins.mjs'], {
      cwd: root, env: { ...process.env, DB_PATH: join(root, 'config/site.db') }, encoding: 'utf8', timeout: 5000,
    })
    assert.equal(result.status, 0, result.stderr)
    return result
  }
  return { root, plugin, discover }
}

test('all Astro script blocks and src JS/TS modules keep the plugin manifest on the build boundary', () => {
  const plugins = readFileSync(join(repoRoot, 'src/components/Plugins.astro'), 'utf8')
  assert.doesNotMatch(plugins, /\bclient:(?:load|idle|visible|media|only)\b/, 'Plugins.astro hydrates nothing')
  const importers = []
  for (const path of walk(join(repoRoot, 'src'))) {
    const source = readFileSync(path, 'utf8')
    const blocks = path.endsWith('.astro') ? astroScriptBlocks(source).map(block => block.code)
      : /\.(?:js|jsx|mjs|ts|tsx)$/.test(path) ? [source] : []
    for (const [index, code] of blocks.entries()) {
      if (pluginManifestImports(code).length) importers.push(relative(repoRoot, path) + (path.endsWith('.astro') ? ':script ' + index : ''))
    }
  }
  assert.deepEqual(importers, [], 'only Astro frontmatter may import generated/plugins')
})

test('Plugins.astro removes every client: and server: directive before spreading config', () => {
  const source = readFileSync(join(repoRoot, 'src/components/Plugins.astro'), 'utf8')
  const expression = source.match(/const\s+(\w+)\s*=\s*(Object\.fromEntries\(Object\.entries\(p\.config\)\.filter\([^\n]+)\n/)
  assert.ok(expression, 'plugin props are filtered before the component spread')
  assert.match(source, new RegExp('<Component\\s+\\{\\.\\.\\.' + expression[1] + '\\}'))
  assert.doesNotMatch(source, /<Component\s+\{\.\.\.p\.config\}/)
  const config = { label: 'safe', 'client:load': true, 'client:only': 'preact', 'client:future': {}, 'server:defer': true, 'server:future': true, clientLabel: 'retained', serverUrl: '/kept' }
  const props = new Function('p', 'return ' + expression[2])({ config })
  assert.deepEqual(props, { label: 'safe', clientLabel: 'retained', serverUrl: '/kept' })
})

test('plugin discovery writes its secret sentinel only to its own config and build-time manifest', async t => {
  const { root, plugin, discover } = await sandbox(t)
  const sentinel = 'phos-y4-plugin-private-sentinel'
  await plugin('sample', { label: 'sample', token: sentinel })
  discover()
  const matches = walk(root).filter(path => readFileSync(path).includes(Buffer.from(sentinel))).map(path => relative(root, path)).sort()
  assert.deepEqual(matches, ['plugins/sample/config.json', 'src/generated/plugins.mjs'])
})

test('discovery loads colliding, digit-leading and quoted plugin names with JSON-escaped strings', async t => {
  const { root, plugin, discover } = await sandbox(t)
  const names = ['a-b', 'a_b', '1-first', "quote'plugin", 'quote"plugin']
  for (const name of names) await plugin(name, { label: name })
  discover()
  const source = readFileSync(join(root, 'src/generated/plugins.mjs'), 'utf8')
  const identifiers = [...source.matchAll(/^import\s+([\w$]+)\s+from\s+/gm)].map(([, identifier]) => identifier)
  assert.equal(identifiers.length, names.length)
  assert.equal(new Set(identifiers).size, names.length, 'identifiers cannot collide after name sanitization')
  assert.ok(identifiers.every(identifier => /\d+$/.test(identifier)), 'identifiers are based on discovery indices')
  const manifest = await import(pathToFileURL(join(root, 'src/generated/plugins.mjs')).href)
  assert.deepEqual(manifest.plugins.map(plugin => plugin.name).sort(), names.sort())
  for (const name of names) assert.equal(manifest.components[name](), name)
})

test('discovery warns with plugin and nested secret-key path, without logging values', async t => {
  const { plugin, discover } = await sandbox(t)
  const config = { apiKey: 'private-api-value', nested: { password: 'private-pass-value' }, label: 'public label' }
  await plugin('sample', config)
  const { stderr } = discover()
  for (const path of ['apiKey', 'nested.password']) assert.ok(stderr.includes(`[plugins] sample: config key "${path}" looks secret`), path)
  assert.ok(!stderr.includes(config.apiKey) && !stderr.includes(config.nested.password), 'warnings identify keys without secret values')
  assert.ok(!stderr.includes('config key "label" looks secret'))
})
