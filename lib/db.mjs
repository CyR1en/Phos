import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DB_PATH = process.env.DB_PATH || join(process.cwd(), 'config', 'site.db')

let _db = null

function ensureDir(filepath) {
  const dir = dirname(filepath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS site (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS social_links (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      url      TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS page_config (
      page TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contact_smtp (
      id         INTEGER PRIMARY KEY CHECK (id = 1),
      host       TEXT,
      port       INTEGER,
      user       TEXT,
      pass       TEXT,
      from_email TEXT,
      to_email   TEXT
    );

    CREATE TABLE IF NOT EXISTS _meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plugin_config (
      name       TEXT PRIMARY KEY,
      config     TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
}

function open() {
  if (_db) return _db
  ensureDir(DB_PATH)
  _db = new Database(DB_PATH)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  createSchema(_db)
  return _db
}

function getMeta(key) {
  const db = open()
  const row = db.prepare('SELECT value FROM _meta WHERE key = ?').get(key)
  return row ? row.value : null
}

function setMeta(key, value) {
  const db = open()
  db.prepare('INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)').run(key, value)
}

function getSiteRows() {
  const db = open()
  return db.prepare('SELECT key, value FROM site').all()
}

function setSiteRows(rows) {
  const db = open()
  const stmt = db.prepare('INSERT OR REPLACE INTO site (key, value) VALUES (?, ?)')
  const tx = db.transaction((entries) => {
    db.prepare('DELETE FROM site').run()
    for (const { key, value } of entries) stmt.run(key, value)
  })
  tx(rows)
}

function getSocialLinks() {
  const db = open()
  return db.prepare('SELECT platform, url FROM social_links ORDER BY position, id').all()
}

function setSocialLinks(links) {
  const db = open()
  const stmt = db.prepare('INSERT INTO social_links (platform, url, position) VALUES (?, ?, ?)')
  const tx = db.transaction((items) => {
    db.prepare('DELETE FROM social_links').run()
    items.forEach((link, i) => stmt.run(link.platform, link.url, i))
  })
  tx(links)
}

function getPageData(page) {
  const db = open()
  const row = db.prepare('SELECT data FROM page_config WHERE page = ?').get(page)
  return row ? JSON.parse(row.data) : null
}

function setPageData(page, data) {
  const db = open()
  db.prepare('INSERT OR REPLACE INTO page_config (page, data) VALUES (?, ?)')
    .run(page, JSON.stringify(data))
}

function getSmtp() {
  const db = open()
  return db.prepare('SELECT * FROM contact_smtp WHERE id = 1').get() || null
}

function getPluginConfig(name) {
  const db = open()
  const row = db.prepare('SELECT config, updated_at FROM plugin_config WHERE name = ?').get(name)
  if (!row) return null
  return { config: JSON.parse(row.config), updatedAt: row.updated_at }
}

function setPluginConfig(name, config) {
  const db = open()
  db.prepare(`
    INSERT INTO plugin_config (name, config, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      config = excluded.config,
      updated_at = excluded.updated_at
  `).run(name, JSON.stringify(config), Date.now())
}

function deletePluginConfig(name) {
  const db = open()
  db.prepare('DELETE FROM plugin_config WHERE name = ?').run(name)
}

function listPluginConfigs() {
  const db = open()
  return db.prepare('SELECT name, config, updated_at FROM plugin_config ORDER BY name').all()
}

function setSmtp(smtp) {
  const db = open()
  db.prepare(`
    INSERT OR REPLACE INTO contact_smtp
      (id, host, port, user, pass, from_email, to_email)
    VALUES (1, ?, ?, ?, ?, ?, ?)
  `).run(
    smtp.host || null,
    smtp.port || null,
    smtp.user || null,
    smtp.pass || null,
    smtp.fromEmail || null,
    smtp.toEmail || null,
  )
}

function assembleConfig() {
  const siteRows = getSiteRows()
  const siteObj = {}
  for (const { key, value } of siteRows) {
    siteObj[key] = value
  }

  return {
    site: {
      page_description: siteObj.page_description || '',
      title: siteObj.title || '',
      description: siteObj.description || '',
      toggle_demo: siteObj.toggle_demo === 'true',
      og: {
        image: siteObj.og_image || '',
        imageAlt: siteObj.og_image_alt || '',
        imageWidth: parseInt(siteObj.og_image_width || '1200', 10),
        imageHeight: parseInt(siteObj.og_image_height || '630', 10),
        locale: siteObj.og_locale || 'en_US',
      },
      social: getSocialLinks(),
    },
    home: (() => {
      const h = getPageData('home') || {}
      const withDefault = (key) => ({
        enabled: true,
        ...(h[key] && typeof h[key] === 'object' && !Array.isArray(h[key]) ? h[key] : {}),
      })
      return {
        ...h,
        services: withDefault('services'),
        portfolio: withDefault('portfolio'),
        testimonials: withDefault('testimonials'),
        cta: withDefault('cta'),
      }
    })(),
    about: (() => {
      const a = getPageData('about') || {}
      const hasNewShape = a.photographer && (
        'intro' in a.photographer || 'bio' in a.photographer || 'photo' in a.photographer
      )
      const hasOldShape = (
        'intro' in a || 'bio' in a || 'photo' in a ||
        'photoFull' in a || 'ctaHeading' in a || 'ctaLink' in a
      )
      if (hasNewShape || !hasOldShape) return a
      const {
        photographer: oldP = {},
        intro, bio, photo, photoFull: _pf,
        ctaHeading, ctaLink,
        ...rest
      } = a
      return {
        ...rest,
        photographer: {
          name: oldP.name ?? '',
          email: oldP.email ?? '',
          intro: intro ?? '',
          bio: bio ?? '',
          photo: photo ?? '',
        },
        call_to_action: {
          heading: ctaHeading ?? '',
          link: ctaLink ?? '',
        },
      }
    })(),
    contact: (() => {
      const fmt = getPageData('contact') || {}
      const smtp = getSmtp() || {}
      return {
        ...fmt,
        smtp: {
          host: smtp.host || '',
          port: smtp.port || 587,
          user: smtp.user || '',
          pass: smtp.pass || '',
          fromEmail: smtp.from_email || '',
          toEmail: smtp.to_email || '',
        },
      }
    })(),
    notFound: getPageData('notFound') || {},
  }
}

function writeFullConfig(config) {
  const db = open()
  const tx = db.transaction((cfg) => {
    const site = cfg.site || {}
    setSiteRows([
      { key: 'page_description', value: site.page_description || '' },
      { key: 'title', value: site.title || '' },
      { key: 'description', value: site.description || '' },
      { key: 'toggle_demo', value: site.toggle_demo ? 'true' : 'false' },
      { key: 'og_image', value: site.og?.image || '' },
      { key: 'og_image_alt', value: site.og?.imageAlt || '' },
      { key: 'og_image_width', value: String(site.og?.imageWidth || 1200) },
      { key: 'og_image_height', value: String(site.og?.imageHeight || 630) },
      { key: 'og_locale', value: site.og?.locale || 'en_US' },
    ])

    setSocialLinks(Array.isArray(site.social) ? site.social : [])

    if (cfg.home) setPageData('home', cfg.home)
    if (cfg.about) setPageData('about', cfg.about)

    if (cfg.contact) {
      const { smtp, ...rest } = cfg.contact
      setPageData('contact', rest)
      if (smtp) setSmtp(smtp)
    }
    if (cfg.notFound) setPageData('notFound', cfg.notFound)
  })
  tx(config)
}

function migrateFromJson(json) {
  writeFullConfig(json)
  setMeta('migrated_at', new Date().toISOString())
  setMeta('source', 'site-config.json')
}

function exportToJson() {
  return assembleConfig()
}

function getDbPath() {
  return DB_PATH
}

export {
  open,
  getMeta,
  setMeta,
  getSiteRows,
  setSiteRows,
  getSocialLinks,
  setSocialLinks,
  getPageData,
  setPageData,
  getSmtp,
  setSmtp,
  getPluginConfig,
  setPluginConfig,
  deletePluginConfig,
  listPluginConfigs,
  assembleConfig,
  writeFullConfig,
  migrateFromJson,
  exportToJson,
  getDbPath,
}
