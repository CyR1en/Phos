import { DEFAULT_POSITIONS } from '@lib/immersive-defaults'
import type { PhotoPosition } from '@lib/admin/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Value ranges per spec section 4.4 (client-side clamping). */
export const RANGES = {
  x: { min: -50, max: 50 },
  y: { min: -60, max: 60 },
  w: { min: 10, max: 100 },
  h: { min: 8, max: 100 },
  z: { min: 0, max: 100 },
  br: { min: 0, max: 100 },
} as const

/** Aspect ratios representing real device viewports. The canvas is sized
 *  responsively to fill the available workspace while maintaining these
 *  ratios, so photo shapes in the editor match what users see on real devices. */
export const ASPECT = {
  mobile: { w: 9, h: 19.5 },  // modern phones (iPhone 14/15: 393×852, Galaxy S24: 360×800)
  desktop: { w: 16, h: 9 },   // standard desktop monitors (1920×1080)
} as const

/** Pixel distance the cursor must travel before a background mousedown is
 *  treated as a marquee-drag rather than a plain click (which clears the
 *  selection). Prevents accidental selection boxes on simple clicks. */
export const MARQUEE_THRESHOLD = 4

/** Snap-to-grid increment (vw/vh). */
export const SNAP_STEP = 2

// Visible resize handles at the four corners (the re-resizable defaults are
// invisible touch areas — these make them discoverable).
export const RESIZE_HANDLES: Record<string, any> = {
  topLeft: { width: '8px', height: '8px', background: 'var(--color-primary)', borderRadius: '2px', top: '-4px', left: '-4px' },
  topRight: { width: '8px', height: '8px', background: 'var(--color-primary)', borderRadius: '2px', top: '-4px', right: '-4px' },
  bottomLeft: { width: '8px', height: '8px', background: 'var(--color-primary)', borderRadius: '2px', bottom: '-4px', left: '-4px' },
  bottomRight: { width: '8px', height: '8px', background: 'var(--color-primary)', borderRadius: '2px', bottom: '-4px', right: '-4px' },
}

export const ALL_HANDLES = {
  top: true, right: true, bottom: true, left: true,
  topRight: true, bottomRight: true, bottomLeft: true, topLeft: true,
} as const

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export const clamp = (val: number, min: number, max: number) =>
  Math.max(min, Math.min(max, val))

export const vwToPx = (vw: number, canvasW: number) => (vw / 100) * canvasW
export const vhToPx = (vh: number, canvasH: number) => (vh / 100) * canvasH

export const round3 = (num: number) => Math.round(num * 1000) / 1000
export const pxToVw = (px: number, canvasW: number) => round3((px / canvasW) * 100)
export const pxToVh = (px: number, canvasH: number) => round3((px / canvasH) * 100)

/** Snap a vw/vh value to the nearest SNAP_STEP. */
export const snapVal = (v: number) => Math.round(v / SNAP_STEP) * SNAP_STEP

export const clone = <T,>(obj: T): T => JSON.parse(JSON.stringify(obj))

/** Resolve a photo's border-radius, defaulting to 0 when unset. */
export const brOf = (pos: PhotoPosition | undefined | null): number =>
  pos && typeof pos.br === 'number' ? pos.br : 0

/** Pick the hardcoded default position for index `i` on a given device.
 *  Returns a fresh clone so callers can mutate freely. */
export const mobileDefs = (i: number): PhotoPosition =>
  clone(DEFAULT_POSITIONS[i % DEFAULT_POSITIONS.length].mobile)
export const desktopDefs = (i: number): PhotoPosition =>
  clone(DEFAULT_POSITIONS[i % DEFAULT_POSITIONS.length].desktop)

/**
 * Ensure a positions array is exactly `photoCount` long, filling missing
 * entries from the device defaults and truncating extras. Called every time
 * the editor opens.
 */
export function syncPositions(
  stored: PhotoPosition[] | null,
  photoCount: number,
  pickDefault: (i: number) => PhotoPosition,
): PhotoPosition[] {
  const base = stored ?? []
  const result: PhotoPosition[] = []
  for (let i = 0; i < photoCount; i++) {
    result.push(base[i] ? clone(base[i]) : pickDefault(i))
  }
  return result
}

/** Convert a photo path like `wedding/sample-01.jpg` to its thumb URL. */
export function thumbUrl(photo: string): string {
  return `/photos/thumbs/${photo.replace(/\.[^.]+$/, '.webp')}`
}

/** Rectangle overlap test (AABB). Used by marquee selection. */
export function rectsIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

/**
 * Apply a clamped patch to a single position. Unifies the clamping rules used
 * by single-photo edits, bulk edits, drags, resizes, and keyboard nudges.
 */
export function applyPatch(pos: PhotoPosition, patch: Partial<PhotoPosition>): PhotoPosition {
  const next: PhotoPosition = { ...pos }
  if (patch.x !== undefined) next.x = round3(clamp(patch.x, RANGES.x.min, RANGES.x.max))
  if (patch.y !== undefined) next.y = round3(clamp(patch.y, RANGES.y.min, RANGES.y.max))
  if (patch.w !== undefined) next.w = round3(clamp(patch.w, RANGES.w.min, RANGES.w.max))
  if (patch.h !== undefined) next.h = round3(clamp(patch.h, RANGES.h.min, RANGES.h.max))
  if (patch.z !== undefined) next.z = clamp(Math.round(patch.z), RANGES.z.min, RANGES.z.max)
  if (patch.br !== undefined) next.br = clamp(Math.round(patch.br), RANGES.br.min, RANGES.br.max)
  if (patch.cropX !== undefined) next.cropX = round3(clamp(patch.cropX, 0, 100))
  if (patch.cropY !== undefined) next.cropY = round3(clamp(patch.cropY, 0, 100))
  if (patch.cropZoom !== undefined) next.cropZoom = round3(Math.max(1, patch.cropZoom))
  return next
}

