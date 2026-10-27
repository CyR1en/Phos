import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readFile } from 'node:fs/promises'

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const modules = new Map()
let build
let transform
try {
  const esbuild = await import('esbuild')
  build = esbuild.build
  transform = esbuild.transform
} catch (error) {
  throw new Error('Tests require esbuild; run `npm i -D esbuild`', { cause: error })
}

const astro = new Map()
/** Astro leaves scripts with any attribute except src unprocessed (inline JS).
 * Match self-closing tags separately so an external <script src="…" /> cannot
 * consume the next paired script. src-only external scripts have no body to run.
 */
export function astroScriptBlocks(source) {
  return [...source.matchAll(/<script\b((?:"[^"]*"|'[^']*'|[^'">])*?)(?:\/\s*>|>([\s\S]*?)<\/script\s*>)/gi)]
    .map(([, attrs, code = '']) => {
      const names = [...attrs.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/g)].map(([, name]) => name)
      return { code, inline: names.some(name => name !== 'src') }
    })
}

/** Execute each current Astro script in order; never depend on stale dist chunks. */
export function astroScripts(entryPath, { inline = false } = {}) {
  const key = entryPath + ':' + inline
  if (!astro.has(key)) astro.set(key, (async () => {
    const source = await readFile(resolve(repoRoot, entryPath), 'utf8')
    const blocks = astroScriptBlocks(source).filter(block => block.inline === inline && block.code.trim())
    if (!blocks.length) throw new Error(`No ${inline ? 'inline ' : ''}script blocks in ${entryPath}`)
    return Promise.all(blocks.map(async ({ code }, index) => {
      const sourcefile = `${entryPath}:${index}`
      // Processed Astro scripts can import shared TS modules (for example motion).
      // Bundle from the component directory so the executed script is self-contained.
      const output = inline
        ? (await transform(code, { loader: 'js', target: 'es2022', sourcefile, sourcemap: 'inline' })).code
        : (await build({
          absWorkingDir: repoRoot,
          stdin: { contents: code, loader: 'ts', resolveDir: dirname(resolve(repoRoot, entryPath)), sourcefile },
          bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022', sourcemap: 'inline'
        })).outputFiles[0].text
      return "'use strict';\n" + output
    }))
  })())
  return astro.get(key)
}

/** Bundle the current TypeScript source once per entry per test worker. */
let instance = 0
export function bundle(entryPath, { fresh = false } = {}) {
  const entry = resolve(repoRoot, entryPath)
  const key = fresh ? `${entry}:${++instance}` : entry
  if (!modules.has(key)) {
    modules.set(
      key,
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
        return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${key}`)
      })
    )
  }
  return modules.get(key)
}
