import { cleanupWorlds } from './world.mjs'

// All browser globals used by these fixtures. Restore descriptors, including absence.
const browserGlobals = [
  'window',
  'document',
  'location',
  'history',
  'Element',
  'HTMLElement',
  'HTMLImageElement',
  'HTMLDialogElement',
  'Image',
  'MutationObserver',
  'setTimeout',
  'clearTimeout',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
  'performance'
]

/** Register serial cases; each file runs in its own node:test worker process. */
export function scenarios(test, before = () => {}) {
  return (name, run) =>
    test(name, { concurrency: false }, async () => {
      const saved = new Map(
        browserGlobals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
      )
      try {
        await Promise.resolve(before())
        await run()
      } finally {
        try {
          await cleanupWorlds()
        } finally {
          for (const [key, descriptor] of saved) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor)
            else delete globalThis[key]
          }
        }
      }
    })
}
