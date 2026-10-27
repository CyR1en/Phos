# Configuration

## Files

`src/content/site-config.json` is the tracked defaults file. Scripts read it but never write
owner settings back into it. The merged build input is `src/generated/site-config.json`; it can
contain SMTP credentials and is gitignored.

`scripts/write-active-theme.mjs` copies the defaults there byte-for-byte when the generated file
is missing. For an existing file it preserves owner values, fills missing default keys and removes
keys outside the defaults schema, writing only when the bytes change. It also bootstraps a missing
plugin manifest with empty exports and creates empty photo manifests when they are missing, so
checks and direct `build:site` runs work without a database or photos.

The same script generates `src/generated/site-config.public.json` for the admin editor and
`public/site-config.json` for static hosts, both with the entire SMTP block removed. Both copies
are gitignored. `.dockerignore` excludes `config/`, `src/generated/`, `public/site-config.json`,
`tests/`, `AppData/` and `.env.*` from the image build context; Docker regenerates its build
config at startup from the defaults and the mounted owner data.

## SQLite migration and precedence

Local `dev`, `build` and `generate` commands run `scripts/migrate-config.mjs` before generating
photos. The first run copies the defaults (merged with `CONFIG_PATH` when present) into SQLite
and records `migrated_at`, just as Docker does on its first boot. Later runs skip migration, and
databases already saved by the admin are preserved.

Once SQLite contains owner settings it takes precedence over the persisted JSON. From then on the
defaults file only fills keys the database lacks; editing an existing default value does not
change a saved setting. Change settings in the admin, or reseed by stopping Phos and removing
`config/site.db` (Docker: `/config/site.db`). The next run seeds a new database from the defaults
and any `CONFIG_PATH` file, so remove that file too if you want only defaults. Removing the
database also removes saved galleries and plugin settings.

`npm run check` does not run migration or config sync and does not create `config/site.db`.

## Admin saves and republish

Admin saves update SQLite, the generated build input and the stripped public copy. Astro dev
picks up the generated input immediately. The admin's **Republish site** action runs
`npm run build`, which syncs the generated input from SQLite before building.

The admin includes a Portfolio page for the galleries-index metadata (page description and Open
Graph title/description). Precompressed `.gz` siblings are served only through `gzip_static` and
are not directly downloadable.

## Upgrading an older checkout

If an old sync wrote owner settings or SMTP credentials into tracked files, first confirm those
settings are present in the admin. Then restore the tracked defaults with
`git restore src/content/site-config.json` and delete `public/site-config.json`. The next check or
build recreates a public copy with SMTP removed. The theme writer warns if the tracked defaults
still contain an SMTP user or password.

The old generator may also have left local modifications in the tracked
`src/content/categories.json` and `src/content/galleries.json`, which can make `git pull` abort.
Run `git checkout HEAD -- src/content/categories.json src/content/galleries.json` before pulling
(they are regenerated, so there is nothing to keep), then `npm run generate` to create the
manifests at their new paths under `src/generated/`.

## Fresh clones and direct tool runs

`npm run check` and `npm run build:site` bootstrap the generated config, plugin stub, empty photo
manifests and theme files. Before invoking `tsc` or `astro check` directly, run
`node scripts/write-active-theme.mjs` once. `npm run dev`, `npm run build` and `npm run generate`
also discover installed plugins; the empty bootstrap manifest never replaces an existing one.

`npm run check:full` uses `scripts/check-full.mjs` and works on Windows too; coordinate builds in a
shared checkout. It defaults an unset `PUBLIC_SITE_URL` to `https://phos.test` for Open Graph
checks, so that verification dist is not deployable. Rebuild with your actual public URL before
deployment.
