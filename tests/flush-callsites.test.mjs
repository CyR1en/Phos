import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { repoRoot } from './helpers/bundle.mjs'

const awaitGate = /\bif\s*\(\s*!\s*\(?\s*await\s+flushSave\(\)\s*\)?\s*\)\s*return\b/
for (const [action, path, gate = awaitGate] of [
  ['republish', 'src/lib/admin/store.tsx'],
  ['Sidebar navigation', 'src/components/admin/Sidebar.tsx'],
  ['layout save', 'src/components/admin/fields/ImmersiveLayoutEditor.tsx'],
  ['category saveAll', 'src/components/admin/pages/CategoriesPage.tsx'],
  ['category switch', 'src/components/admin/pages/CategoriesPage.tsx', /\bflushSave\(\)\.then\(\s*(\w+)\s*=>\s*\{\s*if\s*\(\s*\1\s*\)\s*setSelectedCategory\(/],
  ['sign out', 'src/components/admin/Dashboard.tsx', /\bsignOut\s*=\s*async\s*\(\)\s*=>\s*\{\s*if\s*\(\s*await\s+flushSave\(\)\s*\)\s*setToken\(null\)/],
]) {
  test(action + ' consumes the flushSave boolean before continuing', async () => {
    assert.match(await readFile(join(repoRoot, path), 'utf8'), gate, path)
  })
}

test('flushSave catches mutation failure and returns false', async () => {
  const source = await readFile(join(repoRoot, 'src/lib/admin/store.tsx'), 'utf8')
  const flush = source.match(/const\s+flushSave\s*=\s*async\s*\(\)\s*:\s*Promise<boolean>\s*=>\s*\{([\s\S]*?)\n  \}/)?.[1]
  assert.ok(flush, 'flushSave declares its boolean result')
  assert.match(flush, /\btry\s*\{[\s\S]*?await\s+putConfigMutation\.mutateAsync\(/, 'mutation is inside try')
  assert.match(flush, /\bcatch\s*(?:\([^)]*\))?\s*\{[^}]*\breturn\s+false\b/, 'rejection is a false result')
})

test('save success compares an edit version and refetch preserves dirty edits', async () => {
  const source = await readFile(join(repoRoot, 'src/lib/admin/store.tsx'), 'utf8')
  const version = source.match(/\b(?:const|let)\s+(\w*(?:[Vv]ersion|[Ee]dit)\w*Ref)\s*=\s*useRef(?:<[^>]*>)?\(0\)/)?.[1]
  assert.ok(version, 'an edit counter/version ref exists')
  const mutation = source.match(/const\s+putConfigMutation\s*=\s*useMutation\(\{([\s\S]*?)\n  \}\)/)?.[1]
  assert.ok(mutation, 'config mutation exists')
  const success = mutation.slice(mutation.indexOf('onSuccess:'), mutation.indexOf('onError:'))
  assert.match(success, new RegExp('(?:\\b' + version + '\\.current\\s*[!=]==?\\s*\\w+|\\b\\w+\\s*[!=]==?\\s*' + version + '\\.current)'), 'success compares the saved version to current edits')
  const setValue = source.match(/const\s+setValue\s*=[\s\S]*?(?=\n  const\s+getValue)/)?.[0]
  assert.ok(setValue, 'setValue exists')
  assert.match(setValue, new RegExp('(?:\\+\\+\\s*' + version + '\\.current|' + version + '\\.current\\s*(?:\\+\\+|\\+=\\s*1))'), 'edits increment the version')
  const refetch = source.match(/useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[configQuery\.data\]\)/)?.[1]
  assert.ok(refetch, 'config refetch effect exists')
  assert.match(refetch, /(?:if\s*\([^)]*!dirtyRef\.current[^)]*\)|if\s*\(\s*dirtyRef\.current\s*\)\s*return)/, 'dirty guard precedes config replacement')
  assert.ok(refetch.indexOf('dirtyRef.current') < refetch.indexOf('setConfig('))
})
