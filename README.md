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

A static-site photography portfolio built with [Astro](https://astro.build) 6, [Tailwind CSS](https://tailwindcss.com) 3, and [Sharp](https://sharp.pixelplumbing.com/).

Drop photos into category folders — galleries, thumbnails, blur placeholders, and hero slideshows are generated automatically. Everything is configurable through the admin dashboard at `/admin`.

## Features

**Photo Pipeline**
- Drop category folders into your photos directory — each becomes a gallery at `/photos/{category}`
- EXIF stripped from all served images
- WebP thumbnails + mobile thumbnails and blur placeholders generated automatically
- Masonry gallery layout with full-screen lightbox viewer and swipe support

**Admin Dashboard** (`/admin`)
- Built with Preact, React Query, and Tailwind — persistent pages, toast notifications, auto-save
- Edit homepage, about, contact, and 404 page copy
- Manage photographer name, bio, gear list, social links, and call-to-action sections
- Edit category metadata — display names, descriptions, per-photo titles, hero priority
- SMTP-powered contact form — sends submissions directly to your email
- Debounced auto-save with visual save indicator
- Live config patching — changes take effect on next page load without a full rebuild

**Plugin System** (v1.2.0)
- Extend the site with deploy-time plugins under `plugins/<name>/`
- Define an Astro component, slot target (e.g. `about.after-gear`), and optional config
- Plugins with `"admin": true` get their config editable from the admin dashboard
- Config merges JSON defaults with SQLite-persisted admin overrides

**Dark Mode**
- Tailwind `darkMode: 'class'`, persisted in localStorage, defaults to system preference
- Three-state toggle: light / dark / auto

## Adding Photos

Create a folder in your photos directory with a descriptive name (e.g. `wildlife/`, `wedding/`), drop images inside (jpg, png, webp, or avif), and rebuild or restart the container. The folder automatically becomes a gallery at `/photos/wildlife`.

For display names, descriptions, and per-photo captions, add a `_meta.yaml` file inside the folder:

```yaml
name: "Wildlife"
description: "Animals in their natural habitat"
cover: "lion.jpg"
order: 1
photos:
  lion.jpg:
    title: "Mountain Lion"
    description: "Captured in the Rockies"
    hero_priority: 2
```

Photos with `hero_priority > 0` appear in the hero slideshow (higher = earlier).

## Plugins

Plugins are Astro components that render at named insertion points on the site. Create a folder under `plugins/<name>/`:

```
plugins/my-plugin/
  plugin.json       # { "name": "my-plugin", "entry": "./MyPlugin.astro", "slot": "about.after-gear", "admin": true }
  MyPlugin.astro    # your component (receives config as props)
  my-plugin.json    # default config values (optional)
```

Enable admin editing by setting `"admin": true` — the config UI appears in the dashboard under Plugins. Edits are stored in SQLite and merged on top of the JSON defaults at build time.

## Deployment

### Production (Docker)

```yaml
services:
  phos:
    image: ghcr.io/cyr1en/phos:latest
    container_name: phos
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - ./AppData/photos:/photos:rw
      - ./AppData/config:/config:rw
    environment:
      ADMIN_PASSWORD: "your-password-here"
      DB_PATH: "/config/site.db"
      PUBLIC_SITE_URL: "https://yourdomain.com"
```

| Volume | Container path | Purpose |
|---|---|---|
| `./AppData/photos` | `/photos` | Drop category folders here (e.g. `wildlife/`, `wedding/`). Requires `PHOTOS_SOURCE=/photos`. |
| `./AppData/config` | `/config` | Persists site-config.json and SQLite database (`DB_PATH=/config/site.db`) across restarts |
| `./AppData/plugins/*` | `/app/plugins/*` | Optional: mount custom plugins from host |

On each container start, the entrypoint runs: merge default config → migrate to SQLite → generate photos → discover plugins → build static site → start admin server (port 3001) and nginx (port 8080). The admin dashboard is available at `/admin` behind nginx.

### Local Development

```bash
npm install
ADMIN_PASSWORD=admin npm run dev
```

The `dev` script runs: discover plugins → generate photo content → start admin server (port 3001, proxied at `/api`) → launch Astro dev server (port 4321) with HMR. Visit **`http://localhost:4321`**.

To regenerate content without building: `npm run generate`. For a full production build: `npm run build`.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ADMIN_PASSWORD` | Yes | `admin` | Password for the admin dashboard |
| `PUBLIC_SITE_URL` | No | `http://localhost:4321` | Public URL for canonical links and sitemap |
| `DB_PATH` | No | `config/site.db` | SQLite database path (set to `/config/site.db` in Docker) |
| `LISTEN_PORT` | No | `8080` | Nginx listen port inside the container |
| `PUID` | No | `1001` | User ID for volume permissions |
| `PGID` | No | `1001` | Group ID for volume permissions |
| `PUBLIC_HERO_INTERVAL` | No | `6000` | Hero slideshow transition interval in milliseconds |
| `PUBLIC_HERO_OVERLAY_OPACITY` | No | `0.2` | Hero overlay opacity (0–1) |

## Contact Form Setup

The contact form sends emails via any SMTP server. **No third-party service required.**

### Gmail Example

1. **Enable 2-Step Verification** at https://myaccount.google.com/security
2. **Generate an App Password** at https://myaccount.google.com/apppasswords
   - Select "Other" → name it `Phos` → copy the 16-character password
3. **Log into the admin dashboard** at `/admin` and navigate to the **Contact** tab
4. Fill in the SMTP fields:

| Field | Value |
|---|---|
| `smtp.host` | `smtp.gmail.com` |
| `smtp.port` | `587` |
| `smtp.user` | `your.email@gmail.com` |
| `smtp.pass` | The 16-character app password (spaces optional) |
| `smtp.fromEmail` | `your.email@gmail.com` |
| `smtp.toEmail` | Where you want to receive messages (any address) |

### Other Providers

Any SMTP provider works — SendGrid, Mailgun, your hosting provider's mail server, etc. Just fill in the same six fields with the provider's credentials.

### Demo Mode

When `site.toggle_demo` is enabled in the admin dashboard, form submissions are silently accepted without sending emails — useful for testing.
