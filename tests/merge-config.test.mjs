import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, cp, rm, writeFile, readFile, symlink, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { repoRoot } from './helpers/bundle.mjs'
import { publicConfigJson } from '../lib/config-secrets.mjs'

// merge-config decides whether SQLite or the persisted JSON is the owner's configuration.
// Run it in an isolated copy so the real config/ is never touched.
async function sandbox(t) {
  const ROOT = await realpath(await mkdtemp(join(tmpdir(), 'phos-merge-config-')))
  t.after(() => rm(ROOT, { recursive: true, force: true }))
  await mkdir(join(ROOT, 'scripts'), { recursive: true })
  await cp(join(repoRoot, 'scripts/merge-config.mjs'), join(ROOT, 'scripts/merge-config.mjs'))
  await cp(join(repoRoot, 'lib'), join(ROOT, 'lib'), { recursive: true })
  await symlink(join(repoRoot, 'node_modules'), join(ROOT, 'node_modules'), 'dir')
  await mkdir(join(ROOT, 'config'))
  await mkdir(join(ROOT, 'public'))
  const defaults = {
    site: { title: '', description: '', theme: 'theme-gallery', social: [] },
    contact: { heading: 'Contact', smtp: { host: '', port: 587, user: '', pass: '', fromEmail: '', toEmail: '' } },
  }
  await writeFile(join(ROOT, 'defaults.json'), JSON.stringify(defaults, null, 2))
  const env = { ...process.env, DB_PATH: join(ROOT, 'config/site.db') }
  delete env.CONFIG_PATH
  const node = (args, extraEnv = {}) => {
    const result = spawnSync(process.execPath, args, { cwd: ROOT, env: { ...env, ...extraEnv }, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return result
  }
  const merge = (extraEnv) => node(['scripts/merge-config.mjs', 'defaults.json', 'dest.json'], extraEnv)
  const db = (code) => node(['--input-type=module', '-e', `const db = await import('./lib/db.mjs'); ${code}`])
  const json = async (name) => JSON.parse(await readFile(join(ROOT, name), 'utf8'))
  return { ROOT, merge, db, json }
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
