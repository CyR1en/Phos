# Deployment

## Production (Docker)

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

### Volumes

| Volume | Container path | Purpose |
|---|---|---|
| `./AppData/photos` | `/photos` | Drop category folders here (e.g. `wildlife/`, `wedding/`) |
| `./AppData/config` | `/config` | Persists site-config.json and SQLite database across restarts |
| `./AppData/plugins/*` | `/app/plugins/*` | Optional: mount custom plugins from host |

### Container entrypoint

On each start: merge default config → migrate to SQLite → generate photos → discover plugins → build static site → start admin server (port 3001) and nginx (port 8080). The admin dashboard is available at `/admin` behind nginx.

## Local Development

```bash
npm install
ADMIN_PASSWORD=admin npm run dev
```

The `dev` script runs: discover plugins → generate photo content → start admin server (port 3001, proxied at `/api`) → launch Astro dev server (port 4321) with HMR.

Visit **`http://localhost:4321`**.

To regenerate content without building: `npm run generate`. For a full production build: `npm run build`.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ADMIN_PASSWORD` | Yes | `admin` | Password for the admin dashboard |
| `PUBLIC_SITE_URL` | No | `http://localhost:4321` | Public URL for canonical links and sitemap |
| `DB_PATH` | No | `config/site.db` | SQLite database path (set to `/config/site.db` in Docker) |
| `PHOTOS_SOURCE` | No | `/photos` | Directory containing category folders with photos |
| `ADMIN_PORT` | No | `3001` | Internal admin API server port |
| `CONFIG_PATH` | No | `src/content/site-config.json` | Persisted site configuration JSON path |
| `LISTEN_PORT` | No | `8080` | Nginx listen port inside the container |
| `PUID` | No | `1001` | User ID for volume permissions |
| `PGID` | No | `1001` | Group ID for volume permissions |
| `PUBLIC_ADMIN_BUILD_LOG` | No | `true` | Show live build terminal in admin on republish |
