import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, cp, rm, writeFile, readFile, symlink, realpath, stat, utimes, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { repoRoot } from './helpers/bundle.mjs'
import { publicConfigJson } from '../lib/config-secrets.mjs'
import { deepMerge } from '../lib/merge.mjs'

// merge-config decides whether SQLite or the persisted JSON is the owner's configuration.
// Run it in an isolated copy so the real config/ is never touched.
async function sandbox(t) {
  const ROOT = await realpath(await mkdtemp(join(tmpdir(), 'phos-merge-config-')))
  t.after(() => rm(ROOT, { recursive: true, force: true }))
  await mkdir(join(ROOT, 'scripts'), { recursive: true })
  for (const script of ['merge-config', 'migrate-config', 'write-active-theme', 'discover-plugins', 'generate-content']) {
    await cp(join(repoRoot, `scripts/${script}.mjs`), join(ROOT, `scripts/${script}.mjs`))
  }
  await cp(join(repoRoot, 'lib'), join(ROOT, 'lib'), { recursive: true })
  await symlink(join(repoRoot, 'node_modules'), join(ROOT, 'node_modules'), 'dir')
  await mkdir(join(ROOT, 'config'))
  await mkdir(join(ROOT, 'public'))
  await mkdir(join(ROOT, 'src/content'), { recursive: true })
  const defaults = {
    site: { title: '', description: '', theme: 'theme-gallery', social: [] },
    contact: { heading: 'Contact', smtp: { host: '', port: 587, user: '', pass: '', fromEmail: '', toEmail: '' } },
  }
  await writeFile(join(ROOT, 'defaults.json'), JSON.stringify(defaults, null, 2))
  await writeFile(join(ROOT, 'src/content/site-config.json'), JSON.stringify(defaults, null, 2))
  const env = { ...process.env, DB_PATH: join(ROOT, 'config/site.db') }
  delete env.CONFIG_PATH
  delete env.CONFIG_PATH_DEFAULT
  delete env.PHOS_SKIP_CONFIG_SYNC
  const node = (args, extraEnv = {}) => {
    const result = spawnSync(process.execPath, args, { cwd: ROOT, env: { ...env, ...extraEnv }, encoding: 'utf8', timeout: 10000 })
    assert.equal(result.status, 0, result.stderr)
    return result
  }
  const merge = (extraEnv) => node(['scripts/merge-config.mjs', 'defaults.json', 'dest.json'], extraEnv)
  const db = (code) => node(['--input-type=module', '-e', `const db = await import('./lib/db.mjs'); ${code}`])
  const json = async (name) => JSON.parse(await readFile(join(ROOT, name), 'utf8'))
  return { ROOT, merge, db, json, node, env }
}

async function themeInputs(ROOT) {
  await cp(join(repoRoot, 'src/styles'), join(ROOT, 'src/styles'), { recursive: true })
  for (const directory of ['components', 'layouts', 'pages']) {
    await cp(join(repoRoot, 'src', directory), join(ROOT, 'src', directory), { recursive: true })
  }
}

test('a database populated only through the admin is authoritative without migrate-config', async (t) => {
  const { ROOT, merge, db, json } = await sandbox(t)
  db(`db.writeFullConfig({ site: { title: 'ADMIN-EDITED TITLE', theme: 'theme-gallery' } })`)
  const meta = db(`console.log(db.getMeta('config_updated_at') ? 'stamped' : 'missing', db.hasOwnerConfig())`)
  assert.match(meta.stdout, /^stamped true/)
  merge()
  assert.equal((await json('dest.json')).site.title, 'ADMIN-EDITED TITLE')
  const publicCopy = await readFile(join(ROOT, 'public/site-config.json'), 'utf8')
  assert.equal(publicCopy, publicConfigJson(await json('dest.json')), 'public copy uses the shared serializer')
  assert.ok(!('smtp' in (await json('public/site-config.json')).contact), 'public copy has no SMTP block')
})

