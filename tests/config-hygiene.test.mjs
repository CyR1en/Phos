import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { repoRoot } from './helpers/bundle.mjs'

// Read-only Git calls are part of this contract: ignore rules alone cannot detect
// generated files that were committed before the rules were added.
function gitResult(args) {
  return spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', timeout: 5000 })
}
function git(args) {
  const result = gitResult(args)
  assert.equal(result.status, 0, result.stderr)
  return result.stdout
}
function inWorkTree(t) {
  const result = gitResult(['rev-parse', '--is-inside-work-tree'])
  if (result.status === 0 && result.stdout.trim() === 'true') return true
  t.skip('Git hygiene requires a Git work tree; archive/export checkout has no index or HEAD to inspect')
  return false
}

test('repository tracks defaults and no generated or public build config', t => {
  if (!inWorkTree(t)) return
  const tracked = git(['ls-files', '-z', '--', 'src/content/site-config.json', 'public/site-config.json', 'src/generated/']).split('\0').filter(Boolean)
  assert.deepEqual(tracked, ['src/content/site-config.json'])
})

test('tracked defaults carry no owner data and keep their canonical serialization', async () => {
  // A content assertion: an intentional edit to the defaults stays legal, while an owner-config
  // sync (credentials, non-canonical bytes) written into the tracked file fails the gate.
  const raw = await readFile(join(repoRoot, 'src/content/site-config.json'), 'utf8')
  const defaults = JSON.parse(raw)
  for (const key of ['host', 'user', 'pass', 'fromEmail', 'toEmail']) {
    assert.equal(defaults.contact?.smtp?.[key] ?? '', '', 'defaults must not carry contact.smtp.' + key)
  }
  assert.equal(raw.replace(/\n$/, ''), JSON.stringify(defaults, null, 2), 'defaults keep the canonical two-space serialization')
})

test('Git effectively ignores public and generated config even with negations or tracked files', t => {
  if (!inWorkTree(t)) return
  for (const path of ['public/site-config.json', 'src/generated/site-config.json']) {
    const result = gitResult(['check-ignore', '-q', '--no-index', '--', path])
    assert.equal(result.status, 0, path + ' must be ignored: ' + result.stderr)
  }
})

test('git and Docker ignore local config and generated build inputs', async () => {
  const entries = async file => (await readFile(join(repoRoot, file), 'utf8')).split(/\r?\n/)
    .map(line => line.replace(/\s+#.*$/, '').trim().replace(/^\//, '')).filter(line => line && !line.startsWith('#'))
  const ignored = await entries('.gitignore')
  for (const path of ['src/generated/', 'public/site-config.json']) assert.ok(ignored.includes(path), '.gitignore: ' + path)
  const docker = await entries('.dockerignore')
  assert.deepEqual(docker.filter(line => line.startsWith('!')), [], '.dockerignore must not re-include private/generated files through negation')
  for (const path of ['config/', 'src/generated/', 'public/site-config.json', 'tests/', 'AppData/', '.env.*']) assert.ok(docker.includes(path), '.dockerignore: ' + path)
})

test('dev, build and generate migrate config before content generation', async () => {
  const { scripts } = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'))
  for (const name of ['dev', 'build', 'generate']) {
    assert.match(scripts[name], /\bnode scripts\/migrate-config\.mjs\b/, name)
    assert.ok(scripts[name].indexOf('scripts/migrate-config.mjs') < scripts[name].indexOf('scripts/generate-content.mjs'), name + ': migrate before generate')
  }
})
