import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import ts from 'typescript'
import { repoRoot } from './helpers/bundle.mjs'

const read = path => readFile(join(repoRoot, path), 'utf8')
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText
function find(node, predicate) {
  if (predicate(node)) return node
  return ts.forEachChild(node, child => find(child, predicate))
}
function islandProps(page) {
  const start = page.indexOf('<ImmersiveScrollGallery')
  const close = '</ImmersiveScrollGallery>'
  const end = page.indexOf(close, start)
  const tag = start < 0 ? null : end < 0
    ? page.slice(start).match(/^<ImmersiveScrollGallery\b[\s\S]*?\/>/)?.[0]
    : page.slice(start, end + close.length)
  assert.ok(tag, 'home renders the immersive gallery')
  const ast = ts.createSourceFile('island.tsx', tag, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const island = find(ast, node => (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node))
    && node.tagName.getText(ast) === 'ImmersiveScrollGallery')
  assert.ok(island, 'gallery opening tag parses')
  return { tag, props: new Map(island.attributes.properties.filter(ts.isJsxAttribute).map(attribute =>
    [attribute.name.getText(ast), attribute.initializer?.expression?.getText(ast)])) }
}

test('home immersive gallery uses only client:only="preact"', async () => {
  const { tag } = islandProps(await read('src/pages/index.astro'))
  assert.match(tag, /\bclient:only=['"]preact['"]/)
  assert.deepEqual([...tag.matchAll(/\b(client:[\w-]+)/g)].map(([, name]) => name), ['client:only'])
})

test('reduced-motion immersive images omit unresolved sources', async () => {
  const component = await read('src/components/ui/immersive-scroll-gallery.tsx')
  const ast = ts.createSourceFile('gallery.tsx', component, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const gallery = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'ImmersiveScrollGallery')
  const photoPath = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'photoPath')
  assert.ok(gallery && photoPath)
  const evaluate = new Function('React', 'useMediaQuery', compile(`
    ${photoPath.getText(ast)}
    ${gallery.getText(ast).replace(/export\s+default\s+/, '')}
    return ImmersiveScrollGallery
  `))
  const React = { createElement: (type, props, ...children) => ({ type, props, children }) }
  const render = evaluate(React, () => true)
  const sources = { 'matrix/a.jpg': { thumb: '/photos/thumbs/matrix/a.webp', immersive: '/photos/w1600/matrix/a.webp', immersiveMobile: '/photos/immersive-mobile/matrix/a.webp' } }
  const result = render({ desktopPhotos: ['missing.jpg', 'matrix/a.jpg', 'also-missing.jpg'], sources })
  const images = []
  function scan(value) {
    if (Array.isArray(value)) value.forEach(scan)
    else if (value && typeof value === 'object') {
      if (value.type === 'img') images.push(value.props.src)
      value.children?.forEach(scan)
    }
  }
  scan(result)
  assert.deepEqual(images, [sources['matrix/a.jpg'].thumb])
})

test('home sources and positions follow filtered manifest photo lists', async () => {
  const page = await read('src/pages/index.astro')
  const { props } = islandProps(page)
  const fields = ['sources', 'desktopPhotos', 'desktopPositions', 'mobilePhotos', 'mobilePositions']
  for (const field of fields) assert.ok(props.get(field), 'island receives ' + field)
  const frontmatter = page.match(/^---\s*\n([\s\S]*?)\n---/)?.[1]
  assert.ok(frontmatter)
  assert.match(frontmatter + props.get('sources'), /\bphotoByKey\.get\(/, 'sources resolve manifest photos')
  // Execute the current frontmatter and actual prop expressions with synthetic
  // manifest/config data, including holes before and between valid photos.
  const code = frontmatter.replace(/^import\s+.*$/gm, '')
    .replace(/import\(['"]@lib\/galleries['"]\)/g, 'Promise.resolve({ default: { galleries: [] } })')
    .replace(/import\.meta\.env\.PUBLIC_SITE_URL/g, "'https://phos.test'")
  const evaluate = new Function('manifest', 'config', compile(`return (async () => {
    ${code}
    return { ${fields.map(field => field + ': (' + props.get(field) + ')').join(',\n')} }
  })()`))
  const photos = ['small photo.jpg', 'tiny.png'].map((filename, index) => ({
    filename, thumb: `/photos/thumbs/matrix/${encodeURIComponent(filename)}.webp`,
    immersive: `/photos/${index ? 'immersive-mobile' : 'w1600'}/matrix/${encodeURIComponent(filename)}.webp`,
    immersiveMobile: `/photos/immersive-mobile/matrix/${encodeURIComponent(filename)}.webp`,
  }))
  const manifest = { categories: [{ slug: 'matrix', order: 0, photos }], heroPriority: [] }
  const defaults = JSON.parse(await read('src/content/site-config.json'))
  const keys = photos.map(photo => 'matrix/' + photo.filename)
  const desktopPositions = [0, 1, 2, 3].map(x => ({ x, y: 10, w: 20, h: 30, z: 1 }))
  const mobilePositions = [4, 5, 6].map(x => ({ x, y: 20, w: 30, h: 40, z: 2 }))
  defaults.home.immersiveGallery = {
    enabled: true, desktopPhotos: ['missing/before.jpg', keys[0], 'missing/middle.jpg', keys[1]],
    desktopPositions, mobilePhotos: [keys[1], 'missing/mobile.jpg', keys[0]], mobilePositions,
  }
  const result = await evaluate(manifest, defaults)
  assert.deepEqual(result.desktopPhotos, keys)
  assert.deepEqual(result.mobilePhotos, [...keys].reverse())
  assert.deepEqual(result.desktopPositions, [desktopPositions[1], desktopPositions[3]], 'desktop positions remain parallel')
  assert.deepEqual(result.mobilePositions, [mobilePositions[0], mobilePositions[2]], 'mobile positions remain parallel')
  assert.deepEqual(result.sources, Object.fromEntries(photos.map((photo, index) => [keys[index], {
    thumb: photo.thumb, immersive: photo.immersive, immersiveMobile: photo.immersiveMobile,
  }])), 'only filtered photos supply manifest URLs')
  defaults.home.immersiveGallery.desktopPositions = null
  defaults.home.immersiveGallery.mobilePositions = null
  const noPositions = await evaluate(manifest, defaults)
  assert.equal(noPositions.desktopPositions, null, 'null retains the default desktop layout')
  assert.equal(noPositions.mobilePositions, null, 'null retains the default mobile layout')
})

test('immersive island omits missing sources, uses manifest URLs and memoizes sources', async () => {
  const component = await read('src/components/ui/immersive-scroll-gallery.tsx')
  const ast = ts.createSourceFile('gallery.tsx', component, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  // Inspect literals, so explanatory comments about old paths are harmless.
  const constructedPaths = []
  function scan(node) {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) && /\/photos\//.test(node.getText(ast))) constructedPaths.push(node.getText(ast))
    ts.forEachChild(node, scan)
  }
  scan(ast)
  assert.deepEqual(constructedPaths, [], 'island builds no hard-coded photo variant paths')
  assert.match(component, /<AnimatedGallery\b[^>]*\bsources=\{sources\}/)
  const pictures = find(ast, node => ts.isVariableDeclaration(node) && node.name.getText(ast) === 'pictures')
  assert.ok(pictures && ts.isCallExpression(pictures.initializer), 'pictures are memoized')
  const dependencies = pictures.initializer.arguments[1]
  assert.ok(dependencies && ts.isArrayLiteralExpression(dependencies))
  assert.ok(dependencies.elements.some(node => node.getText(ast) === 'sources'), 'sources invalidate the memo')
  const helpers = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'photoPath')
    .map(node => node.getText(ast)).join('\n')
  const styles = find(ast, node => ts.isVariableDeclaration(node) && node.name.getText(ast) === 'IMAGE_STYLES')
  assert.ok(styles, 'default image positions exist')
  const evaluate = new Function('React', 'photos', 'sources', 'positions', 'isDesktop', 'imageVariant', compile(`
    ${helpers}
    const IMAGE_STYLES = ${styles.initializer.getText(ast)}
    return ${pictures.initializer.getText(ast)}
  `))
  const sources = {
    'matrix/a.jpg': { thumb: '/photos/thumbs/matrix/a.webp', immersive: '/photos/w1600/matrix/a.webp', immersiveMobile: '/photos/immersive-mobile/matrix/a.webp' },
  }
  const React = { useMemo: callback => callback() }
  const positions = [{ x: 10 }, { x: 20 }, { x: 30 }]
  for (const variant of ['immersive', 'immersive-mobile']) {
    const result = evaluate(React, ['missing.jpg', 'matrix/a.jpg', 'also-missing.jpg'], sources, positions, true, variant)
    assert.equal(result.length, 1, 'unresolved entries produce no image')
    assert.equal(result[0].thumb, sources['matrix/a.jpg'].thumb)
    assert.equal(result[0].src, sources['matrix/a.jpg'][variant === 'immersive' ? 'immersive' : 'immersiveMobile'])
    assert.deepEqual(result[0].pos, positions[1], 'omission preserves the matching position')
  }
})