test('an admin-saved database without any marker still counts as owner configuration', async (t) => {
  const { merge, db, json } = await sandbox(t)
  db(`db.writeFullConfig({ site: { title: 'PRE-MARKER TITLE' } }); db.setMeta('config_updated_at', ''); console.log(db.hasOwnerConfig())`)
  merge()
  assert.equal((await json('dest.json')).site.title, 'PRE-MARKER TITLE')
})

test('portfolio-only admin config round-trips through an isolated DB and marks owner configuration', async t => {
  const { db } = await sandbox(t)
  const portfolio = {
    page_description: 'A selected portfolio',
    og_title: 'Selected work',
    og_description: 'Photography from the mountains and city',
  }
  const result = db(`
    db.writeFullConfig({ portfolio: ${JSON.stringify(portfolio)} });
    console.log(JSON.stringify({ portfolio: db.assembleConfig().portfolio, owner: db.hasOwnerConfig() }));
  `)
  assert.deepEqual(JSON.parse(result.stdout), { portfolio, owner: true })
})

test('a brand-new database defers to the persisted JSON and keeps credentials for the build', async (t) => {
  const { ROOT, merge, db, json } = await sandbox(t)
  const saved = {
    site: { title: 'OWNER' },
    contact: { smtp: { host: 'smtp.example.test', port: 2525, user: 'owner-user', pass: 'owner-password', fromEmail: 'from@example.test', toEmail: 'to@example.test' } },
  }
  await writeFile(join(ROOT, 'saved.json'), JSON.stringify(saved))
  assert.match(db(`console.log(db.hasOwnerConfig())`).stdout, /^false/)
  merge({ CONFIG_PATH: join(ROOT, 'saved.json') })
  const dest = await json('dest.json')
  assert.equal(dest.site.title, 'OWNER')
  assert.equal(dest.contact.smtp.pass, 'owner-password', 'the build config keeps credentials')
  assert.ok(!('smtp' in (await json('public/site-config.json')).contact))
})

test('merge-config defaults DEST to src/generated and never rewrites tracked defaults', async t => {
  const { ROOT, node, json } = await sandbox(t)
  const defaultsPath = join(ROOT, 'src/content/site-config.json')
  const before = await readFile(defaultsPath)
  await writeFile(join(ROOT, 'config/site-config.json'), JSON.stringify({ site: { title: 'OWNER OVERRIDE' } }))
  node(['scripts/merge-config.mjs'])
  assert.equal((await json('src/generated/site-config.json')).site.title, 'OWNER OVERRIDE')
  assert.deepEqual(await readFile(defaultsPath), before, 'source defaults are byte-equal after merging')
  assert.equal(await readFile(join(ROOT, 'public/site-config.json'), 'utf8'), publicConfigJson(await json('src/generated/site-config.json')))
})

test('write-active-theme bootstraps missing generated config byte-for-byte and strips both public copies', async t => {
  const { ROOT, node, json } = await sandbox(t)
  await themeInputs(ROOT)
  const defaults = await json('src/content/site-config.json')
  defaults.contact.smtp.pass = 'sandbox-private-password'
  // Deliberately noncanonical: serialization with two spaces or a newline is not a copy.
  const bytes = JSON.stringify(defaults, null, 4)
  await writeFile(join(ROOT, 'src/content/site-config.json'), bytes)
  assert.ok(!existsSync(join(ROOT, 'src/generated/site-config.json')))
  const run = node(['scripts/write-active-theme.mjs'])
  assert.match(run.stderr, /src\/content\/site-config\.json[^\n]*SMTP credentials/)
  assert.ok(!run.stderr.includes(defaults.contact.smtp.pass), 'warning does not print credential values')
  assert.equal(await readFile(join(ROOT, 'src/generated/site-config.json'), 'utf8'), bytes)
  assert.equal(await readFile(join(ROOT, 'src/content/site-config.json'), 'utf8'), bytes)
  for (const copy of ['src/generated/site-config.public.json', 'public/site-config.json']) {
    assert.equal(await readFile(join(ROOT, copy), 'utf8'), publicConfigJson(defaults), copy)
    assert.ok(!Object.hasOwn((await json(copy)).contact, 'smtp'), copy + ' omits the entire SMTP block')
  }
  const stub = await readFile(join(ROOT, 'src/generated/plugins.mjs'))
  await rm(join(ROOT, 'src/generated/plugins.mjs'))
  node(['scripts/discover-plugins.mjs'])
  assert.deepEqual(await readFile(join(ROOT, 'src/generated/plugins.mjs')), stub, 'missing-manifest bootstrap and zero-plugin discovery emit identical bytes')
})

