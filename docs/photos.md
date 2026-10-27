# Photos

## Manifests

Photo manifests are generated at `src/generated/categories.json` and
`src/generated/galleries.json` by `scripts/generate-content.mjs` during `dev`, `generate` and
`build` (and at Docker startup before `build:site`). They are gitignored build inputs. The
generator writes both manifests atomically, so concurrent builds read complete JSON files. The
theme writer creates an empty manifest only when it is missing, using create-only writes that
preserve a concurrently generated manifest, so fresh clones can check or build without photos.

## Responsive ladder

The pipeline keeps 400/800 px thumbnails and a WebP ladder at 1100/1600/2200/2880/3840 px, plus
the same AVIF ladder for selected heroes. Ladder widths are capped by the oriented source and the
3840 px maximum edge.

The ladder is walked in ascending order and a tier is encoded only when its capped width is
strictly greater than the previous encoded width. The first tier reaching the source bound is
kept and later duplicate widths are skipped. This deliberately keeps every pixel: a 2201 px wide
source whose maximum edge is within 3840 px encodes a 2201 px `w2880` tier after the 2200 px
`immersive` tier, even though it adds only 1 px. Manifest URLs resolve to existing files, and
responsive srcsets retain the same candidate widths. Legacy duplicate tiers from earlier runs are
kept until the source changes; replacing a source removes obsolete tier files before encoding its
new ladder.

## Cache

The pipeline cache lives at `photos-cache.json` beside the resolved SQLite database (override with
`PHOTOS_CACHE_PATH`). On the next generator run, a legacy `public/photos/.cache.json` moves to the
resolved cache path if that destination does not exist, including across volumes. If both files
exist, the generator keeps the destination and removes the legacy public cache. Keep the cache
outside `public/`.
