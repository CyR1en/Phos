import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { repoRoot } from './helpers/bundle.mjs'
import { moduleSpecifiers, contentManifestImports } from './helpers/source-contracts.mjs'

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

test('Git tracks neither generated photo manifest under src/content', t => {
  if (!inWorkTree(t)) return
  assert.equal(git(['ls-files', '--', 'src/content/categories.json', 'src/content/galleries.json']), '')
})

test('photo manifest consumers import src/generated and no source imports a content manifest', async () => {
  for (const [path, manifest] of [
    ['src/lib/categories.ts', 'categories'],
    ['src/lib/galleries.ts', 'galleries'],
    ['src/components/admin/fields/HeroPhotosField.tsx', 'categories'],
    ['src/components/admin/fields/ImmersiveLayoutEditor.tsx', 'categories'],
  ]) {
    const imports = moduleSpecifiers(await readFile(join(repoRoot, path), 'utf8'))
    assert.ok(imports.some(specifier => new RegExp('^(?:\\.\\./)+generated/' + manifest + '\\.json$').test(specifier)), path + ': generated manifest import')
  }
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await scan(path)
      else if (/\.(?:astro|[cm]?[jt]sx?)$/.test(entry.name)) {
        const obsolete = contentManifestImports(await readFile(path, 'utf8'))
        assert.deepEqual(obsolete, [], path + ': no src/content photo manifest imports')
      }
    }
  }
  await scan(join(repoRoot, 'src'))
})

test('content manifest guard recognizes direct, dynamic, glob and @content imports in Astro and TypeScript', () => {
  for (const extension of ['astro', 'ts', 'tsx']) {
    for (const path of ['../content/categories.json', '../content/galleries.json', '@content/categories.json', '@content/galleries.json']) {
      for (const statement of [
        `import manifest from '${path}'`,
        `const manifest = import('${path}')`,
        `const manifest = import.meta.glob('${path}')`,
      ]) {
        const source = extension === 'astro' ? `---\n${statement}\n---\n<main />` : statement
        assert.deepEqual(contentManifestImports(source), [path], extension + ': ' + statement)
      }
    }
  }
  assert.deepEqual(contentManifestImports("import categories from '../generated/categories.json'"), [])
})

test('generator imports atomic writes for both generated photo manifests', async () => {
  const source = await readFile(join(repoRoot, 'scripts/generate-content.mjs'), 'utf8')
  assert.ok(moduleSpecifiers(source).includes('../lib/atomic-write.mjs'), 'shared atomic writer import')
  for (const constant of ['MANIFEST_PATH', 'GALLERIES_MANIFEST_PATH']) {
    assert.doesNotMatch(source, new RegExp('\\bwriteFile(?:Sync)?\\s*\\(\\s*' + constant + '\\b'), constant + ': no plain write')
    assert.match(source, new RegExp('\\batomicWriteFileSync\\s*\\(\\s*' + constant + '\\b'), constant + ': atomic replacement')
  }
})

test('manifest photo types keep heroSrc hero-only and declare mobile hero thumbnails', async () => {
  const source = await readFile(join(repoRoot, 'src/lib/admin/types.ts'), 'utf8')
  const photo = source.match(/export\s+interface\s+ManifestPhoto\s*\{([\s\S]*?)\n\}/)?.[1]
  const hero = source.match(/export\s+interface\s+HeroPriorityPhoto\s*\{([\s\S]*?)\n\}/)?.[1]
  assert.ok(photo && hero, 'both build-time interfaces exist')
  assert.doesNotMatch(photo, /\bheroSrc\s*[?:]/)
  assert.match(hero, /\bthumbMobile\s*:\s*string\b/)
})

test('Astro and TypeScript expose no @content alias', async () => {
  for (const path of ['astro.config.mjs', 'tsconfig.json']) {
    const source = await readFile(join(repoRoot, path), 'utf8')
    assert.doesNotMatch(source, /['"]@content(?:\/\*)?['"]\s*:/, path)
  }
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
  for (const path of ['public/site-config.json', 'src/generated/site-config.json', 'src/generated/categories.json', 'src/generated/galleries.json']) {
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
