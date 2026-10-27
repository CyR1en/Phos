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
- **Immersive gallery** — a server-rendered home-page collage that flies past the viewer on scroll and reveals a tagline, animated by CSS scroll-driven keyframes with a 1.2 KB fallback; layouts are authored per device in the admin

## Configuration and checks

| Environment variable | Purpose / default |
| --- | --- |
| `ADMIN_PASSWORD` | Admin login password; defaults to `admin` for development. Production refuses the default unless explicitly allowed. |
| `PUBLIC_SITE_URL` | Public origin for canonical/OG URLs, sitemap and admin request-origin checks; Astro defaults to `https://yourdomain.com`. Set this to your deployed URL. |
| `ADMIN_PORT` | Admin server port; `3001`. The Docker nginx and local Astro proxies target `3001`. |
| `LISTEN_PORT` | Docker nginx listening port; `8080`. |
| `PUID` / `PGID` | Docker appuser UID/GID and mounted-file ownership; both default to `1001`. |
| `ADMIN_ALLOW_DEFAULT=1` | Explicitly allow the default admin password in production; disabled unless set to `1`. |
| `PHOTOS_SOURCE` | Source category folders; `/photos` when present, otherwise `photos/` in the project. Dotfiles and dot-directories are ignored. |
| `DB_PATH` | SQLite database; project `config/site.db`, or `/config/site.db` in Docker. |
| `PHOTOS_CACHE_PATH` | Photo cache override; defaults to `photos-cache.json` beside the resolved SQLite database (Docker: `/config/photos-cache.json`). |
| `CONFIG_PATH` | Persisted JSON used to seed a database that has no owner configuration yet; defaults to project `config/site-config.json`, Docker to `/config/site-config.json`. SQLite is authoritative after migration or an admin save. Docker rewrites this file from SQLite on every boot. It contains SMTP credentials; keep it private. |
| `PHOS_SKIP_CONFIG_SYNC=1` | Skip JSON-to-SQLite migration and the generator's SQLite-to-build-config sync, preserving synthetic/test config. |
| `PHOS_ALLOW_STALE_DIST=1` | Bypass only the test suite's dist freshness assertion; does not validate new build output. |
| `PHOS_ALLOW_NO_SHARP=1` | Explicitly skip pipeline tests when sharp cannot load; sharp is still required to generate photos. |

`src/content/site-config.json` is the tracked defaults file. Scripts read it but never
write owner settings back into it. The merged build input is
`src/generated/site-config.json`; it can contain SMTP credentials and is gitignored.
`scripts/write-active-theme.mjs` copies the defaults there byte-for-byte when the generated
file is missing. For an existing file, it preserves owner values, fills missing default
keys and removes keys outside the defaults schema, writing only when the bytes change.
It also bootstraps a missing plugin manifest with empty exports, so checks and direct
`build:site` runs work without creating a database.
Photo manifests are generated at `src/generated/categories.json` and
`src/generated/galleries.json` by `scripts/generate-content.mjs` during `dev`,
`generate`, and `build` (and at Docker startup before `build:site`). They are
gitignored build inputs. The generator writes both manifests atomically, so concurrent
builds read complete JSON files. The theme writer creates an empty manifest only when it
is missing, using create-only writes that preserve a concurrently generated manifest,
so fresh clones can check or build without any photos.
The script generates `src/generated/site-config.public.json` for the admin editor and
`public/site-config.json` for static hosts, both with the entire SMTP block removed.
The public copy is generated and gitignored too. `.dockerignore` excludes `config/`,
`src/generated/`, `public/site-config.json`, `tests/`, `AppData/`, and `.env.*` from the
image build context. Docker regenerates its build config at startup from defaults
and the mounted owner data.

Local `dev`, `build`, and `generate` commands run `scripts/migrate-config.mjs` before
generating photos. The first local `npm run dev` or `npm run build` copies the defaults
(merged with `CONFIG_PATH` when present) into SQLite and records `migrated_at`, just
as Docker does on its first boot. `npm run generate` can also perform this first migration.
Later runs skip migration; databases already saved by the admin are also preserved.
Once SQLite contains owner
settings, it takes precedence over the persisted JSON. From then on, the defaults file
only fills keys the database lacks; editing an existing default value will not change
the saved setting. Change settings in the admin, or reseed by stopping Phos and removing
`config/site.db` (Docker: `/config/site.db`). The next run seeds a new database from
defaults and any `CONFIG_PATH` file, so remove that file too if you want only defaults.
Removing the database also removes saved galleries and plugin settings.
`npm run check` does not run migration or config sync and does not create `config/site.db`.

When upgrading a checkout where the old sync wrote owner settings or SMTP credentials
into tracked files, first confirm those settings are present in the admin. Then restore
the tracked defaults with `git restore src/content/site-config.json` and delete
`public/site-config.json`. The next check or build recreates a public copy with SMTP removed.
The theme writer warns if the tracked defaults still contain an SMTP user or password.

When upgrading a Git checkout, the old generator may have left local modifications in
the tracked `src/content/categories.json` and `src/content/galleries.json`. These can
make `git pull` abort. Before pulling this change, run
`git checkout HEAD -- src/content/categories.json src/content/galleries.json` to discard
those generated changes (they are regenerated, so there is nothing to keep). After pulling, run
`npm run generate` to create the manifests at their new paths under `src/generated/`.