// ---------------------------------------------------------------------------
// Smart alignment guides
// ---------------------------------------------------------------------------

export interface Guide {
  type: 'x' | 'y'
  pos: number
  spanMin: number
  spanMax: number
}

interface SnapHit {
  diff: number
  target: number
  guide: number
  type: 'center' | 'edge'
  spanMin: number
  spanMax: number
}

const ALIGN_THRESHOLD = 3

/**
 * Compute smart-alignment snap for a photo being dragged. Pure: takes the
 * current positions + canvas size and returns the snapped {left, top} (in
 * canvas px) plus any guide lines to render. When `smartAlign` is off (or the
 * dragged photo has no position), returns the raw coords with no guides.
 */
export function computeSnap(
  index: number,
  rawLeft: number,
  rawTop: number,
  positions: PhotoPosition[],
  canvasW: number,
  canvasH: number,
  smartAlign: boolean,
): { left: number; top: number; guides: Guide[] } {
  if (!smartAlign) return { left: rawLeft, top: rawTop, guides: [] }
  const pos = positions[index]
  if (!pos) return { left: rawLeft, top: rawTop, guides: [] }

  const wPx = vwToPx(pos.w, canvasW)
  const hPx = vhToPx(pos.h, canvasH)
  const left = rawLeft
  const top = rawTop
  const right = left + wPx
  const bottom = top + hPx
  const centerX = left + wPx / 2
  const centerY = top + hPx / 2

  let snapX: SnapHit | null = null
  let snapY: SnapHit | null = null

  const checkX = (targetPx: number, type: 'center' | 'edge', targetTop: number, targetBottom: number) => {
    const points = [
      { current: left, offset: 0 },
      { current: right, offset: -wPx },
      { current: centerX, offset: -wPx / 2 },
    ]
    for (const pt of points) {
      const diff = Math.abs(targetPx - pt.current)
      if (diff > ALIGN_THRESHOLD) continue
      const requiredLeft = targetPx + pt.offset
      if (!snapX || (type === 'center' && snapX.type === 'edge') || (type === snapX.type && diff < snapX.diff)) {
        snapX = { diff, target: requiredLeft, guide: targetPx, type, spanMin: Math.min(top, targetTop) - 20, spanMax: Math.max(bottom, targetBottom) + 20 }
      }
    }
  }

  const checkY = (targetPx: number, type: 'center' | 'edge', targetLeft: number, targetRight: number) => {
    const points = [
      { current: top, offset: 0 },
      { current: bottom, offset: -hPx },
      { current: centerY, offset: -hPx / 2 },
    ]
    for (const pt of points) {
      const diff = Math.abs(targetPx - pt.current)
      if (diff > ALIGN_THRESHOLD) continue
      const requiredTop = targetPx + pt.offset
      if (!snapY || (type === 'center' && snapY.type === 'edge') || (type === snapY.type && diff < snapY.diff)) {
        snapY = { diff, target: requiredTop, guide: targetPx, type, spanMin: Math.min(left, targetLeft) - 20, spanMax: Math.max(right, targetRight) + 20 }
      }
    }
  }

  // Canvas center lines.
  checkX(canvasW / 2, 'center', 0, canvasH)
  checkY(canvasH / 2, 'center', 0, canvasW)

  // Edges + centers of every other photo.
  positions.forEach((otherPos, i) => {
    if (i === index) return
    const oW = vwToPx(otherPos.w, canvasW)
    const oH = vhToPx(otherPos.h, canvasH)
    const oLeft = canvasW / 2 + vwToPx(otherPos.x, canvasW) - oW / 2
    const oTop = canvasH / 2 + vhToPx(otherPos.y, canvasH) - oH / 2
    checkX(oLeft, 'edge', oTop, oTop + oH)
    checkX(oLeft + oW, 'edge', oTop, oTop + oH)
    checkX(oLeft + oW / 2, 'center', oTop, oTop + oH)
    checkY(oTop, 'edge', oLeft, oLeft + oW)
    checkY(oTop + oH, 'edge', oLeft, oLeft + oW)
    checkY(oTop + oH / 2, 'center', oLeft, oLeft + oW)
  })

  // `snapX`/`snapY` are only ever assigned inside the checkX/checkY closures,
  // which TS control-flow analysis can't track back to the outer scope (it
  // still sees the initial `null`). Cast to the declared union so the truthy
  // branch narrows to SnapHit.
  const sx = snapX as SnapHit | null
  const sy = snapY as SnapHit | null
  const guides: Guide[] = []
  let finalLeft = left
  let finalTop = top
  if (sx) { finalLeft = sx.target; guides.push({ type: 'x', pos: sx.guide, spanMin: sx.spanMin, spanMax: sx.spanMax }) }
  if (sy) { finalTop = sy.target; guides.push({ type: 'y', pos: sy.guide, spanMin: sy.spanMin, spanMax: sy.spanMax }) }
  return { left: finalLeft, top: finalTop, guides }
}
