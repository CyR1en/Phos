import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { makeEnv } from './dom.mjs'

export const fixture = name => readFile(new URL(`../fixtures/${name}.html`, import.meta.url), 'utf8')

/** Files are process-isolated; cases within each runtime file must stay serial. */
export function environment(t, options = {}) {
  const env = makeEnv(options)
  env.install()
  env.$ = id => env.document.getElementById(id)
  t.after(() => {
    try { assert.deepEqual(env.errors, [], 'no errors in event, timer or rAF callbacks') }
    finally { env.restore() }
  })
  return env
}

export function replaceBody(env, html) {
  const doc = env.document
  doc.body.remove()
  doc.body = doc.createElement('body')
  doc.documentElement.append(doc.body)
  env.parseHTML(html, doc.body)
}

export function swapBody(env, html) {
  env.fire('astro:before-swap')
  replaceBody(env, html)
  env.fire('astro:after-swap')
}

export function incomingDocument(env, head, body = '') {
  const doc = new env.document.constructor()
  doc.documentElement.setAttribute('lang', 'en')
  doc.documentElement.setAttribute('data-theme', 'theme-gallery')
  env.parseHTML(head, doc.head)
  env.parseHTML(body, doc.body)
  return doc
}

/** Model ClientRouter's root-attribute replacement and stylesheet persistence. */
export function navigate(env, next, beforeCopy = () => {}, { to = env.window.location.href } = {}) {
  const destination = new URL(to, env.window.location.href)
  env.fire('astro:before-swap', { newDocument: next, to: destination })
  beforeCopy(next)
  const current = env.document
  for (const { name } of current.documentElement.attributes) current.documentElement.removeAttribute(name)
  for (const { name, value } of next.documentElement.attributes) current.documentElement.setAttribute(name, value)
  for (const old of [...current.head.children]) {
    const persisted = old.localName === 'link' && old.getAttribute('rel') === 'stylesheet'
      ? next.head.children.find(el => el.localName === 'link' && el.getAttribute('href') === old.getAttribute('href'))
      : null
    if (persisted) persisted.remove()
    else old.remove()
  }
  current.head.append(...next.head.children)
  current.body.remove()
  current.body = next.body
  current.documentElement.append(current.body)
  env.window.location.href = destination.href
  env.fire('astro:after-swap')
}
