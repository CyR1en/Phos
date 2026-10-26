import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeEnv } from './helpers/dom.mjs'
import { accessibleName, formControlName } from './helpers/accessibility.mjs'
import { nginxBlocks, dockerCopiesFile } from './helpers/nginx.mjs'
import { assertBehaviourMatches, assertFixtureContract } from './helpers/fixture-contracts.mjs'

const dom = html => { const env = makeEnv(); env.parseHTML(html, env.document.body); return env.document.body }
test('accessible-name heuristic excludes aria-hidden text and accepts labelledby and image alt', () => {
  const root = dom('<span id="name">Visible name</span><button id="hidden"><span aria-hidden="true">X</span></button><button id="named" aria-labelledby="name"></button><a href="/"><span aria-hidden="true">X</span><img alt="Home"></a>')
  assert.equal(accessibleName(root.querySelector('#hidden'), root), '')
  assert.equal(accessibleName(root.querySelector('#named'), root), 'Visible name')
  assert.equal(accessibleName(root.querySelector('a'), root), 'Home')
})
test('form-control heuristic requires an explicit label for inputs, selects and textareas', () => {
  const root = dom('<label for="email">Email</label><input id="email"><select aria-label="Category"></select><span id="message-name">Message</span><textarea aria-labelledby="message-name"></textarea><input id="missing">')
  assert.deepEqual(root.querySelectorAll('input, select, textarea').map(el => formControlName(el, root)), ['Email', 'Category', 'Message', ''])
})
test('fixture drift detects added and removed behaviour attributes and transition scopes', () => {
  const sample = dom('<button id="menu-btn" type="button" aria-expanded="false"></button>').children[0]
  for (const html of ['<button type="button"></button>', '<button type="button" aria-expanded="false" hidden></button>', '<button type="button" aria-expanded="false" data-astro-transition-scope="a"></button>']) {
    assert.throws(() => assertBehaviourMatches(sample, dom(html).children[0]), /behaviour attributes/)
  }
})
test('fixture drift cannot borrow attributes or ids from a different element', () => {
  const sample = dom('<dialog id="mobile-nav" aria-label="Navigation"><button id="mobile-nav-close" type="button" autofocus></button></dialog>')
  const body = dom('<button id="mobile-nav-close" type="button" autofocus></button><dialog id="mobile-nav" aria-label="Navigation"></dialog>')
  assert.throws(() => assertFixtureContract('header', sample, [{ name: 'index.html', body }]), /missing counterpart/)
})

test('nginx parsing distinguishes a server-level hidden-path guard from one nested in a location', () => {
  const server = String.raw`server {
    if ($uri ~ "/\.(?!well-known/)") { return 404; }
    location / { add_header CSP "value {with braces}"; if ($uri ~ "/\.") { return 403; } }
  }`
  const children = nginxBlocks(nginxBlocks(server)[0].body)
  assert.equal(children.filter(block => /^if\b/.test(block.header) && block.depth === 0).length, 1)
  assert.equal(children.filter(block => /^if\b/.test(block.header) && block.depth === 1).length, 1)
  assert.match(children.find(block => /^location/.test(block.header)).body, /value \{with braces\}/)
})
test('Docker snippet copy check accepts covering globs and directory copies', () => {
  const file = 'nginx-security-headers.conf'
  for (const copy of [
    'COPY docker/nginx-security-headers.conf /app/docker/nginx-security-headers.conf',
    'COPY --chown=app:app docker/*.conf /app/docker/',
    'COPY docker/ /app/docker/',
    'COPY docker/nginx-*.conf docker/other.txt /app/docker/',
  ]) assert.ok(dockerCopiesFile(copy, file), copy)
  for (const copy of ['COPY docker/*.template /app/docker/', 'COPY docker/*.conf /elsewhere/', 'COPY docker/other.conf /app/docker/']) {
    assert.ok(!dockerCopiesFile(copy, file), copy)
  }
})
