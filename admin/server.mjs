import { createServer } from 'node:http'
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import nodemailer from 'nodemailer'
import { assembleConfig, writeFullConfig, getMeta, getPluginConfig, setPluginConfig } from '../lib/db.mjs'
import { deepMerge } from '../lib/merge.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DEFAULT_CONFIG_PATH = join(ROOT, 'src', 'content', 'site-config.json')
const BUILT_ADMIN_PATH = join(ROOT, 'dist', 'admin', 'index.html')
const PHOTOS_SOURCE = process.env.PHOTOS_SOURCE || '/photos'
const PLUGINS_DIR = join(ROOT, 'plugins')

function readJSON(p) {
  try { return JSON.parse(readFileSync(p, 'utf-8')) } catch { return null }
}
function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
const PORT = parseInt(process.env.ADMIN_PORT || '3001', 10)
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin'

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif'])

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

function json(res, data, status = 200, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...extraHeaders })
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

function listPhotoFiles(dir) {
  try {
    return readdirSync(dir)
      .filter((f) => IMAGE_EXTS.has(extname(f).toLowerCase()) && !f.startsWith('.'))
      .sort()
  } catch {
    return []
  }
}

function loadCategoryMeta(folderName) {
  const metaPath = join(PHOTOS_SOURCE, folderName, '_meta.yaml')
  if (!existsSync(metaPath)) return {}
  try {
    return parseYaml(readFileSync(metaPath, 'utf-8'))
  } catch {
    return {}
  }
}

