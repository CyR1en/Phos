export const RANGES: Readonly<{
  x: Readonly<{ min: -50; max: 50 }>
  y: Readonly<{ min: -60; max: 60 }>
  w: Readonly<{ min: 10; max: 100 }>
  h: Readonly<{ min: 8; max: 100 }>
  z: Readonly<{ min: 0; max: 100 }>
  br: Readonly<{ min: 0; max: 100 }>
  cropX: Readonly<{ min: 0; max: 100 }>
  cropY: Readonly<{ min: 0; max: 100 }>
  cropZoom: Readonly<{ min: 1; max: 3 }>
}>

/** Unchanged stored text/photo-count limits are grandfathered; structure and ranges always apply. */
export function validateImmersive(gallery: unknown, stored?: unknown): string | null
