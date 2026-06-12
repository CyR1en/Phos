import { createServer } from 'node:http'
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import nodemailer from 'nodemailer'
import { assembleConfig, writeFullConfig, getMeta, getPluginConfig, setPluginConfig, getGalleries, getGallery, createGallery, updateGallery, deleteGallery, setGalleryPhotos } from '../lib/db.mjs'
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

// ── Async task store for build/regenerate progress ──
const tasks = new Map()
let taskIdCounter = 0

function pushOutput(task, data) {
  const lines = data.toString('utf-8').split(/\r?\n/)
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  if (lines.length > 0) {
    task.lines.push(...lines)
    if (task.lines.length > 500) task.lines = task.lines.slice(-500)
  }
}

function createTask(command, args, options, timeoutMs) {
  const id = String(++taskIdCounter)
  const task = { id, status: 'running', lines: [], error: null, doneAt: null }
  tasks.set(id, task)

  const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'], shell: true })
  child.stdout.on('data', (d) => pushOutput(task, d))
  child.stderr.on('data', (d) => pushOutput(task, d))

  let timedOut = false
  const timer = timeoutMs ? setTimeout(() => { timedOut = true; child.kill() }, timeoutMs) : null

  child.on('close', (code) => {
    if (timer) clearTimeout(timer)
    task.doneAt = Date.now()
    if (timedOut) {
      task.status = 'error'
      task.error = 'Timed out'
    } else if (code === 0) {
      task.status = 'done'
    } else {
      task.status = 'error'
      task.error = `Process exited with code ${code}`
    }
  })
  child.on('error', (err) => {
    if (timer) clearTimeout(timer)
    task.doneAt = Date.now()
    task.status = 'error'
    task.error = err.message
  })
  return id
}

