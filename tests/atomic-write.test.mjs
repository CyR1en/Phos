import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renameSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { atomicWriteFileSync } from '../lib/atomic-write.mjs'

async function destination(t) {
  const root = await mkdtemp(join(tmpdir(), 'phos-atomic-write-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'config.json')
  await writeFile(path, 'previous content')
  return { root, path }
}

for (const code of ['EPERM', 'EBUSY', 'EACCES']) {
  test('atomic write retries ' + code + ' twice before a successful rename', async t => {
    const { root, path } = await destination(t)
    const sources = []
    const started = performance.now()
    atomicWriteFileSync(path, 'replacement content', {
      attempts: 3, retryDelayMs: 25,
      rename(source, target) {
        sources.push(source)
        assert.equal(target, path)
        if (sources.length <= 2) throw Object.assign(new Error('temporarily locked'), { code })
        renameSync(source, target)
      },
    })
    assert.ok(performance.now() - started >= 50, 'both retries honor the 25ms delay')
    assert.equal(sources.length, 3)
    assert.equal(new Set(sources).size, 1, 'the same temporary file is retried')
    assert.equal(await readFile(path, 'utf8'), 'replacement content')
    assert.deepEqual(await readdir(root), ['config.json'], 'no temporary file remains after success')
  })

  test('atomic write exhausts ' + code + ' attempts, rethrows the last error and removes its temp', async t => {
    const { root, path } = await destination(t)
    const errors = []
    assert.throws(() => atomicWriteFileSync(path, 'replacement content', {
      attempts: 3, retryDelayMs: 1,
      rename() {
        const error = Object.assign(new Error('locked attempt ' + (errors.length + 1)), { code })
        errors.push(error)
        throw error
      },
    }), error => error === errors.at(-1))
    assert.equal(errors.length, 3, 'attempts bounds the total rename calls')
    assert.equal(await readFile(path, 'utf8'), 'previous content', 'failed replacement preserves the destination')
    assert.deepEqual(await readdir(root), ['config.json'], 'failure removes the temporary file')
  })
}

test('atomic write defaults to five rename attempts', async t => {
  const { root, path } = await destination(t)
  const error = Object.assign(new Error('busy'), { code: 'EBUSY' })
  let calls = 0
  assert.throws(() => atomicWriteFileSync(path, 'replacement content', {
    retryDelayMs: 1,
    rename() { calls++; throw error },
  }), caught => caught === error)
  assert.equal(calls, 5)
  assert.deepEqual(await readdir(root), ['config.json'])
})

test('atomic write does not retry other rename errors and cleans up a new destination', async t => {
  const { root, path } = await destination(t)
  await rm(path)
  const error = Object.assign(new Error('not a transient error'), { code: 'ENOENT' })
  let calls = 0
  assert.throws(() => atomicWriteFileSync(path, 'replacement content', {
    attempts: 5, retryDelayMs: 1,
    rename() { calls++; throw error },
  }), caught => caught === error)
  assert.equal(calls, 1)
  assert.deepEqual(await readdir(root), [], 'neither a destination nor a temp is left behind')
})