function discoverPluginManifests() {
  if (!existsSync(PLUGINS_DIR)) return []
  const manifests = []
  for (const name of readdirSync(PLUGINS_DIR)) {
    const dir = join(PLUGINS_DIR, name)
    if (!statSync(dir).isDirectory()) continue
    const manifestPath = join(dir, 'plugin.json')
    if (!existsSync(manifestPath)) continue
    const manifest = readJSON(manifestPath)
    if (!manifest || !manifest.entry) continue
    let config = {}
    if (manifest.config) {
      const configPath = join(dir, manifest.config)
      if (existsSync(configPath)) {
        config = readJSON(configPath) || {}
      }
    }
    const sqliteRow = getPluginConfig(name)
    if (sqliteRow) {
      config = deepMerge(config, sqliteRow.config)
    }
    manifests.push({
      name,
      entry: manifest.entry,
      slot: manifest.slot || null,
      admin: manifest.admin === true,
      config,
    })
  }
  return manifests
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
    .map((folderName) => {
      const slug = slugify(folderName)
      const photos = listPhotoFiles(join(PHOTOS_SOURCE, folderName))
      const meta = loadCategoryMeta(folderName)
      return { slug, photos, meta }
    })
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (path === '/admin' || path === '/admin/') {
    if (existsSync(BUILT_ADMIN_PATH)) return serveFile(res, BUILT_ADMIN_PATH)
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end('Admin not built. Run `npm run build` first.')
    return
  }

  if (path === '/api/login' && req.method === 'POST') {
    const body = await parseBody(req)
    if (body?.password === PASSWORD) {
      return json(res, { token: PASSWORD })
    }
    return json(res, { error: 'Invalid password' }, 401)
  }

  if (path === '/api/config' && req.method === 'GET') {
    if (!requireAuth(req, res)) return
    const defaults = readJSON(DEFAULT_CONFIG_PATH) || {}
    const live = assembleConfig()
    const merged = deepMerge(defaults, live)
    return json(res, merged)
  }

  if (path === '/api/config' && req.method === 'PUT') {
    if (!requireAuth(req, res)) return
    const body = await parseBody(req)
    if (!body) return json(res, { error: 'Invalid JSON' }, 400)
    const defaults = readJSON(DEFAULT_CONFIG_PATH) || {}
    const current = assembleConfig()
    const baseline = deepMerge(defaults, current)
    const merged = deepMerge(baseline, body)
    writeFullConfig(merged)
    return json(res, { ok: true })
  }

  if (path === '/api/categories' && req.method === 'GET') {
    if (!requireAuth(req, res)) return
    const categories = scanCategories()
    return json(res, { categories })
  }

  const catMatch = path.match(/^\/api\/categories\/([^/]+)$/)
  if (catMatch && req.method === 'PUT') {
    if (!requireAuth(req, res)) return
    const slug = catMatch[1]
    const entries = readdirSync(PHOTOS_SOURCE).filter((e) => !e.startsWith('.'))
    const folderName = entries.find((e) => slugify(e) === slug)
    if (!folderName) return json(res, { error: 'Category not found' }, 404)
    const metaPath = join(PHOTOS_SOURCE, folderName, '_meta.yaml')
    const body = await parseBody(req)
    if (!body) return json(res, { error: 'Invalid JSON' }, 400)

    try {
      writeFileSync(metaPath, stringifyYaml(body), 'utf-8')
      return json(res, { ok: true })
    } catch (err) {
      const hint = err.code === 'EACCES'
        ? `Permission denied writing to ${metaPath}. Ensure the PUID/PGID environment variables match the host user that owns the photos directory, or run "chown -R <host-user> <photos-dir>" on the host.`
        : err.message
      return json(res, { error: hint }, 500)
    }
  }

  if (path === '/api/plugins' && req.method === 'GET') {
    if (!requireAuth(req, res)) return
    const plugins = discoverPluginManifests().filter((p) => p.admin)
    return json(res, { plugins })
  }

  const pluginMatch = path.match(/^\/api\/plugins\/([^/]+)$/)
  if (pluginMatch && req.method === 'GET') {
    if (!requireAuth(req, res)) return
    const name = pluginMatch[1]
    const plugin = discoverPluginManifests().find((p) => p.name === name && p.admin)
    if (!plugin) return json(res, { error: 'Plugin not found' }, 404)
    return json(res, plugin)
  }

  if (pluginMatch && req.method === 'PUT') {
    if (!requireAuth(req, res)) return
    const name = pluginMatch[1]
    const plugin = discoverPluginManifests().find((p) => p.name === name && p.admin)
    if (!plugin) return json(res, { error: 'Plugin not found' }, 404)
    const body = await parseBody(req)
    if (!body || typeof body.config !== 'object' || body.config === null || Array.isArray(body.config)) {
      return json(res, { error: 'Body must be { config: {...} }' }, 400)
    }
    setPluginConfig(name, body.config)
    return json(res, { ok: true })
  }

  if (path === '/api/regenerate' && req.method === 'POST') {
    if (!requireAuth(req, res)) return
    try {
      execSync('node scripts/generate-content.mjs', { cwd: ROOT, stdio: 'pipe', timeout: 120000 })
      return json(res, { ok: true })
    } catch (err) {
      return json(res, { error: err.stderr?.toString() || 'Generation failed' }, 500)
    }
  }

  if (path === '/api/republish' && req.method === 'POST') {
    if (!requireAuth(req, res)) return
    try {
      execSync('npm run build', { cwd: ROOT, stdio: 'pipe', timeout: 300000 })
      return json(res, { ok: true })
    } catch (err) {
      return json(res, { error: err.stderr?.toString() || 'Build failed' }, 500)
    }
  }

  if (path === '/site-config.json' && req.method === 'GET') {
    const defaults = readJSON(DEFAULT_CONFIG_PATH) || {}
    const live = assembleConfig()
    const merged = deepMerge(defaults, live)
    return json(res, merged, 200, {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    })
  }

  if (path === '/api/contact' && req.method === 'POST') {
    const body = await parseBody(req)
    if (!body || !body.name || !body.email || !body.message) {
      return json(res, { error: 'Name, email, and message are required' }, 400)
    }

    try {
      const defaults = readJSON(DEFAULT_CONFIG_PATH) || {}
      const live = assembleConfig()
      const fullConfig = deepMerge(defaults, live)

      if (fullConfig.site?.toggle_demo) {
        return json(res, { ok: true })
      }

      const smtp = fullConfig.contact?.smtp
      if (!smtp || !smtp.host || !smtp.port || !smtp.user || !smtp.pass || !smtp.fromEmail || !smtp.toEmail) {
        return json(res, { error: 'SMTP not configured' }, 400)
      }

      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: parseInt(smtp.port, 10),
        secure: parseInt(smtp.port, 10) === 465,
        auth: { user: smtp.user, pass: smtp.pass },
      })

      await transporter.sendMail({
        from: `"${body.name}" <${smtp.fromEmail}>`,
        replyTo: body.email,
        to: smtp.toEmail,
        subject: `Contact form submission from ${body.name}`,
        text: `Name: ${body.name}\nEmail: ${body.email}\n\nMessage:\n${body.message}`,
        html: `<p><strong>Name:</strong> ${body.name}</p><p><strong>Email:</strong> ${body.email}</p><p><strong>Message:</strong></p><p>${body.message}</p>`,
      })

      return json(res, { ok: true })
    } catch (err) {
      return json(res, { error: err.message || 'Failed to send email' }, 500)
    }
  }

  res.writeHead(404)
  res.end('Not found')
}).listen(PORT, () => {
  const migratedAt = getMeta('migrated_at')
  console.log(`admin server listening on http://localhost:${PORT}${migratedAt ? ` (db migrated ${migratedAt})` : ''}`)
})


