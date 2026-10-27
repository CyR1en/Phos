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
integrator. The dist smoke suite skips its built-output group when `dist/` is absent; source guards still run. When
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
| `reveals.runtime.test.mjs` | Computed easing tokens and literal fallback passed to WAAPI; SmoothScroll readiness on every init, section visibility, 900ms/120ms header staggering, reduced motion, three swaps and reveal-timeout visibility; PhotoGrid pending opt-in/order, backwards fill, 300ms stagger cap, reduced motion/no IO/timeout, observer cleanup and pending removal before a throwing animate call. |
| `theme.runtime.test.mjs` | BaseLayout first-statement `js`, exact 4000ms reveal failsafe, readiness suppression, timer replacement across three swaps and incoming-root timeout carryover only before readiness; mode bootstrap/current-root preparation with blocked storage, skip-link focus, destination-based preview gating, public zero-fetch behavior, parser-time stylesheet order, parent theme, config updates and one fetch per navigation; ThemeToggle cycle/labels/storage/colors, silent-on-load live status, View Transition ready/finish/rejection/overlap and direct reduced-motion fallback. |
| `motion.runtime.test.mjs` | Shared `easing(name)` trims and caches all four tokens independently; missing, throwing, whitespace-only and CSS.supports-rejected values use cached literal fallbacks. Explicit read counters detect re-reads even when motion.ts catches a reader exception. Fresh module instances isolate cache cases. |
| `merge-config.test.mjs` | Admin/SQLite versus persisted JSON precedence, portfolio-only config round-trip and owner marker, SMTP serialization, generated DEST with unchanged defaults, noncanonical byte-for-byte bootstrap, empty photo-manifest bootstrap byte-equal to an isolated generator run and existing-manifest byte/mtime preservation, owner-preserving schema merge/default fill, unchanged-config mtime, matching empty plugin stubs, defaults credential warnings and migration no-op/skip. A sandboxed admin login/GET/PUT checks no-store, normalized generated config, atomic replacement and public stripping; its server is killed on every path. |
| `config-hygiene.test.mjs` | Read-only Git checks for tracked defaults, untracked public/generated config and photo manifests, and effective check-ignore rules; Git checks clearly skip outside a work tree. All four manifest consumers import generated files, with a recursive source guard against content-manifest imports. Docker excludes config/generated/test/AppData/env inputs and has no negations; migration precedes generation. |
| `atomic-write.test.mjs` | Injected rename failures for EPERM/EBUSY/EACCES: success after two retries, bounded attempts and exact last-error propagation, default five attempts, immediate rejection of other errors, old-destination preservation and temporary-file cleanup. All destinations live under `os.tmpdir()`. |
| `admin-fields.test.mjs` | TSX source contracts for native input/password/autocomplete/ignore-attribute forwarding, SMTP numeric port bounds and email types, and PluginsPage API-key password inference before textarea handling; the actual secret-key predicate is bundled. Portfolio page field bindings, sidebar/dashboard routing, boolean `flushSave` validation and republish gating. |
| `flush-callsites.test.mjs` | Boolean save gates for republish, navigation, sign-out, category save/switch and immersive layout save; rejected mutations, edit-version checks and dirty-ref refetch protection. |
| `immersive-sources.test.mjs` | Server scene integration, executed home frontmatter with missing manifest photos and parallel device positions, independent Selected work fallback, verbatim Lorem tagline, immersive-second fresh layout, shared motion imports and no framer dependency/UI imports or constructed photo variant paths. |
| `immersive-motion.test.mjs` | Pure bundled motion constants; SPEC fade crossings and size-guard values; default/synthetic natural fades before .80 with keyframe and continuity checks; .90·L scale cap with growth just before invisibility; default/partial layouts, hidden/top-z rank selection, viewport-centred geometry; PostCSS-parsed photo/copy/eyebrow/stars/vignette/exit/plane keyframes; STAGE/crop width factors and device caps. |
| `immersive.runtime.test.mjs` | Current zero-import enhancement: native versus fallback scrolling, clamped progress/exit, ready marker, 100% IO warm-up, decode-before-sizes upgrade, Save-Data, three swaps with listener/observer cleanup, cancellation of an explicitly pending scroll rAF and late decode isolation; hidden-device probe exclusion; reduced motion on/off and upgrade suppression; fine-pointer, coarse-pointer and pre-.5 parallax branches; moving flags and bounded vignette copy parallax. |
| `immersive-admin.test.mjs` | Path-specific schema bounds, enums/shapes/photo uniqueness/count and partial/null/short settings; server validation wiring; Home card/ObjectField ownership; executed TSX render trees check the native textarea, / 280 counter, placeholder notice and status precedence; executed layout saves and pure snapshots retain unknown settings and literal depths; depth tie groups, typed ranks, numeric canvas/STAGE geometry, crop transforms and independent nudges. Source regex-checks cover beforeunload, labels, dialogs and Add Photo wiring; HTTP PUT validation cases run in the existing merge-config sandbox. |
| `build-fixtures.test.mjs` | Opt-in isolated Astro builds with default and saved per-device layouts. Assert server scene markup, inline zero-import module, scene CSS and no gallery island; compare every saved inline geometry property with frameStyle and resolve every image/srcset URL on disk. Skipped by default. |
| `plugins.test.mjs` | Every Astro script block and src JS/TS module respects the build-time manifest boundary; directive keys are filtered before spreading props. Sandboxes scan every regular file for private sentinels, load colliding/digit-leading/quoted names and entry paths, and check secret-key warnings without printing values. |
| `og.test.mjs` | Pure bundled OG resolver: configured/absolute/home-pass-through images, explicit versus automatic hero alt, OG/full dimensions, page gallery alt isolation and empty fallback. BaseLayout source guard connects first-hero/configured-OG inputs and the resolver's alt to `og:image:alt`, independent of sample data. |
| `pipeline.test.mjs` | Synthetic sharp images, oriented dimensions/pixels, responsive descriptors, P3-to-sRGB conversion, ICC/alpha preservation, original copies, blur, metadata, galleries, caches/backfill/pruning, distinct-width WebP and hero-only AVIF ladders, skipped file/cache absence, existing HD/immersive fallback URLs, exact 2000×1333 and 6000×4000 ladders, no-upscale crops, CSS focus offsets, OG images, config-sync isolation and unreadable-DB preservation; generated photo manifests with hero-only `heroSrc`; generated-config hero precedence, unchanged defaults and fallback when the generated file is absent; default/explicit cache paths, legacy migration and duplicate-cache cleanup with single log lines; direct immutable SMTP-block stripping. |
| `dist.smoke.test.mjs` | Build freshness, generated photo manifests with hero-only `heroSrc`, and generated/default build-config selection; public/admin palettes and dependencies; generated-config conditional immersive markup, no gallery island, recursive public asset graph excluding framer; hero loading/sources; HD tiles/prefetch/compression/photo references; layout/dialog/JSON; skip-link placement/CSS, form/control name heuristics, browser colors, mandatory hero/config OG fallback with PUBLIC_SITE_URL diagnostics, Twitter/OG equality, alt provenance and dimensions, route canonical/og:url equality, noindex 404 and admin-free sitemap, matched fixture behaviour attributes/nesting, no-JS visibility and reveal-timeout CSS gates, canvas/light scheme, motion tokens and root/header transitions; centralized source easing, fine-pointer service hover with keyboard equivalents; all-asset SMTP scans, raw/default/generated/@lib/config TSX imports, server-level nginx gzip URL denial before locations with gzip_static retained, error routing, exact 404/public header-map equality including CSP, and recursive Docker snippet coverage. The gzip source guard runs even without a build. Astro redirect stubs are checked separately. |
| `contrast.test.mjs` | Actual light/dark gallery theme text, muted, subtle and error colors on base/surface backgrounds meet 4.5:1 WCAG AA contrast. |
| `helpers/immersive-contracts.mjs` | PostCSS checks for the gallery-specific timeline gate, absence of resetting animation shorthands, 767/768 device display mapping, per-layer keyframes in the correct device media, exact default/saved geometry and STAGE transform; JS opacity gate, reduced-motion/print/noscript collapse declarations. These inspect emitted markup/CSS rather than render a browser. |
| `helpers/bundle.mjs` | Bundles current TypeScript modules and selected processed `.astro` scripts with esbuild, resolving component-relative imports; cached per worker, with optional fresh module instances for cache tests. Any script attribute except `src` selects inline JavaScript (Astro semantics), which is transformed without bundling. Self-closing external scripts cannot swallow the following block. Extracted scripts run in strict mode. No dist chunks or generated bundle files. Missing esbuild errors say `npm i -D esbuild`. |
| `bundle.test.mjs`, `smoke-helpers.test.mjs` | Script extraction/strict mode; negative fixtures for accessible names, fixture drift, reveal-root compounds and raw/plugin imports; nginx direct directives/header values and Docker glob coverage. |
| `helpers/accessibility.mjs`, `helpers/fixture-contracts.mjs`, `helpers/nginx.mjs`, `helpers/source-contracts.mjs` | Small name/label heuristics, element-matched behaviour/nesting assertions and nginx block/Docker copy readers; no accessibility-tree or computed-layout claims. |
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
Both use simulated time; the default suite should stay below roughly 20 seconds.

