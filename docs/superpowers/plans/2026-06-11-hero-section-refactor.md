# Hero Section Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the homepage hero to let the photo dominate — tight bottom gradient, smaller typography, subheading moved below hero.

**Architecture:** Three-file change. `Hero.astro` gets the visual overhaul (gradient, typography, CTA layout, subheading removal). `index.astro` gains an optional intro section that renders the subheading below the hero. `site-config.json` gets a comment update on `overlay_opacity`.

**Tech Stack:** Astro 6, Tailwind CSS v4

---

## File Map

| File | Responsibility | Change |
|------|---------------|--------|
| `src/components/Hero.astro` | Hero section component | Gradient, typography, CTA layout, remove subheading |
| `src/pages/index.astro` | Homepage route | Add intro section for subheading below hero |
| `src/content/site-config.json` | Config defaults | Update `overlay_opacity` comment |

---

### Task 1: Refactor Hero.astro — gradient, typography, subheading, CTAs

**Files:**
- Modify: `src/components/Hero.astro`

- [ ] **Step 1: Replace full-frame gradient with tight bottom-only gradient**

The gradient overlay `<div>` (currently around line 48) changes from a full-frame gradient to one that only covers the bottom ~35%.

**Find** (line 48):
```astro
<div class="absolute inset-0" style={`background: linear-gradient(to top, rgba(0,0,0,${overlayOpacity}) 0%, rgba(0,0,0,${overlayOpacity * 0.6}) 35%, rgba(0,0,0,${overlayOpacity * 0.2}) 70%, rgba(0,0,0,0) 100%);`} />
```

**Replace with**:
```astro
<div class="absolute inset-0" style={`background: linear-gradient(to top, rgba(0,0,0,${overlayOpacity}) 0%, rgba(0,0,0,${overlayOpacity * 0.6}) 20%, rgba(0,0,0,${overlayOpacity * 0.1}) 38%, rgba(0,0,0,0) 45%);`} />
```

- [ ] **Step 2: Reduce heading font size**

**Find** the `<h1>` style attribute (around line 57):
```astro
<h1 class="mt-6 font-display text-[var(--color-rose-pine-moon-text)] drop-shadow-sm" style="font-size: clamp(48px, 8vw, 96px); line-height: 1.05;" data-config="home.hero.heading">
```

**Replace with**:
```astro
<h1 class="mt-4 font-display text-[var(--color-rose-pine-moon-text)] drop-shadow-sm" style="font-size: clamp(36px, 5vw, 64px); line-height: 1.1;" data-config="home.hero.heading">
```

Note: `mt-6` → `mt-4` and `line-height: 1.05` → `1.1` for better readability at smaller size.

- [ ] **Step 3: Subdue the photographer name label**

**Find** the name `<p>` (around line 56):
```astro
<p class="font-mono text-xs uppercase tracking-wider text-[var(--color-rose-pine-moon-text)]/70" data-config="about.photographer.name">{config.about.photographer.name}</p>
```

**Replace with**:
```astro
<p class="font-mono text-[11px] uppercase tracking-wider text-[var(--color-rose-pine-moon-text)]/60" data-config="about.photographer.name">{config.about.photographer.name}</p>
```

`text-xs` (~12px) → `text-[11px]`, opacity `70` → `60`.

- [ ] **Step 4: Remove the subheading element**

Delete the subheading `<p>` entirely (currently around lines 60-62):
```astro
<p class="mt-6 max-w-2xl text-lg text-[var(--color-rose-pine-moon-text)]/80 leading-relaxed" data-config="home.hero.subheading">
  {config.home.hero.subheading}
</p>
```

- [ ] **Step 5: Make CTAs full-width on mobile**

**Find** the CTA container `<div>` (around line 63):
```astro
<div class="mt-10 flex flex-col items-start gap-3 sm:flex-row">
```

**Replace with**:
```astro
<div class="mt-8 flex flex-col gap-3 sm:flex-row sm:items-start">
```

And each `<a>` CTA button needs `w-full sm:w-auto` added:

**Find** primary CTA (around line 64):
```astro
<a
  href="/portfolio"
  class="inline-flex items-center rounded-pill bg-canvas px-6 py-3 text-sm font-medium text-ink hover:bg-canvas-alt transition-colors"
>
```

