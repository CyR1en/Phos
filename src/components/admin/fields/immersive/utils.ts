import { DEFAULT_POSITIONS } from '@lib/immersive-defaults'
import type { PhotoPosition } from '@lib/admin/types'
import { ASPECT as SCENE_ASPECT, frameStyle, resolveLayers, type Device } from '../../../../lib/immersive-motion'
import { RANGES } from '../../../../../lib/immersive-schema.mjs'
export { RANGES } from '../../../../../lib/immersive-schema.mjs'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Aspect ratios representing real device viewports. The canvas is sized
 *  responsively to fill the available workspace while maintaining these
 *  ratios, so photo shapes in the editor match what users see on real devices. */
export const ASPECT = SCENE_ASPECT

/** Pixel distance the cursor must travel before a background mousedown is
 *  treated as a marquee-drag rather than a plain click (which clears the
 *  selection). Prevents accidental selection boxes on simple clicks. */
export const MARQUEE_THRESHOLD = 4

/** Snap-to-grid increment (vw/vh). */
export const SNAP_STEP = 2

// Visible resize handles at the four corners (the re-resizable defaults are
// invisible touch areas — these make them discoverable).
export const RESIZE_HANDLES = Object.fromEntries(
  ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].map((corner) => [corner, {
    width: 'var(--immersive-handle-hit, 16px)', height: 'var(--immersive-handle-hit, 16px)',
    [corner.startsWith('top') ? 'top' : 'bottom']: 'calc(var(--immersive-handle-hit, 16px) / -2)',
    [corner.endsWith('Left') ? 'left' : 'right']: 'calc(var(--immersive-handle-hit, 16px) / -2)',
  }]),
)

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

/** Use the public scene's literal frame geometry in a miniature viewport. */
export function canvasFrameStyle(pos: PhotoPosition, canvas: { w: number; h: number }) {
  return Object.fromEntries(Object.entries(frameStyle(pos)).map(([key, value]) => [key,
    value.replace(/(-?[\d.]+)(vw|vh)/g, (_, n, unit) => `${Number(n) / 100 * (unit === 'vw' ? canvas.w : canvas.h)}px`),
  ]))
}

/** Snap a vw/vh value to the nearest SNAP_STEP. */
export const snapVal = (v: number) => Math.round(v / SNAP_STEP) * SNAP_STEP

export const clone = <T,>(obj: T): T => obj === undefined ? obj : JSON.parse(JSON.stringify(obj))

/** Match the theme's --radius-photo when no explicit radius is stored. */
export const brOf = (pos: PhotoPosition | undefined | null): number =>
  pos && typeof pos.br === 'number' ? pos.br : 3

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
  const separator = photo.lastIndexOf('/')
  const category = photo.slice(0, separator + 1)
  const filename = photo.slice(separator + 1).replace(/\.[^.]+$/, '.webp')
  return `/photos/thumbs/${category}${encodeURIComponent(filename)}`
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
  const hidden = pos.w === 0 && pos.h === 0
  if (patch.w !== undefined) next.w = hidden ? 0 : round3(clamp(patch.w, RANGES.w.min, RANGES.w.max))
  if (patch.h !== undefined) next.h = hidden ? 0 : round3(clamp(patch.h, RANGES.h.min, RANGES.h.max))
  if (patch.z !== undefined) next.z = clamp(Math.round(patch.z), RANGES.z.min, RANGES.z.max)
  if (patch.br !== undefined) next.br = clamp(Math.round(patch.br), RANGES.br.min, RANGES.br.max)
  if (patch.cropX !== undefined) next.cropX = round3(clamp(patch.cropX, RANGES.cropX.min, RANGES.cropX.max))
  if (patch.cropY !== undefined) next.cropY = round3(clamp(patch.cropY, RANGES.cropY.min, RANGES.cropY.max))
  if (patch.cropZoom !== undefined) next.cropZoom = round3(clamp(patch.cropZoom, RANGES.cropZoom.min, RANGES.cropZoom.max))
  return next
}

export interface LayoutDraft {
  mobilePhotos: string[]
  mobilePositions: PhotoPosition[]
  desktopPhotos: string[]
  desktopPositions: PhotoPosition[]
}

/** Open one stored device layout as a draft: fill defaults without renumbering depths and drop
 *  photos missing from the manifest together with their own positions. */
