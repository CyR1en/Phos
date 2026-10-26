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
compresses the site with `PHOS_SKIP_CONFIG_SYNC=1` before running `check`. It defaults
`PUBLIC_SITE_URL` to `https://phos.test` so OG checks run; an explicit URL is honored. You can also
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
| `header.runtime.test.mjs` | Drawer cases A–J: focus/top layer, two-frame opening, Escape/fallback/transition close, reduced motion, outside pointerdown geometry, synthetic/in-panel clicks, router clicks, three swaps, native and queued close races, with/without button prefocus, explicit focus restoration, immediate after-preparation close and hero-overlay observer geometry; desktop/drawer Contact fixture contract. |
| `hero.runtime.test.mjs` | First-load decode/reveal, sources-before-img warming, idle/1500ms fallback, autoplay/crossfade finish and fallback, credit/roles/dots, hover/focus/visibility/offscreen/user pause, pointer/initial focus, decode-pause and rapid-dot races, credit hidden state, reduced motion and swap cleanup. |
| `reveals.runtime.test.mjs` | SmoothScroll section visibility and one-time 900ms/120ms header staggering, immediate reduced-motion headers, three swaps; PhotoGrid pending opt-in, reveal order, backwards fill, 300ms delay cap, reduced motion/no IO and observer cleanup. |
| `theme.runtime.test.mjs` | BaseLayout first-statement `js`, mode bootstrap/current-root preparation with blocked storage, skip-link focus, destination-based preview gating, public zero-fetch behavior, exact preview gating, parser-time stylesheet order, parent theme, config updates and one fetch per navigation; ThemeToggle cycle/labels/storage/colors, silent-on-load live status, View Transition ready/finish/rejection/overlap and direct reduced-motion fallback. |
| `pipeline.test.mjs` | Synthetic sharp images, oriented dimensions/pixels, responsive descriptors, P3-to-sRGB conversion, ICC/alpha preservation, original copies, blur, metadata, galleries, caches/backfill/pruning, WebP tiers, hero-only AVIF ladders, no-upscale crops, CSS focus offsets, OG images, config-sync isolation and unreadable-DB preservation; default/explicit cache paths, legacy migration and duplicate-cache cleanup with single log lines; direct immutable SMTP-block stripping. |
| `dist.smoke.test.mjs` | Build freshness; public/admin palettes and dependencies; hero loading/sources; HD tiles/prefetch/compression/photo references; layout/dialog/JSON; skip-link placement/CSS, form/control name heuristics, browser colors, non-vacuous OG checks, matched fixture behaviour attributes/nesting, no-JS tile/hero visibility, canvas/light scheme, motion tokens and root/header transitions; all-asset SMTP scans, raw TSX config import prevention and nginx/Docker security completeness. Astro redirect stubs are checked separately. |
| `contrast.test.mjs` | Actual light/dark gallery theme text, muted, subtle and error colors on base/surface backgrounds meet 4.5:1 WCAG AA contrast. |
| `helpers/bundle.mjs` | Bundles current TypeScript modules and extracts/transforms every selected `.astro` script block with esbuild, cached per worker. Any script attribute except `src` selects inline JavaScript (Astro semantics); attribute-free or src-only scripts use TypeScript processing. Self-closing external scripts cannot swallow the following block. Extracted scripts run in strict mode. No dist chunks or generated bundle files. Missing esbuild errors say `npm i -D esbuild`. |
| `bundle.test.mjs`, `smoke-helpers.test.mjs` | Script extraction/strict mode and regression checks for the accessible-name and fixture drift heuristics, plus nginx block ancestry and Docker glob coverage. |
| `helpers/accessibility.mjs`, `helpers/fixture-contracts.mjs`, `helpers/nginx.mjs` | Small name/label heuristics, element-matched behaviour/nesting assertions and nginx block/Docker copy readers; no accessibility-tree or computed-layout claims. |
| `world.test.mjs` | Finished WAAPI animations with `fill: 'both'` and `'forwards'` stay observable until cancelled; other fill modes disappear. |
| `helpers/world.mjs` | Minimal fake DOM, propagation/capture, history/router, image decode, WAAPI, pointer capture and View Transitions with a deterministic clock. |
| `helpers/dom.mjs`, `helpers/runtime.mjs` | Component fake DOM with HTML fixtures, modal focus/inert top layer and native Escape, mutation-order image/decode logging, deterministic timers/rAF/idle, manual IO/media queries, head writes, parent preview and controllable View Transitions. Restores global descriptors after every case; models root/head/body router swaps. |
| `helpers/context.mjs`, `helpers/scenario.mjs` | Shared module context and per-case cleanup/restoration of browser globals. |
| `scenarios/*.mjs` | Reusable scenario registrations; these are imported by the two lightbox test files. |
| `fixtures/*.html` | Hand-written component markup contracts, checked against corresponding built ids/hooks, selected behaviour attributes and runtime classes by the dist smoke suite. |

