import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { bundle, repoRoot } from './bundle.mjs'
import { join } from 'node:path'

export const read = path => readFile(join(repoRoot, path), 'utf8')
export async function frontmatter(path, scope, result) {
  const source = await read(path)
  let code = source.match(/^---\s*\n([\s\S]*?)\n---/)?.[1]
  assert.ok(code, path + ' frontmatter')
  const ast = ts.createSourceFile(path + '.ts', code, ts.ScriptTarget.Latest, true)
  for (const statement of [...ast.statements].reverse()) if (ts.isImportDeclaration(statement)) code = code.slice(0, statement.getStart(ast)) + code.slice(statement.end)
  code = code.replace(/import\(['"]@lib\/galleries['"]\)/g, 'Promise.resolve({ default: { galleries: [] } })')
    .replace(/import\.meta\.env\.PUBLIC_SITE_URL/g, "'https://phos.test'")
  const js = ts.transpileModule(`return (async () => { ${code}; return { ${result} } })()`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText
  return new Function(...Object.keys(scope), js)(...Object.values(scope))
}
export const home = (manifest, config) => frontmatter('src/pages/index.astro', { manifest, config },
  'desktopPhotos, desktopPositions, mobilePhotos, mobilePositions, selected, layout, visibleLayout, immersiveText')
export const scene = async props => frontmatter('src/components/ImmersiveGallery.astro', {
  ...await bundle('src/lib/immersive-motion.ts'), Astro: { props },
}, 'scenes, keyframes, travel, strength, text')
