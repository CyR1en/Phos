import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const modules = new Map()
let build
try {
  build = (await import('esbuild')).build
} catch (error) {
  throw new Error('Tests require esbuild; run `npm i -D esbuild`', { cause: error })
}

/** Bundle the current TypeScript source once per entry per test worker. */
export function bundle(entryPath) {
  const entry = resolve(repoRoot, entryPath)
  if (!modules.has(entry)) {
    modules.set(
      entry,
      build({
        absWorkingDir: repoRoot,
        entryPoints: [entry],
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        sourcemap: 'inline'
      }).then((result) => {
        const source = result.outputFiles[0].text
        return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
      })
    )
  }
  return modules.get(entry)
}