test('write-active-theme bootstraps missing photo manifests byte-equal to an empty generator run', async t => {
  const { ROOT, node } = await sandbox(t)
  await themeInputs(ROOT)
  const paths = ['categories', 'galleries'].map(name => join(ROOT, 'src/generated', name + '.json'))
  for (const path of paths) assert.ok(!existsSync(path), path + ': initially missing')
  node(['scripts/write-active-theme.mjs'])
  const bootstrapped = await Promise.all(paths.map(path => readFile(path)))
  assert.deepEqual(JSON.parse(bootstrapped[0]), { categories: [], heroPriority: [] })
  assert.deepEqual(JSON.parse(bootstrapped[1]), { galleries: [] })
  for (const path of paths) await rm(path)
  const source = join(ROOT, 'empty-photos')
  await mkdir(source)
  node(['scripts/generate-content.mjs'], {
    PHOS_SKIP_CONFIG_SYNC: '1', PHOTOS_SOURCE: source,
    DB_PATH: join(ROOT, 'no-database.db'), PHOTOS_CACHE_PATH: join(ROOT, 'empty-photo-cache.json'),
  })
  for (const [index, path] of paths.entries()) {
    assert.deepEqual(await readFile(path), bootstrapped[index], path + ': exact generator serialization')
  }
})

test('write-active-theme leaves existing photo manifest bytes and mtimes untouched', async t => {
  const { ROOT, node } = await sandbox(t)
  await themeInputs(ROOT)
  await mkdir(join(ROOT, 'src/generated'), { recursive: true })
  const manifests = [
    ['categories', '{ "categories": [{ "slug": "kept" }], "heroPriority": [] }\n'],
    ['galleries', '{ "galleries": [{ "slug": "kept" }] }\n'],
  ]
  for (const [name, bytes] of manifests) {
    const path = join(ROOT, 'src/generated', name + '.json')
    await writeFile(path, bytes)
    await utimes(path, new Date('2001-01-01'), new Date('2001-01-01'))
  }
  const before = await Promise.all(manifests.map(([name]) => stat(join(ROOT, 'src/generated', name + '.json'))))
  node(['scripts/write-active-theme.mjs'])
  for (const [index, [name, bytes]] of manifests.entries()) {
    const path = join(ROOT, 'src/generated', name + '.json')
    assert.equal(await readFile(path, 'utf8'), bytes, name + ': preserve noncanonical bytes')
    assert.equal((await stat(path)).mtimeMs, before[index].mtimeMs, name + ': no rewrite')
  }
})

