# Immersive gallery

## Overview

The home page immersive gallery is a server-rendered photo collage that flies past the viewer as
they scroll, then reveals an optional eyebrow and tagline against seeded, theme-aware stars. Depth
follows each photo's stacking order: front photographs pass first. The stage is one viewport tall
and stays pinned while the page scrolls 200lvh by default; existing saved section order is
preserved.

## Configuration

Configure `home.immersiveGallery` with these keys:

| Key | Values |
| --- | --- |
| `enabled` | `true` / `false`. Fresh installs enable the gallery and place it second on the home page. |
| `text`, `eyebrow` | Tagline (up to 280 characters, best under 90) and optional eyebrow. Text is displayed as stored; the admin warns about placeholder copy instead of hiding it. |
| `intensity` | `dramatic` (default), `balanced` or `subtle`. |
| `scrollLength` | `short` (140lvh), `standard` (200lvh, default) or `long` (260lvh). |
| `atmosphere` | `stars` (default), `vignette` or `none`. |
| `mobilePhotos`, `mobilePositions`, `desktopPhotos`, `desktopPositions` | Per-device photo keys (`category/filename`) and paired positions. |

Photos and positions stay paired per device. Missing positions use the shared defaults, a
zero-width/zero-height position hides that photo on that device, and empty device layouts have no
runway. The live scene shows the front six photos on mobile and eight on desktop.

## Engine and browser support

The engine uses sampled CSS transform/opacity keyframes and native scroll timelines where
supported (Chromium, Safari 26). Other modern browsers scrub the same keyframes with a small
`requestAnimationFrame` fallback. Responsive image candidates come from the manifest, stay at or
below 2200w (1100w on the mobile scene), and upgrade only after decoding; Save-Data keeps the first
rendition. The public scene needs no client island or Framer Motion. Reduced-motion and
JavaScript-disabled browsers receive the same composed still collage with readable copy below it,
and print collapses the runway.

## Admin

**Home → Immersive gallery** controls visibility, tagline, optional eyebrow, and the gallery's
Feel (intensity, scroll length, atmosphere). The status pill reads Off, Needs desktop photos,
Mobile empty, Placeholder tagline or Live.

The layout editor previews the scroll with the same motion model as the public page, orders depth
by stacking order (front photos pass first; renumbering happens only on explicit moves), can hide
a photo per device, copies a mobile layout to desktop with aspect-aware conversion, and discards a
draft reliably.

The server validates `home.immersiveGallery` only when a save includes it. An unchanged legacy
tagline or eyebrow over the length limit, or an unchanged photo list over 24 entries, is tolerated
so it never blocks an unrelated save.
