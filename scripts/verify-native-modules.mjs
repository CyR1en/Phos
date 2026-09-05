import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { transformSync } from 'esbuild'
import sharp from 'sharp'

const db = new Database(':memory:')
try {
  db.exec('CREATE TABLE smoke (value TEXT NOT NULL)')
  db.prepare('INSERT INTO smoke (value) VALUES (?)').run('native modules ready')
  assert.equal(db.prepare('SELECT value FROM smoke').get().value, 'native modules ready')
} finally {
  db.close()
}

const photo = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } })
  .webp()
  .toBuffer()
assert.equal((await sharp(photo).metadata()).format, 'webp')

const { code } = transformSync('const answer: number = 42', { loader: 'ts' })
assert.match(code, /const answer = 42/)

console.log('Native module checks passed: SQLite read/write, Sharp WebP, esbuild TypeScript.')
