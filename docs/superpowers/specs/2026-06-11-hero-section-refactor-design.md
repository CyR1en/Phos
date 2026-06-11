# Hero Section Refactor — Design Spec

**Date**: 2026-06-11
**Status**: Approved
**Scope**: `Hero.astro`, `index.astro`, `site-config.json` defaults

## Goal

Refactor the homepage hero to be more photography-focused. The photo should dominate; text should support. The current dark full-frame overlay and large typography compete with the imagery. This redesign lets the photo lead.

## Design Summary

**Direction**: Immersive Cinema — full-bleed photo slideshow with minimal text layered at the bottom over a tight gradient. The photo occupies ~65% of the viewport with zero overlay. Text lives in the lower ~35% behind a bottom-anchored gradient for legibility.

## Visual Spec

### Gradient

- Replace full-frame gradient with a bottom-only gradient:
  ```
  linear-gradient(to top,
    rgba(0,0,0, overlay_opacity) 0%,
    rgba(0,0,0, overlay_opacity * 0.6) 20%,
    rgba(0,0,0, overlay_opacity * 0.1) 38%,
    transparent 45%
  )
  ```
- Controls: `overlay_opacity` from admin (same config key, same 0–1 range, default ~0.7)
- Effect: ~65% of the photo (top portion) has zero overlay, showing the image unmuted

### Typography

| Element | Before | After |
|---------|--------|-------|
| Name label | ~12px mono, 70% white | ~11px mono, 60% white (subtler) |
| Heading | `clamp(48px, 8vw, 96px)` | `clamp(36px, 5vw, 64px)` |
| Subheading | Displayed on hero | **Removed from hero** — moved below or hidden |

### CTAs

- **Primary** (Portfolio): solid white pill on dark gradient (`bg-canvas`). Full contrast.
- **Secondary** (Contact): ghost — border-only, transparent fill, white text.
- **Desktop**: side-by-side, `gap: 0.6rem`
- **Mobile**: stacked vertically, full-width

### Subheading

- Removed from `Hero.astro`.
- If `config.home.hero.subheading` is non-empty: render as a short intro section directly below the hero in `index.astro` (centered, max 2–3 lines, muted text).
- If empty: nothing renders. No empty space.

### Slideshow & Dots

- Unchanged: auto-rotate (interval from config), pause on hover, dot navigation.
- Dots: subtle thin bars. Active = white, inactive = 35% white.

### Parallax

- Unchanged: Lenis-driven parallax on the background layer. Disabled for `prefers-reduced-motion` and low-end devices (existing behavior).

## Files Changed

| File | Change |
|------|--------|
| `src/components/Hero.astro` | New gradient, smaller heading, remove subheading, mobile CTA stacking |
| `src/pages/index.astro` | Add optional intro section for subheading below hero |
| `src/content/site-config.json` | Update `overlay_opacity` default comment (behavior change, same key) |

## Config Surface

No new config keys. Existing keys reused with changed visual behavior:

- `home.hero.heading` — unchanged
- `home.hero.subheading` — empty = hidden; non-empty = rendered below hero
- `home.hero.cta1` / `home.hero.cta2` — unchanged
- `home.hero.overlay_opacity` — now controls bottom gradient intensity (same range)
- `home.hero.slideshow_interval` — unchanged

## Fallbacks

- **No hero photos**: solid `bg-canvas` background. Text renders centered, fully legible.
- **Single photo**: slideshow and dots skip. Gradient and text unchanged.
- **Missing config**: all keys have defaults in `site-config.json`. No crash path.
- **Empty subheading**: no element rendered. No layout gap.
- **Reduced motion**: slideshow and parallax disabled (existing).
- **Low-end device**: parallax disabled (existing).

## Verification

- [ ] Desktop: photo is full-bleed, bottom gradient visible, text legible on light and dark test photos
- [ ] Mobile (< 640px): CTAs stack vertically, heading scales down, gradient covers text zone
- [ ] Slideshow: auto-rotate fires, dots navigate, hover pauses, resume on mouse-leave
- [ ] Admin: change `overlay_opacity` and `subheading` — verify hero updates
- [ ] Empty subheading: clear value in admin, verify no gap in hero
- [ ] No photos: remove all hero-priority photos, verify solid fallback renders
- [ ] Accessibility: `prefers-reduced-motion` disables animations, role/aria labels intact