export function readDeviceDraft(
  photos: string[] | null | undefined, positions: (Partial<PhotoPosition> | null)[] | null | undefined,
  device: Device, available: Set<string>,
): { photos: string[]; positions: PhotoPosition[]; removed: number } {
  const list = Array.isArray(photos) ? photos : []
  const resolved = resolveLayers(positions ?? null, list.length, device).map((layer) => clone(layer.pos))
  const retained = list.map((photo, index) => ({ photo, pos: resolved[index] })).filter(({ photo }) => available.has(photo))
  return { photos: retained.map(({ photo }) => photo), positions: retained.map(({ pos }) => pos), removed: list.length - retained.length }
}

/** One save snapshot: preserve copy/settings and literal depths, omit legacy keys. */
export function layoutSnapshot(stored: Record<string, unknown> | undefined, local: LayoutDraft) {
  const snapshot: Record<string, unknown> & LayoutDraft = { ...stored, ...clone(local) }
  delete snapshot.photos
  delete snapshot.positions
  return snapshot
}

const isHidden = (pos: PhotoPosition) => pos.w === 0 && pos.h === 0

/** Move one photo to a 1-based distinct-depth rank; unmoved ties stay together. */
export function applyTypedDepth(positions: PhotoPosition[], index: number, k: number): PhotoPosition[] {
  if (!positions[index] || isHidden(positions[index]) || !Number.isFinite(k)) return positions
  const depths = [...new Set(positions.filter((pos, i) => i !== index && !isHidden(pos)).map((pos) => pos.z))].sort((a, b) => a - b)
  const rank = clamp(Math.round(k), 1, depths.length + 1)
  const ranks = new Map(depths.map((depth, i) => [depth, i + 1 < rank ? i + 1 : i + 2]))
  return positions.map((pos, i) => isHidden(pos) ? pos : { ...pos, z: i === index ? rank : ranks.get(pos.z)! })
}

export type DepthMove = 'front' | 'back' | 'up' | 'down'

/** Renumber only for an explicit depth move, preserving every other depth group. */
export function reorderDepth(positions: PhotoPosition[], index: number, direction: DepthMove): PhotoPosition[] {
  if (!positions[index] || isHidden(positions[index])) return positions
  const depths = [...new Set(positions.filter((pos) => !isHidden(pos)).map((pos) => pos.z))].sort((a, b) => a - b)
  const rank = depths.indexOf(positions[index].z) + 1
  return applyTypedDepth(positions, index, direction === 'front' ? positions.length : direction === 'back' ? 1 : rank + (direction === 'up' ? 1 : -1))
}

/** Keep the frame's pixel aspect ratio in the wider desktop viewport. */
export function copyMobilePositionsToDesktop(positions: PhotoPosition[]): PhotoPosition[] {
  return positions.map((pos, index) => {
    if (isHidden(pos)) return desktopDefs(index)
    // w/h use different viewport units: convert width at a fixed vh height.
    // This is equivalent to multiplying h by desktop/mobile at a fixed width.
    const width = pos.w * ASPECT.mobile / ASPECT.desktop
    const minScale = Math.max(RANGES.w.min / width, RANGES.h.min / pos.h)
    const maxScale = Math.min(RANGES.w.max / width, RANGES.h.max / pos.h)
    const scale = Math.min(maxScale, Math.max(1, minScale))
    return { ...pos,
      w: clamp(width * scale, RANGES.w.min, RANGES.w.max),
      h: clamp(pos.h * scale, RANGES.h.min, RANGES.h.max),
    }
  })
}

/** Apply deltas independently; never align a group to its primary photo. */
export function nudgePositions(positions: PhotoPosition[], indices: number[], dx: number, dy: number): PhotoPosition[] {
  return positions.map((pos, i) => indices.includes(i) ? applyPatch(pos, { x: pos.x + dx, y: pos.y + dy }) : pos)
}

/** Pan across cover overflow AND the extra overflow created by centre zoom.
 * The extra translation is zero at zoom=1 or a centred crop. */
// One crop transform for the canvas and the live scene (src/lib/immersive-motion.ts).
export { cropImageStyle } from '../../../../lib/immersive-motion'

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
    if (i === index || (otherPos.w === 0 && otherPos.h === 0)) return
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