## Component fixtures and shared contracts

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
The CSS bezier count covers public stylesheets; a separate source check prevents
literal curves in Astro components/pages/layouts and scripts unless the same line
references an `--ease-` token. `motion.ts` owns shared JavaScript fallback curves.
Header Escape cases include Safari/iOS-style
clicks without button prefocus: native noncancelable Escape may restore `body`.
Cancelable Escape and close-button cases separately verify the script's own
`menuBtn.focus()` call so the fake browser cannot mask a missing restore path.

In a shared checkout, run without rebuilding other agents' work:

```sh
PHOS_ALLOW_STALE_DIST=1 node --test tests/
```

When current source or stale dist does not yet satisfy an agreed shared contract,
put `{ todo: 'W: <contract>' }` on that individual test. Its assertion still executes
and reports its failure without making the suite fail. Remove the option once the
source lands or the integrator rebuilds. No TODO markers are outstanding; the suite
reports `todo 0`. Template regressions in the immersive component (for example an
`animation` shorthand) are caught by the dist and fixture tests, so run `npm run check:full`
after editing it. `PHOS_ALLOW_STALE_DIST=1` only relaxes build freshness, not the
scene, dependency, geometry or gzip checks. OG checks require an image when the
manifest has a hero or `site.og.image` is configured. They skip only when neither
exists and the page has no image. Build with `PUBLIC_SITE_URL=https://phos.test`
for these checks.

