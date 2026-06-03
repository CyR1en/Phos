# Phos — Photography Portfolio

A static-site photography portfolio built with [Astro](https://astro.build) 6, [Tailwind CSS](https://tailwindcss.com) 3, and [Sharp](https://sharp.pixelplumbing.com/).

Drop photos into category folders — galleries, thumbnails, blur placeholders, and hero slideshows are generated automatically. Everything is configurable through the admin dashboard at `/admin`.

## Features

**Photo Pipeline**
- Drop category folders into your photos directory — each becomes a gallery at `/photos/{category}`
- EXIF stripped from all served images
- WebP thumbnails generated automatically with Sharp
- Blur hash placeholders (LQIP) for fast initial paint
- Masonry gallery layout with lightbox viewer

**Admin Dashboard** (`/admin`)
- Edit homepage, about, contact, and 404 page copy
- Manage photographer name, email, and social links
- Edit category metadata — display names, descriptions, per-photo titles, featured priority
- Formbricks integration for contact form submissions
- Password-protected (set via `ADMIN_PASSWORD`), auto-starts with `npm run dev`

**Design & UX**
- Dark mode with system-aware theme toggle
- Responsive mobile navigation with slide-in drawer
- Fade-in scroll animations on all sections
- Hero section with configurable interval and overlay opacity
- Astro 6 prefetching (all links, viewport strategy)
- Full-screen lightbox gallery

**Deployment**
- Multi-stage Docker build (Node 22 → Nginx Alpine)
- Non-root container, read-only rootfs, dropped capabilities
- Security headers: HSTS, X-Frame-Options, X-Content-Type-Options, Permissions-Policy
- Persisted site config on Docker volumes — survives container restarts
- Static HTML output — no server-side rendering

## Quick Start

```bash
npm install
ADMIN_PASSWORD=admin npm run dev
```

The `dev` script generates photo content, starts the admin server (port 3001), and launches the Astro dev server (port 4321). The admin dashboard is proxied to `/admin` on the same port — visit **`http://localhost:4321/admin`**.

## Docker

Deploy with the pre-built image from GitHub Container Registry:

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
      PUBLIC_SITE_URL: "https://yourdomain.com"
```

### Volumes

| Volume | Container path | Purpose |
|---|---|---|
| `./AppData/photos` | `/photos` | Drop category folders here (e.g. `wildlife/`, `wedding/`) |
| `./AppData/config` | `/config` | Persists site configuration across restarts |

Photos are automatically processed on container startup — the generation pipeline runs every boot.

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ADMIN_PASSWORD` | Yes | — | Password for the admin dashboard at `/admin` |
| `PUBLIC_SITE_URL` | No | `http://localhost:4321` | Public URL of your site (SEO meta tags, sitemap) |
| `PHOTOS_PATH` | No | `/photos` | Photos directory inside the container |
| `CONFIG_DIR` | No | `/config` | Site config persistence directory |

## Adding Photos

Create a folder in your photos directory with a descriptive name (e.g. `wildlife/`, `wedding/`), drop images inside (jpg, png, webp, or avif), and rebuild. The folder automatically becomes a gallery at `/photos/wildlife`.

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
    featured: 2
```

Photos with `featured > 0` appear in the hero slideshow on the homepage.
