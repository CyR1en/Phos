import { randomUUID } from 'node:crypto'
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Keep the temporary file beside its destination so readers see a complete old or new file.
export function atomicWriteFileSync(destination, content, { attempts = 5, retryDelayMs = 50, rename = renameSync } = {}) {
  const path = destination instanceof URL ? fileURLToPath(destination) : destination
  const directory = dirname(path)
  mkdirSync(directory, { recursive: true })
  const temporary = join(directory, `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`)
  try {
    writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' })
    for (let attempt = 1; ; attempt++) {
      try {
        rename(temporary, path)
        break
      } catch (error) {
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= attempts) throw error
        // Windows readers can briefly hold the destination open during replacement.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, retryDelayMs)
      }
    }
  } finally {
    rmSync(temporary, { force: true })
  }
}
