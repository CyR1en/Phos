#!/usr/bin/env node
/**
 * Generate a theme CSS file from a palette JSON definition.
 * Usage: node scripts/generate-theme.mjs <palette.json> > src/styles/themes/<theme>.css
 *
 * Palette JSON schema:
 * {
 *   "name": "Display Name",
 *   "id": "theme-slug",
 *   "description": "Short description",
 *   "credit": "Optional credit/URL",
 *   "light": {
 *     "base": "#...", "surface": "#...", "overlay": "#...",
 *     "muted": "#...", "subtle": "#...", "text": "#...",
 *     "accent": "#...", "gold": "#...", "rose": "#...",
 *     "pine": "#...", "foam": "#...", "iris": "#...",
 *     "highlightLow": "#...", "highlightMed": "#...", "highlightHigh": "#..."
 *   },
 *   "dark": { ... same keys ... },
 *   "accentShadeBase": { "50": "#...", ... "950": "#..." },  // optional; auto-generated if omitted
 *   "overrides": {
 *     "primaryHoverShade": "600",       // default: "600"
 *     "destructiveHoverShade": "600",   // default: "600"
 *     "primaryForeground": "surface",   // default: "surface"  (light); options: "surface", "text", "base"
 *     "primaryForegroundDark": "base",  // default: "base"     (dark)
 *     "destructiveForeground": "surface",    // default: "surface"
 *     "destructiveForegroundDark": "base"    // default: "base"
 *   }
 * }
 */

import { readFileSync } from 'node:fs'

// -------- Color math --------
function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  }
}

function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')
}

/** Generate 50-950 accent shade scale from a single accent color */
function generateAccentShades(hex) {
  const { r, g, b } = hexToRgb(hex)
  const shades = {}
  // Interpolate from white (50) → accent (500) → black (950)
  const stops = {
    50: { r: 255, g: 255, b: 255 },
    100: { r: 245, g: 245, b: 255 },
    200: { r: 220, g: 220, b: 240 },
    300: { r: 190, g: 190, b: 220 },
    400: { r: 140, g: 140, b: 185 },
    500: { r, g, b },
    600: { r: r * 0.85, g: g * 0.82, b: b * 0.82 },
    700: { r: r * 0.68, g: g * 0.64, b: b * 0.64 },
    800: { r: r * 0.48, g: g * 0.44, b: b * 0.44 },
    900: { r: r * 0.30, g: g * 0.26, b: b * 0.26 },
    950: { r: r * 0.16, g: g * 0.13, b: b * 0.13 },
  }
  for (const [key, val] of Object.entries(stops)) {
    shades[key] = rgbToHex(val)
  }
  return shades
}