Admin saves update SQLite, the generated build input, and the stripped public copy.
Astro dev can pick up the generated input immediately. Use the admin's **Republish site** action
to publish changed settings to static pages; it runs `npm run build`, which syncs
the generated input from SQLite before building.

On the next generator run, a legacy `public/photos/.cache.json` moves to the resolved
cache path if that destination does not exist (including across volumes). If both
files exist, the generator keeps the destination and removes the legacy public cache.
Keep the cache outside `public/`; public `site-config.json` omits the entire SMTP block.

The photo pipeline keeps 400/800 px thumbnails and a WebP ladder at
1100/1600/2200/2880/3840 px, plus the same AVIF ladder for selected heroes.
Ladder widths are capped by the oriented source and the 3840 px maximum edge.
Walk the ladder in ascending order and encode a tier only when its capped width is
strictly greater than the previous encoded width. Keep the first tier reaching the
source bound and skip subsequent duplicate widths. This deliberately keeps every
pixel: a 2201 px wide source whose maximum edge is within 3840 px encodes a 2201 px
`w2880` tier after the 2200 px `immersive` tier, even though it adds only 1 px.
Manifest URLs resolve to existing files, and responsive srcsets retain the same
candidate widths. Legacy duplicate tiers from earlier runs are kept until the source
changes; replacing a source removes obsolete tier files before encoding its new ladder.

The home page immersive gallery is a server-rendered photo collage that flies past the
viewer as they scroll, then reveals an optional eyebrow and tagline against seeded,
theme-aware stars. Depth follows each photo's stacking order: front photographs pass first.
The stage is one viewport tall and stays pinned while the page scrolls 200lvh by default;
existing saved section order is preserved.

Configure `home.immersiveGallery` with `enabled`, `text`, `eyebrow`, `mobilePhotos`,
`mobilePositions`, `desktopPhotos` and `desktopPositions`. `intensity` accepts `dramatic`
(default), `balanced` or `subtle`; `scrollLength` accepts `short` (140lvh), `standard`
(200lvh, default) or `long` (260lvh); `atmosphere` accepts `stars` (default), `vignette` or
`none`. Photos and positions stay paired per device. Missing positions use the shared
defaults, a zero-width/zero-height position hides that photo on that device, and empty device
layouts have no runway. The live scene shows the front six photos on mobile and eight on desktop. Text is displayed as stored; the admin warns about placeholder copy
instead of hiding it. Fresh installs enable the gallery with the default tagline and place
it second on the home page.

The engine uses sampled CSS transform/opacity keyframes and native scroll timelines where
supported (Chromium, Safari 26). Other modern browsers scrub the same keyframes with a small
`requestAnimationFrame` fallback. Responsive image candidates come from the manifest, stay at
or below 2200w (1100w on the mobile scene), and upgrade only after decoding; Save-Data keeps
the first rendition. The public scene needs no client island or Framer Motion.
Reduced-motion and JavaScript-disabled browsers receive the same composed still collage
with readable copy below it, and print collapses the runway.

In the admin, **Home → Immersive gallery** controls visibility, tagline, optional eyebrow,
and the gallery's Feel (intensity, scroll length, atmosphere). The status pill reads Off,
Needs desktop photos, Mobile empty, Placeholder tagline or Live. The layout editor previews
the scroll with the same motion model as the public page, orders depth by stacking order
(front photos pass first; renumbering happens only on explicit moves), can hide a photo on
mobile, copies a mobile layout to desktop with aspect-aware conversion, and discards a draft
reliably. The server validates `home.immersiveGallery` only when a save includes it. An
unchanged legacy tagline or eyebrow over the length limit, or an unchanged photo list over
24 entries, is tolerated so it never blocks an unrelated save.

Run `npm test` for tests or `npm run check:full` to build and run all checks. The latter
uses `scripts/check-full.mjs` and works on Windows too; coordinate builds in a shared checkout.
It defaults an unset `PUBLIC_SITE_URL` to `https://phos.test` for OG checks; that verification
dist is not deployable. Rebuild with your actual public URL before deployment.

On a fresh clone, `npm run check` bootstraps the generated config, plugin stub,
empty photo manifests, and theme files. `npm run build:site` does the same. Before invoking
`tsc` or `astro check` directly, run `node scripts/write-active-theme.mjs` once.
`npm run dev`, `npm run build`, and `npm run generate` also discover installed plugins;
the empty bootstrap manifest never replaces an existing one. Plugin discovery may read
SQLite for installed admin plugins.

Plugin discovery merges each plugin's JSON configuration with SQLite overrides for
admin-enabled plugins. The generated `src/generated/plugins.mjs` contains build-time
configuration and must not be imported into browser code. Phos renders plugin entries
without hydration directives. If a plugin creates a `client:*` island, pass only explicitly
selected public values: Astro serializes island props into public HTML, so forwarding the
complete configuration can expose credentials. Anything a plugin renders or ships to the
browser is public: island props, `define:vars`, attributes, or a client script importing its
own config. Discovery warns about secret-looking config keys.

The admin includes a Portfolio page for the galleries-index metadata (page description and
Open Graph title/description). Precompressed `.gz` siblings are served only through
`gzip_static` and are not directly downloadable.

## Images
**Admin page** `/admin`
<p align="center">
  <img width=1080 src="assets/admin_page.png"/>
</p>

