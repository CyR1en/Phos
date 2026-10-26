# Phos verification

Run from the repository root with the project's supported Node version (Node 26):

```sh
npm test
npm run check
```

`test` runs Node's built-in test runner. `check` runs `tsc --noEmit`, `astro check`,
then the same tests. **Fixers must keep `npm run check` green.** Add the regression
case with the fix, and update an expectation only when the intended contract changes.

Neither command builds the site or runs the content generator in the checkout.
To build fresh output and run all checks, use:

```sh
npm run check:full
```

`check:full` (`scripts/check-full.mjs`, so it also works on Windows) builds and
compresses the site with `PHOS_SKIP_CONFIG_SYNC=1` before running `check`. You can also
run `npm run build` separately. In a shared checkout, coordinate builds with the
integrator. The dist smoke test skips the whole file when `dist/` is absent. When
`dist/` exists, it **fails** if `dist/index.html` predates the newest file under
`src/`, and tells you to rebuild. `PHOS_ALLOW_STALE_DIST=1` explicitly bypasses
only that freshness assertion; every other built-output invariant still runs.
Use it for diagnosis, not to validate new source changes.

Run a focused file or named scenario while iterating:

```sh
node --test tests/lightbox.e2e.test.mjs
node --test tests/lightbox.modules.test.mjs
node --test --test-name-pattern='thumbnail is first paint' tests/lightbox.modules.test.mjs
node --test tests/pipeline.test.mjs
node --test tests/dist.smoke.test.mjs
```

| File | Coverage |
| --- | --- |
| `lightbox.e2e.test.mjs` | All 19 + 15 + 18 original regression cases, plus eight lifecycle cases; grouped into open/close/navigation, history/router, filters, reduced motion and teardown. Some of the original 15/18 cases test a focused module contract inside this suite. |
| `lightbox.modules.test.mjs` | Dialog, zoom, gestures, morph, history, navigation and loader factories, including races, decode errors, fallback behavior and listener cleanup. |
| `pipeline.test.mjs` | Synthetic sharp images, oriented dimensions/pixels, responsive descriptors, P3-to-sRGB conversion, ICC/alpha preservation, original copies, blur, metadata, galleries, caches/backfill/pruning, WebP tiers, hero-only AVIF ladders, no-upscale crops, CSS focus offsets, OG images, config-sync isolation and unreadable-DB preservation. |
| `dist.smoke.test.mjs` | Build freshness; one public palette/all admin palettes; public JS imports and CSS exclude heavy libraries; hero loading/sources; HD tiles; prefetch limits; compression timestamps; photo references; nginx image/HTML cache policy; OG crops; existing layout, accessibility, dialog and JSON invariants. Astro redirect stubs are checked separately. |
| `contrast.test.mjs` | Actual light/dark gallery theme text, muted, subtle and error colors on base/surface backgrounds meet 4.5:1 WCAG AA contrast. |
| `helpers/bundle.mjs` | Bundles and imports current TypeScript sources with esbuild (missing installation errors say `npm i -D esbuild`); caches each entry in memory per worker. No generated bundle files. |
| `world.test.mjs` | Finished WAAPI animations with `fill: 'both'` and `'forwards'` stay observable until cancelled; other fill modes disappear. |
| `helpers/world.mjs` | Minimal fake DOM, propagation/capture, history/router, image decode, WAAPI, pointer capture and View Transitions with a deterministic clock. |
| `helpers/context.mjs`, `helpers/scenario.mjs` | Shared module context and per-case cleanup/restoration of browser globals. |
| `scenarios/*.mjs` | Reusable scenario registrations; these are imported by the two lightbox test files. |

Not yet covered here: the Header drawer (focus, Escape, backdrop press semantics,
rebinding across navigations), hero warming order, SmoothScroll reveals and the
BaseLayout preview gating. Those behaviours are only verified by ad-hoc harnesses
so far; porting them (extract each `.astro` `<script>` block, transform it with the
already-present esbuild, run it against `helpers/world.mjs`) is the next addition.

The fake DOM tests exercise application behavior, not a complete browser engine.
The morph module's four timeout cases intentionally exercise the real 1200ms cap;
the remaining animation and gesture time is simulated with `world.advance(ms)`.
Keep lightbox scenarios serial within each file: they temporarily install browser
globals. Node's normal test isolation runs different test files in separate processes.

## Add a scenario

Add a named case to an appropriate `scenarios/*.mjs` registration, or create a new
`*.test.mjs` file. Use `node:test` and `node:assert/strict`, bundle the current source
with `bundle('src/scripts/lightbox/…ts')`, and use the shared fixtures instead of a
saved bundle or a new `/tmp` harness. For an orchestrator regression:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scenarios } from './helpers/scenario.mjs'
import { setup, openSettled } from './helpers/world.mjs'

const check = scenarios(test)
check('describe the trigger and expected result', async () => {
  const world = await setup({ vt: false })
  await openSettled(world, 1)
  world.lb().next()
  await world.advance(400)
  assert.equal(world.$('lightbox-counter').textContent, '3 / 8')
})
```

`scenarios` destroys controllers, settles pending fake work, and restores original
global property descriptors even when a case fails. Use manual decode mode and
explicit `resolve()`/`reject()` calls to reproduce network races deterministically.

## Pipeline isolation and tier changes

The pipeline test creates a unique directory with `os.tmpdir()`, copies the current
generator, installs a test-only merge-config execution tripwire, and symlinks only
`node_modules`. No real merge-config or `lib/` support files are copied. All inputs,
SQLite data, config, cache and generated outputs live in that directory. Cleanup
runs through `t.after()` on success or failure. It never generates into the checkout's
`public/photos` or `src/content`. A `sharp` load failure **fails** by default because
the real generator requires sharp. `PHOS_ALLOW_NO_SHARP=1` is the explicit opt-out
for environments that cannot install it; the skip message includes the load error.
`PHOS_SKIP_CONFIG_SYNC=1` keeps the synthetic configuration intact, and the
tripwire verifies merge-config was never executed.

Update the constants at the top of `pipeline.test.mjs` with a deliberate generator
contract change: `CACHE_VERSION`, `MAX_EDGE`, `TIERS`, `STAGE_TIERS`, `GRID_TIERS`,
`COVER_TIERS`, `PORTRAIT_SIZES`, `OG_SIZE`, and `THUMB_ENCODINGS`. Tier-dependent
assertions cover dimensions and cache entries, ICC/pixel/alpha checks, srcset
candidate widths, per-photo regeneration output counts, and encoding controls.
The HD backfill scenario specifically tests deletion of the `hd/` directory.

The tests track cache version 2, 400/800 thumbnails, 1100/1600/2200/2880/3840 WebP
stage tiers, five AVIF files per selected hero, 860×1333 and 1290×2000 hero crops
only when they do not upscale, and 1200×630 OG images for heroes/gallery covers.
Category photos do not expose `srcsetAvif`, and categories do not expose `coverOg`.
A 6000×4000 gradient with a marker square verifies `34% 50%` crop placement to one
pixel. Backfill checks preserve WebP mtimes, deselection prunes hero-only assets,
and an unreadable DB preserves the gallery manifest and its referenced assets.
Pipeline diagnostics report the copied generator SHA256 and timings, so a
concurrent source change can be identified precisely.