test('write-active-theme create-only bootstraps preserve files that appear after the missing check', async t => {
  const { ROOT, node, json } = await sandbox(t)
  await themeInputs(ROOT)
  await mkdir(join(ROOT, 'src/generated'), { recursive: true })
  const owner = await json('src/content/site-config.json')
  owner.site.title = 'OWNER SAVED DURING BOOTSTRAP'
  const existing = new Map([
    ['site-config.json', JSON.stringify(owner, null, 4) + '\n'],
    ['plugins.mjs', 'export const plugins = ["owner-plugin"]\nexport const components = {}\n'],
    ['categories.json', '{ "categories": [{ "slug": "owner" }], "heroPriority": [] }\n'],
    ['galleries.json', '{ "galleries": [{ "slug": "owner" }] }\n'],
  ])
  const before = new Map()
  for (const [name, bytes] of existing) {
    const path = join(ROOT, 'src/generated', name)
    await writeFile(path, bytes)
    await utimes(path, new Date('2001-01-01'), new Date('2001-01-01'))
    before.set(name, (await stat(path)).mtimeMs)
  }
  // Inject a stale existsSync result only in the sandbox copy. The actual writes
  // must still use create-only semantics when another writer wins that race.
  const scriptPath = join(ROOT, 'scripts/write-active-theme.mjs')
  const script = await readFile(scriptPath, 'utf8')
  assert.match(script, /\bexistsSync\s*[,}]/, 'the bootstrap checks file existence')
  const staleChecks = `
const pretendMissing = new Set(${JSON.stringify([...existing.keys()])}.map(name => new URL('../src/generated/' + name, import.meta.url).href))
const existsSync = path => {
  if (path instanceof URL && pretendMissing.delete(path.href)) return false
  return actualExistsSync(path)
}
`
  assert.match(script, /\bconst allThemesUrl\b/, 'injection precedes the first existence check')
  await writeFile(scriptPath, script.replace(/\bexistsSync(?=\s*[,}])/, 'existsSync as actualExistsSync')
    .replace(/(?=const allThemesUrl\b)/, () => staleChecks))
  node(['scripts/write-active-theme.mjs'])
  for (const [name, bytes] of existing) {
    const path = join(ROOT, 'src/generated', name)
    assert.equal(await readFile(path, 'utf8'), bytes, name + ': non-empty owner bytes survive the missing branch')
    assert.equal((await stat(path)).mtimeMs, before.get(name), name + ': untouched mtime')
  }
  assert.equal((await json('public/site-config.json')).site.title, owner.site.title, 'public copy uses the winning owner config')
})

test('write-active-theme preserves owner values, fills new defaults and does not rewrite unchanged config', async t => {
  const { ROOT, node, json } = await sandbox(t)
  await themeInputs(ROOT)
  const defaults = await json('src/content/site-config.json')
  defaults.site.defaultOnly = 'new default'
  await writeFile(join(ROOT, 'src/content/site-config.json'), JSON.stringify(defaults, null, 4))
  const beforeDefaults = await readFile(join(ROOT, 'src/content/site-config.json'))
  const owner = {
    site: { title: 'OWNER TITLE', description: 'Owner description', theme: 'theme-nord', obsolete: 'drop me' },
    contact: { heading: 'Write to me', smtp: { user: 'owner-user', pass: 'owner-secret', port: 2525 } },
    unknownTopLevel: { private: true },
  }
  await mkdir(join(ROOT, 'src/generated'), { recursive: true })
  const generated = join(ROOT, 'src/generated/site-config.json')
  await writeFile(generated, JSON.stringify(owner))
  await writeFile(join(ROOT, 'src/generated/plugins.mjs'), 'export const plugins = ["keep discovered manifest"]\n')
  const firstRun = node(['scripts/write-active-theme.mjs'])
  assert.doesNotMatch(firstRun.stderr, /SMTP credentials/, 'owner credentials in generated config do not implicate clean tracked defaults')
  const result = await json('src/generated/site-config.json')
  assert.deepEqual(result, deepMerge(defaults, owner, { skipUnknownKeys: true }))
  assert.equal(result.site.title, 'OWNER TITLE')
  assert.equal(result.site.defaultOnly, 'new default')
  for (const copy of ['src/generated/site-config.public.json', 'public/site-config.json']) {
    assert.equal(await readFile(join(ROOT, copy), 'utf8'), publicConfigJson(result), copy)
  }
  assert.deepEqual(await readFile(join(ROOT, 'src/content/site-config.json')), beforeDefaults)
  assert.equal(await readFile(join(ROOT, 'src/generated/plugins.mjs'), 'utf8'), 'export const plugins = ["keep discovered manifest"]\n')
  const bytes = await readFile(generated)
  // Pin a clearly old mtime: a rewrite cannot accidentally pass on coarse file clocks.
  await utimes(generated, new Date('2001-01-01'), new Date('2001-01-01'))
  const before = await stat(generated)
  node(['scripts/write-active-theme.mjs'])
  assert.deepEqual(await readFile(generated), bytes)
  assert.equal((await stat(generated)).mtimeMs, before.mtimeMs)
})