**Replace with**:
```astro
<a
  href="/portfolio"
  class="inline-flex items-center justify-center rounded-pill bg-canvas px-5 py-2.5 text-sm font-medium text-ink hover:bg-canvas-alt transition-colors w-full sm:w-auto"
>
```

**Find** secondary CTA (around line 71):
```astro
<a
  href="/contact"
  class="inline-flex items-center rounded-pill border border-[var(--color-rose-pine-moon-text)]/30 px-6 py-3 text-sm font-medium text-[var(--color-rose-pine-moon-text)] hover:bg-[var(--color-rose-pine-moon-text)]/10 transition-colors"
>
```

**Replace with**:
```astro
<a
  href="/contact"
  class="inline-flex items-center justify-center rounded-pill border border-[var(--color-rose-pine-moon-text)]/30 px-5 py-2.5 text-sm font-medium text-[var(--color-rose-pine-moon-text)] hover:bg-[var(--color-rose-pine-moon-text)]/10 transition-colors w-full sm:w-auto"
>
```

Changes: `px-6 py-3` → `px-5 py-2.5` (slightly more compact), added `justify-center` + `w-full sm:w-auto`.

- [ ] **Step 6: Commit**

```bash
git add src/components/Hero.astro
git commit -m "refactor: tighten hero gradient, reduce heading, remove subheading, full-width mobile CTAs"
```

---

### Task 2: Add intro section for subheading below hero

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Add conditional subheading section after the Hero component**

**Find** (around line 36):
```astro
<Hero heroPriority={heroPriority} />
```

**Replace with**:
```astro
<Hero heroPriority={heroPriority} />

{config.home.hero.subheading && (
  <section class="py-16 md:py-20">
    <div class="mx-auto max-w-2xl px-6 text-center">
      <p class="text-lg md:text-xl text-muted leading-relaxed">{config.home.hero.subheading}</p>
    </div>
  </section>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat: render hero subheading as intro section below hero"
```

---

### Task 3: Update site-config.json default comment

**Files:**
- Modify: `src/content/site-config.json`

- [ ] **Step 1: Update overlay_opacity comment to reflect new behavior**

**Find** (around line 26):
```json
"overlay_opacity": 0.75
```

**Replace with**:
```json
"overlay_opacity": 0.75
```
No value change — but the `page_description` for the home section can be updated to reflect the new behavior. This is documentation-only.

**Find** (line 17):
```json
"page_description": "Hero, services, portfolio, testimonials, and CTA sections",
```

No code behavior changes here — the config key is the same. The behavior change is purely in `Hero.astro`. Skip this task if the comment doesn't need updating. The spec says "update overlay_opacity default comment" but the value and key remain identical — only the gradient math in the component changed.

- [ ] **Step 2: Commit (if changes were made)**

```bash
git add src/content/site-config.json
git commit -m "docs: note overlay_opacity now controls bottom-only gradient"
```

---

### Task 4: Build verification

- [ ] **Step 1: Run the dev server and verify visually**

Run: `ADMIN_PASSWORD=admin npm run dev`

Open `http://localhost:4321` and check:
- Hero photo fills the viewport with tight bottom gradient (top ~65% unmuted)
- Heading is visibly smaller than before
- Subheading no longer appears on the hero
- CTAs are full-width on mobile (< 640px), side-by-side on desktop
- Slideshow dots still work (if multiple hero photos)
- Parallax scroll effect works

- [ ] **Step 2: Verify subheading intro section**

Check that the subheading from admin ("Portfolio" by default) appears as a centered text section directly below the hero.

- [ ] **Step 3: Verify empty subheading**

Clear the subheading in admin or temporarily set `"subheading": ""` in site-config.json. The intro section should disappear entirely with no gap.

- [ ] **Step 4: Verify production build**

Run: `npm run build`

Check that `dist/` is generated without errors and the hero renders correctly in the static output.

- [ ] **Step 5: Final commit (if any tweaks from verification)**

```bash
git add -A
git commit -m "chore: final verification tweaks for hero refactor"
```