setInterval(() => {
  const now = Date.now()
  for (const [id, t] of tasks) {
    if (t.doneAt && now - t.doneAt > 60000) tasks.delete(id)
  }
}, 60000)

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
    // Also write to public/ so the main site can fetch /site-config.json at runtime
    writeFileSync(join(ROOT, 'public', 'site-config.json'), JSON.stringify(merged, null, 2))
    return json(res, { ok: true })
  }

  if (path === '/api/logo-status' && req.method === 'GET') {
    if (!requireAuth(req, res)) return
    const ROOT = dirname(fileURLToPath(import.meta.url))
    const pubDir = join(ROOT, '..', 'public')
    const files = existsSync(pubDir) ? readdirSync(pubDir) : []
    const logoFile = files.find(f => f === 'logo.svg')
    const lightFile = files.find(f => f.startsWith('logo_light.'))
    const darkFile = files.find(f => f.startsWith('logo_dark.'))
    return json(res, {
      detected: !!(logoFile || lightFile),
      type: logoFile ? 'svg' : lightFile ? 'image' : null,
      light: logoFile ? '/logo.svg' : lightFile ? '/' + lightFile : null,
      dark: logoFile ? '/logo.svg' : lightFile ? (darkFile ? '/' + darkFile : '/' + lightFile) : null,
    })
  }

  if (path === '/api/upload-logo' && req.method === 'POST') {
    if (!requireAuth(req, res)) return
    const body = await parseBody(req)
    if (!body) return json(res, { error: 'Invalid JSON' }, 400)

    if (typeof body.file !== 'string') {
      return json(res, { error: 'file (base64 data URL) is required' }, 400)
    }

    const ROOT = dirname(fileURLToPath(import.meta.url))

    // Remove old logo files
    const removeAllLogos = () => {
      for (const dir of ['public', 'dist']) {
        const base = join(ROOT, '..', dir)
        if (!existsSync(base)) continue
        for (const f of readdirSync(base)) {
          if (f === 'logo.svg' || f.startsWith('logo_light.') || f.startsWith('logo_dark.')) {
            try { rmSync(join(base, f)) } catch {}
          }
        }
      }
    }

    if (!body.file) {
      removeAllLogos()
      return json(res, { ok: true, detected: false, type: null, light: null, dark: null })
    }

    const decodeDataUrl = (dataUrl) => {
      const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
      if (!m) return null
      return { mime: m[1], buffer: Buffer.from(m[2], 'base64') }
    }

    const extForMime = (mime) => {
      const map = { 'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg' }
      return map[mime] || null
    }

    const validateBuffer = (buffer, ext) => {
      const sigMap = { png: [0x89, 0x50, 0x4e, 0x47], jpg: [0xff, 0xd8, 0xff], svg: null }
      const sig = sigMap[ext]
      if (sig) { for (let i = 0; i < sig.length; i++) { if (buffer[i] !== sig[i]) return false } }
      else if (ext === 'svg') { const s = buffer.toString('utf-8').trim(); if (!s.startsWith('<svg') && !s.startsWith('<?xml')) return false }
      return true
    }

    const writeLogo = (fileName, buffer) => {
      for (const dir of ['public', 'dist']) {
        const p = join(ROOT, '..', dir, fileName)
        try { writeFileSync(p, buffer) } catch {}
      }
    }

    const light = decodeDataUrl(body.file)
    if (!light) return json(res, { error: 'Invalid data URL' }, 400)

    const ext = extForMime(light.mime)
    if (!ext) return json(res, { error: 'Unsupported file type (SVG, PNG, JPEG only)' }, 400)
    if (!validateBuffer(light.buffer, ext)) return json(res, { error: 'File validation failed' }, 400)

    removeAllLogos()

    let files = {}

    if (ext === 'svg') {
      writeLogo('logo.svg', light.buffer)
      files = { type: 'svg', light: '/logo.svg', dark: '/logo.svg' }
    } else {
      writeLogo(`logo_light.${ext}`, light.buffer)
      files = { type: 'image', light: `/logo_light.${ext}`, dark: `/logo_light.${ext}` }

      if (body.darkFile) {
        const dark = decodeDataUrl(body.darkFile)
        if (dark) {
          const dExt = extForMime(dark.mime)
          if (dExt && validateBuffer(dark.buffer, dExt)) {
            writeLogo(`logo_dark.${dExt}`, dark.buffer)
            files.dark = `/logo_dark.${dExt}`
          }
        }
      }
    }

    return json(res, { ok: true, ...files })
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

  // ── Gallery endpoints ──

  if (path === '/api/galleries' && req.method === 'GET') {
    if (!requireAuth(req, res)) return
    return json(res, { galleries: getGalleries() })
  }

  if (path === '/api/galleries' && req.method === 'POST') {
    if (!requireAuth(req, res)) return
    const body = await parseBody(req)
    if (!body || !body.name) return json(res, { error: 'Name is required' }, 400)
    const gallery = createGallery({ name: body.name, description: body.description || '' })
    return json(res, gallery, 201)
  }

  const galleryMatch = path.match(/^\/api\/galleries\/([^/]+)$/)
  if (galleryMatch && req.method === 'GET') {
    if (!requireAuth(req, res)) return
    const gallery = getGallery(galleryMatch[1])
    if (!gallery) return json(res, { error: 'Gallery not found' }, 404)
    return json(res, gallery)
  }

  if (galleryMatch && req.method === 'PUT') {
    if (!requireAuth(req, res)) return
    const body = await parseBody(req)
    if (!body) return json(res, { error: 'Invalid JSON' }, 400)
    const gallery = updateGallery(galleryMatch[1], body)
    if (!gallery) return json(res, { error: 'Gallery not found' }, 404)
    return json(res, gallery)
  }

  if (galleryMatch && req.method === 'DELETE') {
    if (!requireAuth(req, res)) return
    const deleted = deleteGallery(galleryMatch[1])
    if (!deleted) return json(res, { error: 'Gallery not found' }, 404)
    return json(res, { ok: true })
  }

  const galleryPhotosMatch = path.match(/^\/api\/galleries\/([^/]+)\/photos$/)
  if (galleryPhotosMatch && req.method === 'PUT') {
    if (!requireAuth(req, res)) return
    const body = await parseBody(req)
    if (!body || !Array.isArray(body.photos)) return json(res, { error: 'photos array required' }, 400)
    const ok = setGalleryPhotos(galleryPhotosMatch[1], body.photos)
    if (!ok) return json(res, { error: 'Gallery not found' }, 404)
    return json(res, { ok: true })
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
    const taskId = createTask('node', ['scripts/generate-content.mjs'], { cwd: ROOT }, 120000)
    return json(res, { taskId })
  }

  if (path === '/api/republish' && req.method === 'POST') {
    if (!requireAuth(req, res)) return
    const taskId = createTask('npm', ['run', 'build'], { cwd: ROOT }, 300000)
    return json(res, { taskId })
  }

  const taskMatch = path.match(/^\/api\/tasks\/(\d+)$/)
  if (taskMatch && req.method === 'GET') {
    if (!requireAuth(req, res)) return
    const task = tasks.get(taskMatch[1])
    if (!task) return json(res, { error: 'Task not found' }, 404)
    return json(res, { status: task.status, lines: task.lines, error: task.error })
  }

  if (path === '/site-config.json' && req.method === 'GET') {
    const defaults = readJSON(DEFAULT_CONFIG_PATH) || {}
    const live = assembleConfig()
    const merged = deepMerge(defaults, live)
    return json(res, merged, 200, {
      'Cache-Control': 'no-cache',
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