test('write-active-theme warns for an SMTP user in tracked defaults even without a password', async t => {
  const { ROOT, node, json } = await sandbox(t)
  await themeInputs(ROOT)
  const defaults = await json('src/content/site-config.json')
  defaults.contact.smtp.user = 'private-default-user'
  await writeFile(join(ROOT, 'src/content/site-config.json'), JSON.stringify(defaults))
  const result = node(['scripts/write-active-theme.mjs'])
  assert.match(result.stderr, /src\/content\/site-config\.json[^\n]*SMTP credentials/)
  assert.ok(!result.stderr.includes(defaults.contact.smtp.user))
})

test('admin config GET and PUT use no-store and refresh normalized generated config atomically', { timeout: 5000 }, async t => {
  const { ROOT, env, db, json } = await sandbox(t)
  await mkdir(join(ROOT, 'admin'))
  await cp(join(repoRoot, 'admin/server.mjs'), join(ROOT, 'admin/server.mjs'))
  await mkdir(join(ROOT, 'src/generated'), { recursive: true })
  const generated = join(ROOT, 'src/generated/site-config.json')
  await writeFile(generated, '{"site":{"title":"stale"}}')
  const before = await stat(generated)
  // Reserve an OS-selected free port; wait on the server's ready log, never sleeps.
  const reservation = createServer()
  await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve) })
  const port = reservation.address().port
  await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()))
  const password = 'sandbox-admin-password'
  const child = spawn(process.execPath, ['admin/server.mjs'], {
    cwd: ROOT, env: { ...env, ADMIN_PORT: String(port), ADMIN_PASSWORD: password, PUBLIC_SITE_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stderr.on('data', chunk => { output += chunk })
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('admin startup timed out: ' + output)), 2000)
      const cleanup = () => { clearTimeout(timer); child.off('exit', exited); child.off('error', failed); child.stdout.off('data', ready) }
      const exited = code => { cleanup(); reject(new Error('admin exited before ready: ' + code + ' ' + output)) }
      const failed = error => { cleanup(); reject(error) }
      const ready = chunk => { output += chunk; if (output.includes('admin server listening')) { cleanup(); resolve() } }
      child.once('exit', exited); child.once('error', failed); child.stdout.on('data', ready)
    })
    const request = (path, options = {}) => fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(2000), ...options })
    const login = await request('/api/login', { method: 'POST', body: JSON.stringify({ password }) })
    assert.equal(login.status, 200)
    const { token } = await login.json()
    const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
    const get = await request('/api/config', { headers })
    assert.equal(get.status, 200)
    assert.equal(get.headers.get('cache-control'), 'no-store')
    await get.json()
    const put = await request('/api/config', { method: 'PUT', headers, body: JSON.stringify({
      site: { title: 'Saved in admin', removedKey: 'must not reach build input' },
      contact: { smtp: { port: 2525, user: 'owner-user', pass: 'owner-password' } },
    }) })
    assert.equal(put.status, 200)
    assert.equal(put.headers.get('cache-control'), 'no-store')
    await put.json()
    const assembled = JSON.parse(db('console.log(JSON.stringify(db.assembleConfig()))').stdout)
    const expected = deepMerge(await json('src/content/site-config.json'), assembled, { skipUnknownKeys: true })
    assert.equal(expected.site.title, 'Saved in admin')
    assert.deepEqual(await json('src/generated/site-config.json'), expected)
    assert.notEqual((await stat(generated)).ino, before.ino, 'rename replaces the old file rather than writing through it')
    assert.deepEqual((await readdir(join(ROOT, 'src/generated'))).filter(name => name.endsWith('.tmp')), [])
    assert.equal(await readFile(join(ROOT, 'public/site-config.json'), 'utf8'), publicConfigJson(expected))
    await t.test('immersive PUT validation skips absent galleries and preserves unchanged over-limit stored copy', async () => {
      const text = 'legacy '.repeat(41)
      assert.ok(text.length > 280)
      db(`db.writeFullConfig({ home: { immersiveGallery: { enabled: true, text: ${JSON.stringify(text)}, intensity: 'invalid-legacy-feel' } } })`)
      const save = async body => {
        const response = await request('/api/config', { method: 'PUT', headers, body: JSON.stringify(body) })
        return { status: response.status, body: await response.json() }
      }
      assert.equal((await save({ site: { title: 'Unrelated edit' }, home: { cta: { enabled: false } } })).status, 200, 'PUT without home.immersiveGallery skips an invalid stored gallery')
      assert.equal((await save({ home: { immersiveGallery: { text, intensity: 'balanced' } } })).status, 200, 'unchanged legacy tagline passes both body and merged validation')
      assert.equal((await save({ home: { immersiveGallery: { atmosphere: 'none' } } })).status, 200, 'omitted tagline survives merged validation')
      const changed = await save({ home: { immersiveGallery: { text: text + 'changed' } } })
      assert.equal(changed.status, 400)
      assert.match(changed.body.error, /home\.immersiveGallery\.text/)
      assert.equal(JSON.parse(db('console.log(JSON.stringify(db.assembleConfig()))').stdout).home.immersiveGallery.text, text, 'failed PUT does not write the changed copy')
    })
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const stopped = once(child, 'close')
      child.kill('SIGKILL')
      await stopped
    }
  }
})

