import { createServer } from 'node:http'
import { readFileSync, writeFileSync, existsSync, readdirSync, copyFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, dirname, extname, parse as parsePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DEFAULT_CONFIG_PATH = join(ROOT, 'src', 'content', 'site-config.json')
const CONFIG_PATH = process.env.CONFIG_PATH || DEFAULT_CONFIG_PATH
const CONFIG_DEST = DEFAULT_CONFIG_PATH
const DASHBOARD_PATH = join(__dirname, 'dashboard.html')
const PHOTOS_SOURCE = process.env.PHOTOS_SOURCE || join(ROOT, 'photos')

function readJSON(p) {
  try { return JSON.parse(readFileSync(p, 'utf-8')) } catch { return null }
}
const PORT = parseInt(process.env.ADMIN_PORT || '3001', 10)
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin'

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif'])

function deepMerge(target, source) {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key] = deepMerge(result[key], source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}

function serveFile(res, path, type = 'text/html; charset=utf-8') {
  try {
    const content = readFileSync(path, 'utf-8')
    res.writeHead(200, { 'Content-Type': type })
    res.end(content)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      try { resolve(JSON.parse(body)) } catch { resolve(null) }
    })
  })
}

function requireAuth(req, res) {
  const auth = req.headers['authorization']
  if (!auth || !auth.startsWith('Bearer ') || auth.slice(7) !== PASSWORD) {
    json(res, { error: 'Unauthorized' }, 401)
    return false
  }
  return true
}

// Categories helpers
function listPhotoFiles(dir) {
  try {
    return readdirSync(dir)
      .filter((f) => IMAGE_EXTS.has(extname(f).toLowerCase()) && !f.startsWith('.'))
      .sort()
  } catch {
    return []
  }
}

function loadCategoryMeta(slug) {
  const metaPath = join(PHOTOS_SOURCE, slug, '_meta.yaml')
  if (!existsSync(metaPath)) return {}
  try {
    return parseYaml(readFileSync(metaPath, 'utf-8'))
  } catch {
    return {}
  }
}

function scanCategories() {
  let entries
  try {
    entries = readdirSync(PHOTOS_SOURCE)
  } catch {
    return []
  }
  return entries
    .filter((e) => {
      const p = join(PHOTOS_SOURCE, e)
      try { return readdirSync(p).length >= 0 } catch { return false }
    })
    .filter((e) => !e.startsWith('.'))
    .map((slug) => {
      const photos = listPhotoFiles(join(PHOTOS_SOURCE, slug))
      const meta = loadCategoryMeta(slug)
      return { slug, photos, meta }
    })
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  // Dashboard
  if (path === '/admin' || path === '/admin/') {
    return serveFile(res, DASHBOARD_PATH)
  }

  // API: Login
  if (path === '/api/login' && req.method === 'POST') {
    const body = await parseBody(req)
    if (body?.password === PASSWORD) {
      return json(res, { token: PASSWORD })
    }
    return json(res, { error: 'Invalid password' }, 401)
  }

  // API: Get config (deep-merge defaults so missing sections like `og` appear)
  if (path === '/api/config' && req.method === 'GET') {
    if (!requireAuth(req, res)) return
    const defaults = readJSON(DEFAULT_CONFIG_PATH) || {}
    const existing = readJSON(CONFIG_PATH)
    const config = existing ? deepMerge(defaults, existing) : defaults
    return json(res, config)
  }

  // API: Update config (deep merge)
  if (path === '/api/config' && req.method === 'PUT') {
    if (!requireAuth(req, res)) return
    const body = await parseBody(req)
    if (!body) return json(res, { error: 'Invalid JSON' }, 400)
    const existing = existsSync(CONFIG_PATH)
      ? JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
      : {}
    const merged = deepMerge(existing, body)
    writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8')
    return json(res, { ok: true })
  }

  // API: Get categories (scan photos/ folders + _meta.yaml)
  if (path === '/api/categories' && req.method === 'GET') {
    if (!requireAuth(req, res)) return
    const categories = scanCategories()
    return json(res, { categories })
  }

  // API: Update single category _meta.yaml
  // Match /api/categories/:slug
  const catMatch = path.match(/^\/api\/categories\/([^/]+)$/)
  if (catMatch && req.method === 'PUT') {
    if (!requireAuth(req, res)) return
    const slug = catMatch[1]
    const metaPath = join(PHOTOS_SOURCE, slug, '_meta.yaml')
    const body = await parseBody(req)
    if (!body) return json(res, { error: 'Invalid JSON' }, 400)

    try {
      writeFileSync(metaPath, stringifyYaml(body), 'utf-8')
      return json(res, { ok: true })
    } catch (err) {
      return json(res, { error: err.message }, 500)
    }
  }

  function syncConfig() {
    if (CONFIG_PATH !== CONFIG_DEST && existsSync(CONFIG_PATH)) {
      copyFileSync(CONFIG_PATH, CONFIG_DEST)
    }
  }

  // API: Generate (content generation only — fast, no astro build)
  if (path === '/api/generate' && req.method === 'POST') {
    if (!requireAuth(req, res)) return
    try {
      syncConfig()
      execSync('node scripts/generate-content.mjs', { cwd: ROOT, stdio: 'pipe', timeout: 120000 })
      return json(res, { ok: true })
    } catch (err) {
      return json(res, { error: err.stderr?.toString() || 'Generation failed' }, 500)
    }
  }

  // API: Rebuild (generate-content + astro build)
  if (path === '/api/rebuild' && req.method === 'POST') {
    if (!requireAuth(req, res)) return
    try {
      syncConfig()
      execSync('npm run build', { cwd: ROOT, stdio: 'pipe', timeout: 180000 })
      return json(res, { ok: true })
    } catch (err) {
      return json(res, { error: err.stderr?.toString() || 'Build failed' }, 500)
    }
  }

  // 404
  res.writeHead(404)
  res.end('Not found')
}).listen(PORT, () => {
  console.log(`admin server listening on http://localhost:${PORT}`)
})
