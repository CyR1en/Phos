import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { bundle } from './helpers/bundle.mjs'

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
