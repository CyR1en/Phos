# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — discover plugins → generate photo content → start admin API (port 3001) → Astro dev (port 4321, HMR)
- `npm run build` — discover plugins → generate content → Astro static build to `dist/`
- `npm run generate` — discover plugins + merge SQLite config overrides → regenerate photo/category manifest
- `npm run preview` — preview production build locally
- `ADMIN_PASSWORD=admin npm run dev` — dev with admin dashboard authentication
- `docker compose up -d --build` — full container build and run

No linter, formatter, test runner, or typecheck script is configured.

## Stack

- **Framework**: Astro 6 (SSG), Preact via `@astrojs/preact` with compat (admin SPA), Preline UI
- **Styling**: Tailwind CSS v4 (PostCSS plugin), Rose Pine theme, Cormorant Garamond (display) + DM Sans (body) via Google Fonts
- **Image pipeline**: Sharp — EXIF stripping, WebP thumbs (800×600, mobile 400px), blur placeholders (20px)
- **DB**: better-sqlite3 via `lib/db.mjs` (config persistence, galleries)
- **Smooth scroll**: Lenis (client-side only)
- **Serving**: Nginx (Alpine, templated via `envsubst` for `$LISTEN_PORT`)
- **Admin SPA state**: Preact signals via `src/lib/admin/store.tsx`

## Project Structure

```
src/
  pages/            — Astro routes (index, about, contact, 404, portfolio, photo/all, admin)
  layouts/          — BaseLayout.astro (HTML shell, OG meta, fonts, theme script)
  components/       — Astro components (Hero, PhotoGrid, Gallery, Lightbox, etc.)
  components/admin/ — Preact SPA for dashboard (pages/, fields/, ui/)
  lib/admin/        — Admin API client (api.ts), types (types.ts), state store (store.tsx)
  content/          — Generated manifests (categories.json, galleries.json), site-config.json
  generated/        — Build artifact: auto-discovered plugin imports (plugins.mjs)
  styles/           — global.css (Tailwind), themes/rose-pine.css
scripts/            — Node build scripts (generate-content.mjs, discover-plugins.mjs, migrate-config.mjs, merge-config.mjs)
admin/              — Admin API HTTP server (server.mjs), routes at /api/*
lib/                — Shared utilities (db.mjs, merge.mjs)
plugins/            — Site plugins (each dir = name/, with plugin.json + Astro component + optional defaults)
public/             — Static assets (favicon, logo)
config/             — Gitignored: SQLite database file (site.db)
```

## Photo Pipeline

- Source directory: `photos/` (local) or `$PHOTOS_SOURCE` (Docker: `/photos`)
- Each subdirectory becomes a gallery category at `/photos/{slug}`
- `_meta.yaml` per category: display name, description, cover, photo order, per-photo titles and hero_priority
- `scripts/generate-content.mjs` processes photos and writes `src/content/categories.json`
- Astro `<Image>`/`<Picture>` not used — Sharp handles everything at build time

## Config Pipeline

1. Defaults: `src/content/site-config.json`
2. Admin dashboard reads/writes SQLite via `/api/config` (debounced auto-save)
3. `scripts/merge-config.mjs` merges SQLite over defaults at build time
4. Live patching: `BaseLayout.astro` fetches `/site-config.json` and applies `data-config` attributes client-side
5. Config attributes use dot-path syntax: `data-config="home.cta.heading"`

## Admin Dashboard

- Preact SPA mounted at `/admin` via `src/pages/admin/index.astro` with `client:only="preact"`
- Bearer token auth against `ADMIN_PASSWORD`
- API routes (port 3001, proxied at `/api` in dev, behind nginx in production):
  - Config: GET/PUT `/api/config`
  - Categories: GET `/api/categories`, PUT `/api/categories/:slug`
  - Galleries: full CRUD at `/api/galleries[/:id]`, PUT `/api/galleries/:id/photos`
  - Plugins: GET `/api/plugins`, GET/PUT `/api/plugins/:name`
  - Build: POST `/api/regenerate`, POST `/api/republish`, GET `/api/tasks/:id`
  - Contact: POST `/api/contact` (SMTP)
  - Auth: POST `/api/login`
  - Logo: GET `/api/logo-status`, POST `/api/upload-logo`

## Galleries (DB-backed)

- Managed through the admin dashboard (Galleries tab), distinct from photo-directory categories
- Rendered at `/portfolio/` (index) and `/portfolio/[gallery]` (detail)
- SQLite tables: `galleries` + `gallery_photos`
- `/photo/all` shows all photos across categories with sidebar filters

## Plugin System

- `plugins/<name>/plugin.json`: defines `entry` (Astro component), `slot` (insertion point), optional `admin: true`
- Slots: e.g. `about.after-gear` — resolved at build time by `Plugins.astro`
- `admin: true` enables config editing from admin dashboard (stored in SQLite, merged over JSON defaults)

## Build Artifacts (all gitignored)

- `public/photos/` — generated thumbnails and EXIF-stripped originals
- `src/generated/plugins.mjs` — auto-discovered plugin imports
- `src/content/categories.json` — photo category manifest
- `config/` — local SQLite database

## Path Aliases (tsconfig + Vite)

- `@components/*` → `src/components/*`
- `@layouts/*` → `src/layouts/*`
- `@content/*` → `src/content/*`

## Container

- Multi-stage Dockerfile (Node 22 Alpine build → Alpine runtime with Nginx)
- Non-root `appuser` (UID 1001), dropped capabilities, read-only rootfs
- Entrypoint: merge config → migrate to SQLite → generate content → discover plugins → astro build → admin server + nginx
- Healthcheck: `wget --spider http://127.0.0.1:8080/`