test('migrate-config stamps migrated_at once and is a no-op on the second run', async t => {
  const { ROOT, node, db } = await sandbox(t)
  await writeFile(join(ROOT, 'config/site-config.json'), JSON.stringify({ site: { title: 'FIRST OWNER TITLE' } }))
  node(['scripts/migrate-config.mjs'])
  const state = () => JSON.parse(db(`console.log(JSON.stringify({ migratedAt: db.getMeta('migrated_at'), config: db.assembleConfig() }))`).stdout)
  const before = state()
  assert.ok(before.migratedAt, 'first migration stamps migrated_at')
  assert.equal(before.config.site.title, 'FIRST OWNER TITLE')
  await writeFile(join(ROOT, 'config/site-config.json'), JSON.stringify({ site: { title: 'MUST NOT REIMPORT' } }))
  const dbBytes = await readFile(join(ROOT, 'config/site.db'))
  node(['scripts/migrate-config.mjs'])
  assert.deepEqual(await readFile(join(ROOT, 'config/site.db')), dbBytes, 'second migration leaves SQLite bytes untouched')
  assert.deepEqual(state(), before, 'stamp and owner configuration are unchanged')
})

test('migrate-config PHOS_SKIP_CONFIG_SYNC=1 never opens or creates SQLite', async t => {
  const { ROOT, node } = await sandbox(t)
  await rm(join(ROOT, 'config'), { recursive: true })
  const before = await readFile(join(ROOT, 'src/content/site-config.json'))
  node(['scripts/migrate-config.mjs'], { PHOS_SKIP_CONFIG_SYNC: '1' })
  assert.ok(!existsSync(join(ROOT, 'config/site.db')))
  assert.ok(!existsSync(join(ROOT, 'config')), 'skip does not even create the database directory')
  assert.deepEqual(await readFile(join(ROOT, 'src/content/site-config.json')), before)
})
