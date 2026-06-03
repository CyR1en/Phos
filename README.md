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

```bash
docker compose up -d --build
```

The container binds two volumes by default — one for photos, one for config. Both paths are configurable via `PHOTOS_PATH` and `CONFIG_DIR` in your `.env` or `docker-compose.override.yml`. The admin dashboard is available at `/admin` on the same port.

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