The shared-checkout command permits stale dist and does not validate a fresh build.
Regenerate real photo manifests and rebuild before using `check:full` to validate
fresh output. Git hygiene checks enforce that the old `src/content/` photo manifests
are untracked.

## Opt-in build fixture

Run the immersive-gallery build regression separately:

```sh
PHOS_BUILD_FIXTURES=1 node --test tests/build-fixtures.test.mjs
```

It copies the checkout to a temporary directory, excluding `node_modules`, `dist`,
`public/photos`, `.git`, `config` and `AppData`. Dependencies are copied with APFS
`cp -cR` (falling back to `cp -R`); a dependency symlink breaks Astro's metadata.
It refreshes the copied generated JSON and symlinks `public/photos` for read-only
reference checks. The fixture enables the gallery with the first six manifest keys and a verbatim Lorem tagline,
then runs two builds (default positions and distinct saved mobile/desktop positions) with `PHOS_SKIP_CONFIG_SYNC=1 PUBLIC_SITE_URL=https://phos.test npx astro build`
with a 240-second timeout per build. Both builds must emit the server scene with an inline
enhancement and keyframes, native/fallback/reduced-motion CSS and no gallery island.
Every image and srcset candidate must exist, mobile/desktop srcsets must stay within 1100w/2200w, and the img must carry its LQIP. Both default and saved layer geometry must equal `frameStyle(pos)` and an independent numeric geometry oracle. The short runway must contain 140lvh and balanced keyframes must peak within 1% of 2.5491. Cleanup runs
after success or failure. The real checkout is never built or generated into.

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
generator and its `lib/atomic-write.mjs` dependency, installs a test-only merge-config
execution tripwire, and symlinks only `node_modules`. The real merge-config is never copied. All inputs,
SQLite data, config, cache and generated outputs live in that directory. Cleanup
runs through `t.after()` on success or failure. It never generates into the checkout's
`public/photos`, `src/content` or `src/generated`. A `sharp` load failure **fails** by default because
the real generator requires sharp. `PHOS_ALLOW_NO_SHARP=1` is the explicit opt-out
for environments that cannot install it; the skip message includes the load error.
`PHOS_SKIP_CONFIG_SYNC=1` keeps the synthetic configuration intact, and the
tripwire verifies merge-config was never executed.
The synthetic hero selection lives under `src/generated/`; conflicting tracked
defaults prove generated-config precedence. The tiny cache fixture removes that
file to exercise the `src/content/` fallback without re-encoding the full matrix.

