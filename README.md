<p align="center">
  <img width=200 src="https://raw.githubusercontent.com/CyR1en/Phos/refs/heads/main/public/favicon.svg"/>
</p>
<h2 align="center">phos (φῶς)</h2>

<p align="center">
  <a href="https://github.com/CyR1en/Phos/actions/workflows/docker-publish.yml"><img src="https://img.shields.io/github/actions/workflow/status/cyr1en/phos/docker-publish.yml?style=for-the-badge&logo=githubactions&logoColor=a6da95"></a>
  <a href="https://github.com/CyR1en/Phos/pkgs/container/phos"><img src="https://img.shields.io/github/v/tag/CyR1en/Phos?style=for-the-badge&logo=docker&label=ghcr&color=8aadf4"></a>
  <a href="https://github.com/CyR1en/Phos/blob/master/LICENSE"><img src="https://img.shields.io/github/license/cyr1en/Phos?colorA=363a4f&colorB=91d7e3&style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2Ij4KPHBhdGggZD0iTTIxNiwzMlYxOTJhOCw4LDAsMCwxLTgsOEg3MmExNiwxNiwwLDAsMC0xNiwxNkgxOTJhOCw4LDAsMCwxLDAsMTZINDhhOCw4LDAsMCwxLTgtOFY1NkEzMiwzMiwwLDAsMSw3MiwyNEgyMDhBOCw4LDAsMCwxLDIxNiwzMloiIHN0eWxlPSJmaWxsOiAjQ0FEM0Y1OyIvPgo8L3N2Zz4=&logoColor=cad3f5"></a>
  <a href="https://ko-fi.com/cyr1en"><img src="https://img.shields.io/badge/Kofi-Support_Development-f5a97f?style=for-the-badge&logo=Kofi&logoColor=cad3f5&labelColor=363a4f"></a>
</p>




A generated static-site photography portfolio built with [Astro](https://astro.build) 6, [Tailwind CSS](https://tailwindcss.com) 3, and [Sharp](https://sharp.pixelplumbing.com/).

Drop photos into category folders — galleries, thumbnails, blur placeholders, and hero slideshows are generated automatically. Everything is configurable through the admin dashboard at `/admin`.

## Features

**Photo Pipeline**
- Drop category folders into your photos directory — each becomes a gallery at `/photos/{category}`
- EXIF stripped from all served images
- WebP thumbnails and blur hash placeholders (LQIP) generated automatically
- Masonry gallery layout with full-screen lightbox viewer

**Admin Dashboard** (`/admin`)
- Edit homepage, about, contact, and 404 page copy
- Manage photographer name, email, and social links
- Edit category metadata — display names, descriptions, per-photo titles, featured priority
- SMTP-powered contact form — sends submissions directly to your email
- Password-protected (set via `ADMIN_PASSWORD`)

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
    featured: 2
```

Photos with `featured > 0` appear in the hero slideshow on the homepage.


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
      PUBLIC_SITE_URL: "https://yourdomain.com"
```

| Volume | Container path | Purpose |
|---|---|---|
| `./AppData/photos` | `/photos` | Drop category folders here (e.g. `wildlife/`, `wedding/`) |
| `./AppData/config` | `/config` | Persists site configuration across restarts |

On container startup, photos are automatically processed — the generation pipeline runs every boot, then the site is built and served on port 8080.

### Local Development

```bash
npm install
ADMIN_PASSWORD=admin npm run dev
```

The `dev` script generates photo content, starts the admin server (port 3001), and launches the Astro dev server (port 4321) with hot module replacement. The admin dashboard is proxied to `/admin` on the same port — visit **`http://localhost:4321/admin`**.

## Environment Variables

| Variable                      | Required | Default                 | Description                                        |
|-------------------------------|----------|-------------------------|----------------------------------------------------|
| `ADMIN_PASSWORD`              | Yes      | `admin`                 | Password for the admin dashboard at `/admin`       |
| `PUBLIC_SITE_URL`             | No       | `http://localhost:4321` | Public URL for canonical links and sitemap         |
| `LISTEN_PORT`                 | No       | `8080`                  | Nginx listen port inside the container             |
| `PUID`                        | No       | `1001`                  | User ID for volume permissions                     |
| `PGID`                        | No       | `1001`                  | Group ID for volume permissions                    |
| `PUBLIC_HERO_INTERVAL`        | No       | `6000`                  | Hero slideshow transition interval in milliseconds |
| `PUBLIC_HERO_OVERLAY_OPACITY` | No       | `0.2`                   | Hero overlay opacity (0–1)                         |

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

