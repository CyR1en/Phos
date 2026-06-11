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
- **Plugin system** — extend the site with deploy-time Astro components at named insertion points
- **Dark mode** — three-state toggle (light / dark / auto), persisted and system-aware
- **Contact form** — SMTP-powered, configurable from the admin dashboard
- **Galleries** — DB-backed curated collections beyond folder-based categories

## Docs

- [Deployment](docs/deployment.md) — Docker, local dev, environment variables
- [Adding Photos](docs/photos.md) — folder structure, metadata, hero slideshow
- [Plugins](docs/plugins.md) — plugin structure and admin integration
- [Contact Form](docs/contact-form.md) — SMTP setup and demo mode