// -------- Template --------
function render(palette) {
  const p = palette
  const id = p.id
  const L = p.light
  const D = p.dark
  const ov = p.overrides || {}
  const primaryHover = ov.primaryHoverShade || '600'
  const destructiveHover = ov.destructiveHoverShade || '600'
  const pfLight = ov.primaryForeground || 'surface'
  const pfDark = ov.primaryForegroundDark || 'base'
  const dfLight = ov.destructiveForeground || 'surface'
  const dfDark = ov.destructiveForegroundDark || 'base'

  // Generate accent shades if not provided
  const shades = p.accentShadeBase || generateAccentShades(L.accent)

  const pfLightVar = pfLight === 'surface' ? 'var(--color-phos-surface)' : pfLight === 'text' ? 'var(--color-phos-text)' : 'var(--color-phos-base)'
  const dfLightVar = dfLight === 'surface' ? 'var(--color-phos-surface)' : dfLight === 'text' ? 'var(--color-phos-text)' : 'var(--color-phos-base)'
  const pfDarkVar = pfDark === 'base' ? 'var(--color-phos-dark-base)' : pfDark === 'text' ? 'var(--color-phos-dark-text)' : 'var(--color-phos-dark-surface)'
  const dfDarkVar = dfDark === 'base' ? 'var(--color-phos-dark-base)' : dfDark === 'text' ? 'var(--color-phos-dark-text)' : 'var(--color-phos-dark-surface)'

  return `/* ------------------------------ */
/* -------- ${p.name.padEnd(19)} --- */
/* ${p.description.padEnd(30)} */
${p.credit ? `/* ${p.credit.padEnd(30)} */\n` : ''}/* ------------------------------ */

[data-theme="${id}"] {
  /* Light palette */
  --color-phos-base: ${L.base};
  --color-phos-surface: ${L.surface};
  --color-phos-overlay: ${L.overlay};
  --color-phos-muted: ${L.muted};
  --color-phos-subtle: ${L.subtle};
  --color-phos-text: ${L.text};
  --color-phos-accent: ${L.accent};
  --color-phos-gold: ${L.gold};
  --color-phos-rose: ${L.rose};
  --color-phos-pine: ${L.pine};
  --color-phos-foam: ${L.foam};
  --color-phos-iris: ${L.iris};
  --color-phos-highlight-low: ${L.highlightLow};
  --color-phos-highlight-med: ${L.highlightMed};
  --color-phos-highlight-high: ${L.highlightHigh};

  /* Dark palette */
  --color-phos-dark-base: ${D.base};
  --color-phos-dark-surface: ${D.surface};
  --color-phos-dark-overlay: ${D.overlay};
  --color-phos-dark-muted: ${D.muted};
  --color-phos-dark-subtle: ${D.subtle};
  --color-phos-dark-text: ${D.text};
  --color-phos-dark-accent: ${D.accent};
  --color-phos-dark-gold: ${D.gold};
  --color-phos-dark-rose: ${D.rose};
  --color-phos-dark-pine: ${D.pine};
  --color-phos-dark-foam: ${D.foam};
  --color-phos-dark-iris: ${D.iris};
  --color-phos-dark-highlight-low: ${D.highlightLow};
  --color-phos-dark-highlight-med: ${D.highlightMed};
  --color-phos-dark-highlight-high: ${D.highlightHigh};

  /* Accent shades (50–950) */
${Object.entries(shades).map(([k, v]) => `  --color-phos-accent-${k}: ${v};`).join('\n')}

  /* Light mode semantic tokens */
  --background: var(--color-phos-base);
  --background-1: var(--color-phos-surface);
  --background-2: var(--color-phos-overlay);
  --background-plain: var(--color-phos-base);
  --foreground: var(--color-phos-text);
  --foreground-inverse: var(--color-phos-surface);

  --inverse: var(--color-phos-dark-base);

  --border: var(--color-phos-highlight-med);
  --border-line-inverse: var(--color-phos-dark-text);
  --border-line-1: var(--color-phos-highlight-low);
  --border-line-2: var(--color-phos-highlight-med);
  --border-line-3: var(--color-phos-highlight-high);
  --border-line-4: var(--color-phos-muted);
  --border-line-5: var(--color-phos-subtle);
  --border-line-6: var(--color-phos-text);
  --border-line-7: var(--color-phos-dark-base);
  --border-line-8: var(--color-phos-dark-surface);

  --primary-50: var(--color-phos-accent-50);
  --primary-100: var(--color-phos-accent-100);
  --primary-200: var(--color-phos-accent-200);
  --primary-300: var(--color-phos-accent-300);
  --primary-400: var(--color-phos-accent-400);
  --primary-500: var(--color-phos-accent-500);
  --primary-600: var(--color-phos-accent-600);
  --primary-700: var(--color-phos-accent-700);
  --primary-800: var(--color-phos-accent-800);
  --primary-900: var(--color-phos-accent-900);
  --primary-950: var(--color-phos-accent-950);

  --primary: var(--color-phos-accent);
  --primary-line: transparent;
  --primary-foreground: ${pfLightVar};
  --primary-hover: var(--color-phos-accent-${primaryHover});
  --primary-focus: var(--color-phos-accent-${primaryHover});
  --primary-active: var(--color-phos-accent-${primaryHover});
  --primary-checked: var(--color-phos-accent);

  --secondary: var(--color-phos-text);
  --secondary-line: transparent;
  --secondary-foreground: var(--color-phos-surface);
  --secondary-hover: var(--color-phos-dark-base);
  --secondary-focus: var(--color-phos-dark-base);
  --secondary-active: var(--color-phos-dark-base);

  --layer: var(--color-phos-base);
  --layer-line: var(--border);
  --layer-foreground: var(--color-phos-text);
  --layer-hover: var(--color-phos-surface);
  --layer-focus: var(--color-phos-surface);
  --layer-active: var(--color-phos-surface);

  --surface: var(--color-phos-surface);
  --surface-1: var(--color-phos-overlay);
  --surface-2: var(--color-phos-highlight-low);
  --surface-3: var(--color-phos-highlight-med);
  --surface-4: var(--color-phos-muted);
  --surface-5: var(--color-phos-subtle);
  --surface-line: transparent;
  --surface-foreground: var(--color-phos-text);
  --surface-hover: var(--color-phos-highlight-low);
  --surface-focus: var(--color-phos-highlight-low);
  --surface-active: var(--color-phos-highlight-low);

  --muted: var(--color-phos-surface);
  --muted-foreground: var(--color-phos-muted);
  --muted-foreground-1: var(--color-phos-subtle);
  --muted-foreground-2: var(--color-phos-text);
  --muted-hover: var(--color-phos-overlay);
  --muted-focus: var(--color-phos-overlay);
  --muted-active: var(--color-phos-overlay);

  --destructive: var(--color-phos-accent);
  --destructive-foreground: ${dfLightVar};
  --destructive-hover: var(--color-phos-accent-${destructiveHover});
  --destructive-focus: var(--color-phos-accent-${destructiveHover});

  --navbar: var(--color-phos-base);
  --navbar-line: var(--border);
  --navbar-divider: var(--border);
  --navbar-nav-foreground: var(--color-phos-text);
  --navbar-nav-hover: var(--color-phos-surface);
  --navbar-nav-focus: var(--color-phos-surface);
  --navbar-nav-active: var(--color-phos-surface);
  --navbar-nav-list-divider: var(--border);
  --navbar-inverse: var(--inverse);
  --navbar-1: var(--color-phos-surface);
  --navbar-1-line: var(--border);
  --navbar-1-divider: var(--border);
  --navbar-1-nav-foreground: var(--color-phos-text);
  --navbar-1-nav-hover: var(--color-phos-overlay);
  --navbar-1-nav-focus: var(--color-phos-overlay);
  --navbar-1-nav-active: var(--color-phos-overlay);
  --navbar-1-nav-list-divider: var(--border);
  --navbar-2: var(--color-phos-overlay);
  --navbar-2-line: transparent;
  --navbar-2-divider: var(--color-phos-highlight-high);
  --navbar-2-nav-foreground: var(--color-phos-text);
  --navbar-2-nav-hover: var(--color-phos-highlight-low);
  --navbar-2-nav-focus: var(--color-phos-highlight-low);
  --navbar-2-nav-active: var(--color-phos-highlight-low);
  --navbar-2-nav-list-divider: var(--border);

  --sidebar: var(--color-phos-base);
  --sidebar-line: var(--border);
  --sidebar-divider: var(--border);
  --sidebar-nav-foreground: var(--color-phos-text);
  --sidebar-nav-hover: var(--color-phos-surface);
  --sidebar-nav-focus: var(--color-phos-surface);
  --sidebar-nav-active: var(--color-phos-surface);
  --sidebar-nav-list-divider: var(--border);
  --sidebar-inverse: var(--inverse);
  --sidebar-1: var(--color-phos-surface);
  --sidebar-1-line: var(--border);
  --sidebar-1-divider: var(--border);
  --sidebar-1-nav-foreground: var(--color-phos-text);
  --sidebar-1-nav-hover: var(--color-phos-overlay);
  --sidebar-1-nav-focus: var(--color-phos-overlay);
  --sidebar-1-nav-active: var(--color-phos-overlay);
  --sidebar-1-nav-list-divider: var(--border);
  --sidebar-2: var(--color-phos-overlay);
  --sidebar-2-line: transparent;
  --sidebar-2-divider: var(--border);
  --sidebar-2-nav-foreground: var(--color-phos-text);
  --sidebar-2-nav-hover: var(--color-phos-highlight-low);
  --sidebar-2-nav-focus: var(--color-phos-highlight-low);
  --sidebar-2-nav-active: var(--color-phos-highlight-low);
  --sidebar-2-nav-list-divider: var(--border);

  --card: var(--color-phos-base);
  --card-line: var(--border);
  --card-divider: var(--border);
  --card-header: var(--color-phos-overlay);
  --card-footer: var(--color-phos-overlay);
  --card-inverse: var(--inverse);

  --dropdown: var(--color-phos-base);
  --dropdown-1: var(--color-phos-base);
  --dropdown-line: transparent;
  --dropdown-divider: var(--border);
  --dropdown-header: var(--color-phos-overlay);
  --dropdown-footer: var(--color-phos-overlay);
  --dropdown-item-foreground: var(--color-phos-text);
  --dropdown-item-hover: var(--color-phos-surface);
  --dropdown-item-focus: var(--color-phos-surface);
  --dropdown-item-active: var(--color-phos-surface);
  --dropdown-inverse: var(--inverse);

  --select: var(--color-phos-base);
  --select-1: var(--color-phos-base);
  --select-line: transparent;
  --select-item-foreground: var(--color-phos-text);
  --select-item-hover: var(--color-phos-surface);
  --select-item-focus: var(--color-phos-surface);
  --select-item-active: var(--color-phos-surface);
  --select-inverse: var(--inverse);

  --overlay: var(--color-phos-base);
  --overlay-line: transparent;
  --overlay-divider: var(--border);
  --overlay-header: var(--color-phos-overlay);
  --overlay-footer: var(--color-phos-overlay);
  --overlay-inverse: var(--inverse);

  --popover: var(--color-phos-base);
  --popover-line: var(--color-phos-highlight-low);

  --tooltip: var(--inverse);
  --tooltip-foreground: var(--color-phos-dark-text);
  --tooltip-line: transparent;

  --table-line: var(--border);

  --switch: var(--color-phos-base);

  --footer: var(--color-phos-base);
  --footer-line: var(--border);
  --footer-inverse: var(--inverse);

  --scrollbar-track: var(--color-phos-surface);
  --scrollbar-thumb: var(--color-phos-highlight-med);
  --scrollbar-track-inverse: transparent;
  --scrollbar-thumb-inverse: var(--color-phos-dark-text);

  --chart-colors-background: var(--color-phos-base);
  --chart-colors-background-inverse: var(--inverse);
  --chart-colors-chart-inverse: var(--color-phos-surface);
  --chart-colors-foreground: var(--color-phos-text);
  --chart-colors-foreground-inverse: var(--color-phos-surface);
  --chart-primary: var(--color-phos-accent);
  --chart-colors-primary: var(--color-phos-accent);
  --chart-colors-primary-inverse: var(--color-phos-accent-300);
  --chart-colors-primary-hex: var(--color-phos-accent);
  --chart-colors-primary-hex-inverse: var(--color-phos-accent-300);
  --chart-1: var(--color-phos-accent-100);
  --chart-2: var(--color-phos-accent-300);
  --chart-3: var(--color-phos-accent-500);
  --chart-4: var(--color-phos-accent-700);
  --chart-5: var(--color-phos-accent-900);
  --chart-6: var(--color-phos-iris);
  --chart-7: var(--color-phos-pine);
  --chart-8: var(--color-phos-foam);
  --chart-9: var(--color-phos-rose);
  --chart-10: var(--color-phos-gold);

  --chart-colors-labels: var(--color-phos-subtle);
  --chart-colors-xaxis-labels: var(--color-phos-muted);
  --chart-colors-yaxis-labels: var(--color-phos-muted);
  --chart-colors-grid-border: var(--border);
  --chart-colors-bar-ranges: var(--color-phos-surface);

  --map-colors-primary: var(--color-phos-accent);
  --map-colors-primary-inverse: var(--color-phos-accent-300);
  --map-colors-default: var(--color-phos-surface);
  --map-colors-default-inverse: var(--color-phos-dark-overlay);
  --map-colors-highlight: var(--color-phos-accent-300);
  --map-colors-highlight-inverse: var(--color-phos-accent);
  --map-colors-border: var(--color-phos-highlight-high);
  --map-colors-border-inverse: var(--color-phos-dark-highlight-med);
}

[data-theme="${id}"].dark {
  --background: var(--color-phos-dark-base);
  --background-1: var(--color-phos-dark-surface);
  --background-2: var(--color-phos-dark-overlay);
  --background-plain: var(--color-phos-dark-base);

  --foreground: var(--color-phos-dark-text);
  --foreground-inverse: var(--color-phos-text);

  --inverse: var(--color-phos-dark-highlight-med);

  --border: var(--color-phos-dark-highlight-med);
  --border-line-inverse: var(--color-phos-text);
  --border-line-1: var(--color-phos-dark-base);
  --border-line-2: var(--color-phos-dark-surface);
  --border-line-3: var(--color-phos-dark-highlight-low);
  --border-line-4: var(--color-phos-dark-highlight-med);
  --border-line-5: var(--color-phos-dark-highlight-high);
  --border-line-6: var(--color-phos-dark-muted);
  --border-line-7: var(--color-phos-dark-subtle);
  --border-line-8: var(--color-phos-dark-text);

  --primary: var(--color-phos-dark-accent);
  --primary-line: transparent;
  --primary-foreground: ${pfDarkVar};
  --primary-hover: var(--color-phos-dark-rose);
  --primary-focus: var(--color-phos-dark-rose);
  --primary-active: var(--color-phos-dark-rose);
  --primary-checked: var(--color-phos-dark-accent);

  --secondary: var(--color-phos-dark-text);
  --secondary-line: transparent;
  --secondary-foreground: var(--color-phos-dark-base);
  --secondary-hover: var(--color-phos-dark-subtle);
  --secondary-focus: var(--color-phos-dark-subtle);
  --secondary-active: var(--color-phos-dark-subtle);

  --layer: var(--color-phos-dark-base);
  --layer-line: var(--border);
  --layer-foreground: var(--color-phos-dark-text);
  --layer-hover: var(--color-phos-dark-surface);
  --layer-focus: var(--color-phos-dark-surface);
  --layer-active: var(--color-phos-dark-surface);

  --surface: var(--color-phos-dark-surface);
  --surface-1: var(--color-phos-dark-highlight-low);
  --surface-2: var(--color-phos-dark-highlight-med);
  --surface-3: var(--color-phos-dark-highlight-high);
  --surface-4: var(--color-phos-dark-muted);
  --surface-5: var(--color-phos-dark-subtle);
  --surface-line: transparent;
  --surface-foreground: var(--color-phos-dark-text);
  --surface-hover: var(--color-phos-dark-highlight-low);
  --surface-focus: var(--color-phos-dark-highlight-low);
  --surface-active: var(--color-phos-dark-highlight-low);

  --muted: var(--color-phos-dark-base);
  --muted-foreground: var(--color-phos-dark-muted);
  --muted-foreground-1: var(--color-phos-dark-subtle);
  --muted-foreground-2: var(--color-phos-dark-text);
  --muted-hover: var(--color-phos-dark-surface);
  --muted-focus: var(--color-phos-dark-surface);
  --muted-active: var(--color-phos-dark-surface);

  --destructive: var(--color-phos-dark-accent);
  --destructive-foreground: ${dfDarkVar};
  --destructive-hover: var(--color-phos-dark-rose);
  --destructive-focus: var(--color-phos-dark-rose);

  --navbar: var(--color-phos-dark-base);
  --navbar-line: var(--border);
  --navbar-divider: var(--border);
  --navbar-nav-foreground: var(--color-phos-dark-text);
  --navbar-nav-hover: var(--color-phos-dark-surface);
  --navbar-nav-focus: var(--color-phos-dark-surface);
  --navbar-nav-active: var(--color-phos-dark-surface);
  --navbar-nav-list-divider: var(--border);
  --navbar-inverse: var(--inverse);
  --navbar-1: var(--color-phos-dark-surface);
  --navbar-1-line: var(--border);
  --navbar-1-divider: var(--border);
  --navbar-1-nav-foreground: var(--color-phos-dark-text);
  --navbar-1-nav-hover: var(--color-phos-dark-highlight-low);
  --navbar-1-nav-focus: var(--color-phos-dark-highlight-low);
  --navbar-1-nav-active: var(--color-phos-dark-highlight-low);
  --navbar-1-nav-list-divider: var(--border);
  --navbar-2: var(--color-phos-dark-overlay);
  --navbar-2-line: transparent;
  --navbar-2-divider: var(--border);
  --navbar-2-nav-foreground: var(--color-phos-dark-text);
  --navbar-2-nav-hover: var(--color-phos-dark-highlight-low);
  --navbar-2-nav-focus: var(--color-phos-dark-highlight-low);
  --navbar-2-nav-active: var(--color-phos-dark-highlight-low);
  --navbar-2-nav-list-divider: var(--border);

  --sidebar: var(--color-phos-dark-base);
  --sidebar-line: var(--border);
  --sidebar-divider: var(--border);
  --sidebar-nav-foreground: var(--color-phos-dark-text);
  --sidebar-nav-hover: var(--color-phos-dark-surface);
  --sidebar-nav-focus: var(--color-phos-dark-surface);
  --sidebar-nav-active: var(--color-phos-dark-surface);
  --sidebar-nav-list-divider: var(--border);
  --sidebar-inverse: var(--inverse);
  --sidebar-1: var(--color-phos-dark-surface);
  --sidebar-1-line: var(--border);
  --sidebar-1-divider: var(--border);
  --sidebar-1-nav-foreground: var(--color-phos-dark-text);
  --sidebar-1-nav-hover: var(--color-phos-dark-highlight-low);
  --sidebar-1-nav-focus: var(--color-phos-dark-highlight-low);
  --sidebar-1-nav-active: var(--color-phos-dark-highlight-low);
  --sidebar-1-nav-list-divider: var(--border);
  --sidebar-2: var(--color-phos-dark-overlay);
  --sidebar-2-line: transparent;
  --sidebar-2-divider: var(--border);
  --sidebar-2-nav-foreground: var(--color-phos-dark-text);
  --sidebar-2-nav-hover: var(--color-phos-dark-highlight-low);
  --sidebar-2-nav-focus: var(--color-phos-dark-highlight-low);
  --sidebar-2-nav-active: var(--color-phos-dark-highlight-low);
  --sidebar-2-nav-list-divider: var(--border);

  --card: var(--color-phos-dark-base);
  --card-line: var(--border);
  --card-divider: var(--border);
  --card-header: var(--color-phos-dark-surface);
  --card-footer: var(--color-phos-dark-surface);
  --card-inverse: var(--inverse);

  --dropdown: var(--color-phos-dark-surface);
  --dropdown-1: var(--color-phos-dark-overlay);
  --dropdown-line: transparent;
  --dropdown-divider: var(--border);
  --dropdown-header: var(--color-phos-dark-highlight-low);
  --dropdown-footer: var(--color-phos-dark-highlight-low);
  --dropdown-item-foreground: var(--color-phos-dark-text);
  --dropdown-item-hover: var(--color-phos-dark-highlight-low);
  --dropdown-item-focus: var(--color-phos-dark-highlight-low);
  --dropdown-item-active: var(--color-phos-dark-highlight-low);
  --dropdown-inverse: var(--inverse);

  --select: var(--color-phos-dark-surface);
  --select-1: var(--color-phos-dark-overlay);
  --select-line: transparent;
  --select-item-foreground: var(--color-phos-dark-text);
  --select-item-hover: var(--color-phos-dark-highlight-low);
  --select-item-focus: var(--color-phos-dark-highlight-low);
  --select-item-active: var(--color-phos-dark-highlight-low);
  --select-inverse: var(--inverse);

  --overlay: var(--color-phos-dark-base);
  --overlay-line: transparent;
  --overlay-divider: var(--border);
  --overlay-header: var(--color-phos-dark-surface);
  --overlay-footer: var(--color-phos-dark-surface);
  --overlay-inverse: var(--inverse);

  --popover: var(--color-phos-dark-surface);
  --popover-line: var(--border);

  --tooltip: var(--color-phos-dark-text);
  --tooltip-foreground: var(--color-phos-text);
  --tooltip-line: transparent;

  --table-line: var(--border);

  --switch: var(--color-phos-dark-accent);

  --footer: var(--color-phos-dark-base);
  --footer-line: var(--border);
  --footer-inverse: var(--inverse);

  --scrollbar-track: var(--color-phos-dark-surface);
  --scrollbar-thumb: var(--color-phos-dark-highlight-high);
  --scrollbar-track-inverse: var(--color-phos-dark-muted);
  --scrollbar-thumb-inverse: var(--color-phos-dark-highlight-med);

  --chart-colors-background: var(--color-phos-dark-base);
  --chart-colors-background-inverse: var(--color-phos-highlight-low);
  --chart-colors-chart-inverse: var(--color-phos-dark-surface);
  --chart-colors-foreground: var(--color-phos-dark-subtle);
  --chart-colors-foreground-inverse: var(--color-phos-base);
  --chart-primary: var(--color-phos-dark-accent);
  --chart-colors-primary: var(--color-phos-dark-accent);
  --chart-colors-primary-inverse: var(--color-phos-accent-300);
  --chart-colors-primary-hex: var(--color-phos-dark-accent);
  --chart-colors-primary-hex-inverse: var(--color-phos-accent-300);
  --chart-1: var(--color-phos-accent-200);
  --chart-2: var(--color-phos-accent-300);
  --chart-3: var(--color-phos-accent-400);
  --chart-4: var(--color-phos-dark-accent);
  --chart-5: var(--color-phos-accent-300);
  --chart-6: var(--color-phos-dark-iris);
  --chart-7: var(--color-phos-dark-pine);
  --chart-8: var(--color-phos-dark-foam);
  --chart-9: var(--color-phos-dark-rose);
  --chart-10: var(--color-phos-dark-gold);

  --chart-colors-labels: var(--color-phos-dark-muted);
  --chart-colors-xaxis-labels: var(--color-phos-dark-muted);
  --chart-colors-yaxis-labels: var(--color-phos-dark-muted);
  --chart-colors-grid-border: var(--border);
  --chart-colors-bar-ranges: var(--color-phos-dark-surface);

  --map-colors-default: var(--color-phos-dark-surface);
  --map-colors-default-inverse: var(--color-phos-dark-highlight-low);
  --map-colors-border: var(--color-phos-dark-highlight-high);
  --map-colors-border-inverse: var(--color-phos-dark-muted);
}
`
}

// -------- CLI --------
const inputPath = process.argv[2]
if (!inputPath) {
  console.error('Usage: node scripts/generate-theme.mjs <palette.json>')
  process.exit(1)
}

const raw = readFileSync(inputPath, 'utf-8')
const palette = JSON.parse(raw)
console.log(render(palette))
