<p align="center">
  <img width=200 src="https://raw.githubusercontent.com/CyR1en/Phos/refs/heads/main/public/favicon.svg"/>
</p>
<h2 align="center">phos (φῶς)</h2>

<p align="center">
  <a href="https://github.com/CyR1en/Phos/actions/workflows/docker-publish.yml"><img src="https://img.shields.io/github/actions/workflow/status/cyr1en/phos/docker-publish.yml?style=for-the-badge&logo=githubactions&logoColor=a6da95"></a>
  <a href="https://github.com/CyR1en/Phos/pkgs/container/phos"><img src="https://img.shields.io/github/v/tag/CyR1en/Phos?style=for-the-badge&logo=docker&label=ghcr&color=8aadf4"></a>
  <a href="https://github.com/CyR1en/Phos/blob/master/LICENSE"><img src="https://img.shields.io/github/license/CyR1en/Phos?colorA=363a4f&colorB=91d7e3&style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2Ij4KPHBhdGggZD0iTTIxNiwzMlYxOTJhOCw4LDAsMCwxLTgsOEg3MmExNiwxNiwwLDAsMC0xNiwxNkgxOTJhOCw4LDAsMCwxLDAsMTZINDhhOCw4LDAsMCwxLTgtOFY1NkEzMiwzMiwwLDAsMSw3MiwyNEgyMDhBOCw4LDAsMCwxLDIxNiwzMloiIHN0eWxlPSJmaWxsOiAjQ0FEM0Y1OyIvPgo8L3N2Zz4=&logoColor=cad3f5"></a>
  <a href="https://ko-fi.com/cyr1en"><img src="https://img.shields.io/badge/Kofi-Support_Development-f5a97f?style=for-the-badge&logo=Kofi&logoColor=cad3f5&labelColor=363a4f"></a>
</p>

A static-site photography portfolio built with [Astro](https://astro.build) 6, [Tailwind CSS](https://tailwindcss.com) 4, and [Sharp](https://sharp.pixelplumbing.com/).

```bash
# Docker (production)
docker compose up -d

# Local development
npm install && ADMIN_PASSWORD=admin npm run dev
```

## Features

- **Photo pipeline** — drop images into category folders; thumbnails, blur placeholders, and masonry galleries with lightbox are generated automatically
- **Admin dashboard** (`/admin`) — edit site copy, manage photos, configure galleries, and run builds from a Preact SPA with auto-save
- **Immersive gallery** — a home-page collage that flies past the viewer on scroll and reveals a tagline; layouts are authored per device in the admin
- **Plugin system** — extend the site with deploy-time Astro components at named insertion points
- **Dark mode** — three-state toggle (light / dark / auto), persisted and system-aware
- **Contact form** — SMTP-powered, configurable from the admin dashboard
- **Galleries** — DB-backed curated collections beyond folder-based categories

## Configuration

Edit settings in the admin at `/admin`. They are stored in SQLite, which takes precedence
once it holds owner settings. `src/content/site-config.json` holds the tracked defaults and is
never written to; the merged build input and photo manifests are generated under
`src/generated/` and gitignored. Use the admin's **Republish site** action to publish changed
settings to the static pages.

| Environment variable | Purpose / default |
| --- | --- |
| `ADMIN_PASSWORD` | Admin login password; defaults to `admin` for development. Production refuses the default unless explicitly allowed. |
| `PUBLIC_SITE_URL` | Public origin for canonical/OG URLs, sitemap and admin request-origin checks; defaults to `https://yourdomain.com`. Set this to your deployed URL. |
| `ADMIN_PORT` | Admin server port; `3001`. |
| `LISTEN_PORT` | Docker nginx listening port; `8080`. |
| `PUID` / `PGID` | Docker appuser UID/GID and mounted-file ownership; both default to `1001`. |
| `ADMIN_ALLOW_DEFAULT=1` | Allow the default admin password in production. |
| `PHOTOS_SOURCE` | Source category folders; `/photos` when present, otherwise `photos/` in the project. |
| `DB_PATH` | SQLite database; `config/site.db`, or `/config/site.db` in Docker. |
| `PHOTOS_CACHE_PATH` | Photo cache; defaults to `photos-cache.json` beside the database. |
| `CONFIG_PATH` | JSON used to seed a database with no owner settings; `config/site-config.json`, or `/config/site-config.json` in Docker. Docker rewrites it from SQLite on every boot. Contains SMTP credentials; keep it private. |
| `PHOS_SKIP_CONFIG_SYNC=1` | Skip the SQLite migration and sync, preserving synthetic/test config. |
| `PHOS_ALLOW_STALE_DIST=1` | Bypass only the test suite's dist freshness assertion. |
| `PHOS_ALLOW_NO_SHARP=1` | Skip pipeline tests when sharp cannot load. |

Details on config files, migration, upgrading and Docker are in [docs/configuration.md](docs/configuration.md).

## Checks

```bash
npm test             # test suite
npm run check        # tsc, astro check and the test suite
npm run check:full   # build first, then check
```

`npm run check` bootstraps the generated files on a fresh clone, so it works without photos or a
database. `check:full` defaults an unset `PUBLIC_SITE_URL` to `https://phos.test`; rebuild with
your real URL before deploying. The suite layout and opt-in fixtures are described in
[tests/README.md](tests/README.md).

## Documentation

- [Configuration](docs/configuration.md) — config files, SQLite migration, upgrading, Docker build context
- [Photos](docs/photos.md) — manifests, the responsive ladder and the pipeline cache
- [Immersive gallery](docs/immersive-gallery.md) — the home-page scroll scene, its config keys, engine and admin editor
- [Plugins](docs/plugins.md) — plugin structure, manifest fields and admin integration

## Images
**Admin page** `/admin`
<p align="center">
  <img width=1080 src="assets/admin_page.png"/>
</p>