Update the constants at the top of `pipeline.test.mjs` with a deliberate generator
contract change: `CACHE_VERSION`, `MAX_EDGE`, `TIERS`, `STAGE_TIERS`, `GRID_TIERS`,
`COVER_TIERS`, `PORTRAIT_SIZES`, `OG_SIZE`, and `THUMB_ENCODINGS`. Tier-dependent
assertions cover dimensions and cache entries, ICC/pixel/alpha checks, srcset
candidate widths, per-photo regeneration output counts, and encoding controls.
The HD backfill scenario specifically tests deletion of the `hd/` directory. Only
`a-landscape.jpg`, `e-orientation3.jpg`, `j-panorama.jpg` and `gradient.png` in this
fixture encode HD: the other sources reach their cap at an earlier tier. A poisoned
HD cache entry on the 2000px oriented portrait must be removed without encoding it.
An encoded landscape HD entry is also poisoned to 1×1; backfill must restore its
actual source dimensions. Replacing the five-tier gradient hero with a smaller blue
source runs twice and checks removal of obsolete WebP/AVIF files and cache entries,
new srcset widths, fallback URLs and new pixels. A seeded Phase 6 duplicate ladder
keeps its bytes, mtimes and cache entries, with HD resolving to the first tier at
the largest width.
The final cache-path probes use a 64×40 synthetic image and a DB in a separate
directory, with `PHOTOS_CACHE_PATH: ''`. They verify default placement and moving
`public/photos/.cache.json` while preserving cache JSON and generated image mtimes,
exactly one migration log, explicit overrides, and removal/logging when both cache
paths exist. The temporary root is canonicalized so macOS `/var` aliases agree with
subprocess log paths. All preceding fidelity scenarios retain their explicit cache path unchanged.

The tests track cache version 2, 400/800 thumbnails, 1100/1600/2200/2880/3840 WebP
stage tiers and AVIF stage tiers per selected hero. Each ladder encodes only distinct
capped widths, keeping the first tier reaching a width; later duplicate tiers have
neither files nor cache entries. The space-containing 2000×1333 source encodes
1100/1600/2000; the 6000×4000 gradient encodes all five widths. HD/immersive URLs
resolve to an existing tier, while srcsets remain deduped. Tests also cover 860×1333 and 1290×2000 hero crops
only when they do not upscale, and 1200×630 OG images for heroes/gallery covers.
Photo manifests live under `src/generated/`. Category photos expose neither
`srcsetAvif` nor `heroSrc`; selected heroes expose `heroSrc`, and categories do not expose `coverOg`.
A 6000×4000 gradient with a marker square verifies `34% 50%` crop placement to one
pixel. Backfill checks preserve WebP mtimes, deselection prunes hero-only assets,
and an unreadable DB preserves the gallery manifest and its referenced assets.
Pipeline diagnostics report the copied generator SHA256 and timings, so a
concurrent source change can be identified precisely.