The fake DOM tests exercise application behavior, not a complete browser engine.
The morph module's four timeout cases intentionally exercise the real 1200ms cap;
the remaining animation and gesture time is simulated with `world.advance(ms)`.
Keep all runtime scenarios serial within each file: they temporarily install browser
globals. Node's normal test isolation runs different test files in separate processes.
There are deliberately two DOM models: the lightbox world has specialized geometry,
pointer capture/history and frame-driven animation, while the component DOM needs
HTML parsing, modal inertness/focus, head/parser ordering and idle/source mutation
tracking. Merging these would change the established lightbox model substantially.
Both use simulated time; the complete suite should stay below roughly 25 seconds.

## Component fixtures and pending shared contracts

Re-sync these fixtures when their component markup changes. They omit decorative
paths and most styling utilities; URLs, text and image counts are synthetic.

| Fixture | Markup mirrored |
| --- | --- |
| `fixtures/header.html` | Header sentinel, site header/nav, menu/close buttons and drawer links. Drawer nav is labelled Mobile; the header carries transition-scope presence. The optional Galleries link is included. |
| `fixtures/hero.html` | Hero section, three eager/deferred picture slides, dots, pause control and credit. The third slide makes warming order observable. |
| `fixtures/reveals.html` | Page sections and headers consumed by SmoothScroll, with three/two children for staggering. |
| `fixtures/photo-grid.html` | PhotoGrid wrapper and photo anchors/images, including scoped-style attribute presence; pending hiding is runtime-only. |
| `fixtures/theme-toggle.html` | Toggle button, sun/moon/auto SVG ids, and an initially empty sr-only polite status span; root mode controls icon display. |
| `fixtures/head.html` | BaseLayout color metadata, config bindings and bundle stylesheet. `<!-- bootstrap -->` marks where to execute the actual source inline script during parsing. |
| `fixtures/preview-bindings.html` | First-body skip link, focusable main, and Hero heading binding for public/preview `data-config` behavior. |

The smoke drift guard matches fixtures to the corresponding built element by id,
component hook or a scoped child selector. It compares the presence and static
values of `type`, `role`, `tabindex`, `aria-*`, `autofocus`, `open`, `hidden`,
`inert`, and `data-astro-*` attributes in both directions, plus runtime classes.
Generated Astro style hashes and transition-scope values are compared by presence;
the reveal fixture projects its synthetic repeated header shape to the home instance.
configurable accessible labels, text/URLs and optional repeated photo/gallery counts
are not value-equality assertions. A link's route-dependent `aria-current="page"`
(including the Contact pill) is allowed. Nesting checks keep the drawer close button
inside its dialog, hero controls/credit inside the carousel, and the skip link first
in the body. This is a selected behaviour contract, not an all-attributes comparison.

The name heuristic ignores `aria-hidden="true"` text, accepts `aria-labelledby`
and image alt names, and requires form controls to have a `label[for]`, `aria-label`
or `aria-labelledby`. It does not implement the browser accessibility tree.
The CSS bezier count covers public stylesheets only; WAAPI easing literals in
JavaScript are outside that check. Header Escape cases include Safari/iOS-style
clicks without button prefocus: native noncancelable Escape may restore `body`.
Cancelable Escape and close-button cases separately verify the script's own
`menuBtn.focus()` call so the fake browser cannot mask a missing restore path.

In a shared checkout, run without rebuilding other agents' work:

```sh
PHOS_ALLOW_STALE_DIST=1 node --test tests/
```

When current source or stale dist does not yet satisfy an agreed shared contract,
put `{ todo: 'X: <contract>' }` on that individual test, replacing `X` with the
owning fixer's name (for example `X1`). The assertion still executes and reports
its failure without making the suite fail. Remove the option after the source
lands or the integrator rebuilds; keep the assertion. Existing satisfied checks
have no placeholder wrapper. Pages without `og:image` explicitly skip OG assertions
with `no og:image: build with PUBLIC_SITE_URL`; rebuilding with a site URL activates
them.

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
The final cache-path probes use a 64×40 synthetic image and a DB in a separate
directory, with `PHOTOS_CACHE_PATH: ''`. They verify default placement and moving
`public/photos/.cache.json` while preserving cache JSON and generated image mtimes,
exactly one migration log, explicit overrides, and removal/logging when both cache
paths exist. The temporary root is canonicalized so macOS `/var` aliases agree with
subprocess log paths. All preceding fidelity scenarios retain their explicit cache path unchanged.

The tests track cache version 2, 400/800 thumbnails, 1100/1600/2200/2880/3840 WebP
stage tiers, five AVIF files per selected hero, 860×1333 and 1290×2000 hero crops
only when they do not upscale, and 1200×630 OG images for heroes/gallery covers.
Category photos do not expose `srcsetAvif`, and categories do not expose `coverOg`.
A 6000×4000 gradient with a marker square verifies `34% 50%` crop placement to one
pixel. Backfill checks preserve WebP mtimes, deselection prunes hero-only assets,
and an unreadable DB preserves the gallery manifest and its referenced assets.
Pipeline diagnostics report the copied generator SHA256 and timings, so a
concurrent source change can be identified precisely.
