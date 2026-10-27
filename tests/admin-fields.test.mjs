import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { bundle } from './helpers/bundle.mjs'
import { moduleSpecifiers } from './helpers/source-contracts.mjs'

// The suite does not mount Preact. Assert the small public TSX contract directly,
// including forwarding both props to the actual input rather than only its type.
test('TextField accepts password and forwards type and autocomplete onto its input', async () => {
  const source = await readFile(new URL('../src/components/admin/fields/TextField.tsx', import.meta.url), 'utf8')
  assert.match(source, /\btype\?\s*:\s*[^\n]+['"]password['"]/)
  assert.match(source, /\bautocomplete\?\s*:\s*string/)
  const input = source.match(/<input\b[\s\S]*?\/>/)?.[0]
  assert.ok(input, 'TextField renders an input')
  assert.match(input, /\btype=\{type\}/)
  assert.match(input, /\bautocomplete=\{autocomplete\}/)
  const rest = source.match(/export function TextField\([\s\S]*?\.\.\.(\w+)\s*\}/)?.[1]
  assert.ok(rest, 'TextField receives native input attributes')
  assert.ok(input.includes('{...' + rest + '}'), 'ignore attributes are forwarded to the actual input')
})

test('ObjectField maps contact.smtp.pass to a password with new-password autocomplete', async () => {
  const source = await readFile(new URL('../src/components/admin/fields/ObjectField.tsx', import.meta.url), 'utf8')
  const passwordBranch = source.match(/if\s*\(fieldPath\s*===\s*['"]contact\.smtp\.pass['"]\)\s*\{([\s\S]*?)\n\s*\}/)?.[1]
  assert.ok(passwordBranch, 'SMTP password has an explicit branch before generic field inference')
  assert.match(passwordBranch, /return\s+<TextField\b/)
  assert.match(passwordBranch, /\bpath=\{fieldPath\}/)
  assert.match(passwordBranch, /\btype=['"]password['"]/)
  assert.match(passwordBranch, /\bautocomplete=['"]new-password['"]/)
  for (const attribute of ['data-1p-ignore', 'data-lpignore', 'data-bwignore', 'data-form-type']) {
    assert.ok(passwordBranch.includes(attribute), 'SMTP password sets ' + attribute)
  }
  assert.match(passwordBranch, /data-lpignore=['"]true['"]/)
  assert.match(passwordBranch, /data-form-type=['"]other['"]/)
  assert.ok(source.indexOf(passwordBranch) < source.indexOf("if (typeof value === 'string')"), 'long passwords do not become a textarea')
})

test('ObjectField gives SMTP ports numeric bounds and both address fields email inputs', async () => {
  const source = await readFile(new URL('../src/components/admin/fields/ObjectField.tsx', import.meta.url), 'utf8')
  const branch = path => source.match(new RegExp('if\\s*\\(fieldPath\\s*===\\s*[\'\"]contact\\.smtp\\.' + path + '[\'\"]\\)\\s*\\{([\\s\\S]*?)\\n\\s*\\}'))?.[1]
  const port = branch('port')
  assert.ok(port, 'SMTP port has an explicit branch')
  assert.match(port, /return\s+<NumberField\b/)
  assert.match(port, /\bpath=\{fieldPath\}/)
  assert.match(port, /\bmin=\{1\}/)
  assert.match(port, /\bmax=\{65535\}/)
  const number = await readFile(new URL('../src/components/admin/fields/NumberField.tsx', import.meta.url), 'utf8')
  const input = number.match(/<input\b[\s\S]*?\/>/)?.[0]
  assert.match(input, /type=['"]number['"]/)
  for (const bound of ['min', 'max']) assert.ok(input.includes(`${bound}={${bound}}`), 'NumberField forwards ' + bound)
  for (const key of ['fromEmail', 'toEmail']) {
    const email = branch(key)
    assert.ok(email, key + ' has an explicit branch')
    assert.match(email, /return\s+<TextField\b/)
    assert.match(email, /\bpath=\{fieldPath\}/)
    assert.match(email, /\btype=['"]email['"]/)
  }
})

test('PluginsPage maps an apiKey field to the password branch before generic string inference', async () => {
  const source = await readFile(new URL('../src/components/admin/pages/PluginsPage.tsx', import.meta.url), 'utf8')
  const { isSecretKey } = await bundle('src/components/admin/secret-keys.ts')
  assert.equal(isSecretKey('apiKey'), true, 'the predicate used by PluginsPage recognizes camel-case API keys')
  assert.match(source, /import\s*\{\s*isSecretKey\s*\}\s*from\s*['"]\.\.\/secret-keys['"]/)
  assert.match(source, /const fieldPath = key/)
  // The secret branch must apply only to string settings: booleans/numbers keep their controls.
  const condition = source.match(/if\s*\(([^\n]*isSecretKey\(fieldPath\)[^\n]*)\)\s*\{/)?.[1]
  assert.ok(condition, 'PluginsPage has a secret-key branch')
  assert.match(condition, /fieldType\s*===\s*['"]string['"]/, 'secret masking is limited to string settings')
  const passwordBranch = source.match(/if\s*\([^\n]*isSecretKey\(fieldPath\)[^\n]*\)\s*\{([\s\S]*?)\n\s*\}/)?.[1]
  assert.ok(passwordBranch, 'secret fields have an explicit branch')
  const input = passwordBranch.match(/<input\b[\s\S]*?\/>/)?.[0]
  assert.ok(input)
  assert.match(input, /type=['"]password['"]/)
  assert.match(input, /autocomplete=['"]new-password['"]/)
  assert.match(input, /value=\{String\(getPluginValue\(name, fieldPath\)/)
  assert.ok(source.indexOf(passwordBranch) < source.indexOf("if (typeof value === 'string')"), 'long secret values never become a textarea')
})

test('PortfolioPage edits portfolio fields and is reachable through the sidebar and dashboard', async () => {
  const source = path => readFile(new URL('../src/components/admin/' + path, import.meta.url), 'utf8')
  const [page, sidebar, dashboard] = await Promise.all([
    source('pages/PortfolioPage.tsx'), source('Sidebar.tsx'), source('Dashboard.tsx'),
  ])
  assert.match(page, /export\s+function\s+PortfolioPage\s*\(/)
  for (const field of ['og_title', 'og_description']) {
    assert.match(page, new RegExp('\\bpath=[\'"]portfolio\\.' + field + '[\'"]'), field + ': bound editor')
  }
  assert.match(sidebar, /\bid\s*:\s*['"]portfolio['"]/)
  assert.ok(moduleSpecifiers(dashboard).includes('./pages/PortfolioPage'), 'dashboard imports the portfolio page, including lazy imports')
  assert.match(dashboard, /case\s+['"]portfolio['"]\s*:\s*return\s+<PortfolioPage\s*\/>/)
})

test('PortfolioPage keeps its description as guidance and exposes only Open Graph inputs', async () => {
  const source = await readFile(new URL('../src/components/admin/pages/PortfolioPage.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /<(?:TextField|TextAreaField|input|textarea)\b[^>]*\b(?:path|name)=['"]portfolio\.page_description['"]/)
  const defaults = JSON.parse(await readFile(new URL('../src/content/site-config.json', import.meta.url), 'utf8'))
  assert.equal(defaults.portfolio.page_description, 'Open Graph title and description for the /galleries/ index.')
})

test('ObjectField skips legacy home.portfolio', async () => {
  const source = await readFile(new URL('../src/components/admin/fields/ObjectField.tsx', import.meta.url), 'utf8')
  assert.match(source, /if\s*\(\s*path\s*===\s*['"]home['"]\s*&&\s*key\s*===\s*['"]portfolio['"]\s*\)\s*return\s+null\b/)
})

test('admin hero and immersive thumbnails encode filenames or use manifest URLs', async () => {
  for (const path of ['fields/immersive/utils.ts', 'fields/HeroPhotosField.tsx']) {
    const source = await readFile(new URL('../src/components/admin/' + path, import.meta.url), 'utf8')
    const templates = [...source.matchAll(/`([^`]*\/photos\/thumbs\/[^`]*)`/g)].map(([, template]) => template)
    for (const template of templates) {
      const filename = template.slice(template.lastIndexOf('${'))
      assert.match(filename, /\bencodeURIComponent\(/, path + ': raw-filename thumbnail: ' + template)
    }
    assert.ok(templates.length || /\.thumb\b/.test(source), path + ': manifest thumbnail or encoded URL')
  }
})

test('flushSave returns a boolean for validation and republish stops when saving is blocked', async () => {
  const source = await readFile(new URL('../src/lib/admin/store.tsx', import.meta.url), 'utf8')
  assert.match(source, /\bflushSave\s*:\s*\(\)\s*=>\s*Promise<boolean>/)
  const flush = source.match(/const\s+flushSave\s*=\s*async\s*\(\)\s*:\s*Promise<boolean>\s*=>\s*\{([\s\S]*?)\n  \}/)?.[1]
  assert.ok(flush, 'flushSave implementation declares its boolean result')
  assert.match(flush, /if\s*\(hasErrors\)\s*\{[^}]*\breturn\s+false\b/)
  assert.match(flush, /\breturn\s+true\b/)
  assert.doesNotMatch(source, /throw\s+new\s+Error\(\s*['"]Validation errors['"]\s*\)/)
  const republish = source.match(/const\s+republish\s*=\s*async\s*\(\)\s*=>\s*\{([\s\S]*?)\n  \}/)?.[1]
  assert.ok(republish, 'republish implementation exists')
  const guard = republish.match(/if\s*\(\s*!\s*await\s+flushSave\(\)\s*\)\s*return\b/)
  assert.ok(guard, 'republish checks the save result and returns on false')
  assert.ok(guard.index < republish.indexOf('api.startRepublish('), 'validation gate precedes publishing')
})
