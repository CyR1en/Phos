import { useState, useRef, useEffect, useCallback } from 'preact/hooks'
import { Rnd } from 'react-rnd'
import { useConfig } from '../../../lib/admin/store'
import { DEFAULT_POSITIONS } from '../../../lib/immersive-defaults'
import type { PhotoPosition } from '../../../lib/admin/types'
import { Button } from '../ui/Button'
import manifest from '@content/categories.json'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '../../ui/alert-dialog'

// react-rnd is a React component; cast to any to avoid Preact/React JSX type
// mismatches (the established pattern in this codebase — see HeroPhotosField,
// dialog.tsx, ObjectField.tsx).
const RndAny = Rnd as any

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Value ranges per spec section 4.4 (client-side clamping). */
const RANGES = {
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
const ASPECT = {
  mobile: { w: 9, h: 19.5 },  // modern phones (iPhone 14/15: 393×852, Galaxy S24: 360×800)
  desktop: { w: 16, h: 9 },   // standard desktop monitors (1920×1080)
} as const

/** Pixel distance the cursor must travel before a background mousedown is
 *  treated as a marquee-drag rather than a plain click (which clears the
 *  selection). Prevents accidental selection boxes on simple clicks. */
const MARQUEE_THRESHOLD = 4

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clamp = (val: number, min: number, max: number) =>
  Math.max(min, Math.min(max, val))

const vwToPx = (vw: number, canvasW: number) => (vw / 100) * canvasW
const vhToPx = (vh: number, canvasH: number) => (vh / 100) * canvasH
const pxToVw = (px: number, canvasW: number) => (px / canvasW) * 100
const pxToVh = (px: number, canvasH: number) => (px / canvasH) * 100

/** Snap a vw/vh value to the nearest GRID_STEP (used when snap-to-grid is on). */
const SNAP_STEP = 2 // vw/vh increments
const snapVal = (v: number) => Math.round(v / SNAP_STEP) * SNAP_STEP

const clone = <T,>(obj: T): T => JSON.parse(JSON.stringify(obj))

/** Resolve a photo's border-radius, defaulting to 0 when unset. */
const brOf = (pos: PhotoPosition | undefined | null): number =>
  pos && typeof pos.br === 'number' ? pos.br : 0

/**
 * Pick the hardcoded default position for index `i` on a given device.
 * Returns a fresh clone so callers can mutate freely.
 */
const mobileDefs = (i: number): PhotoPosition =>
  clone(DEFAULT_POSITIONS[i % DEFAULT_POSITIONS.length].mobile)
const desktopDefs = (i: number): PhotoPosition =>
  clone(DEFAULT_POSITIONS[i % DEFAULT_POSITIONS.length].desktop)

/**
 * Ensure a positions array is exactly `photoCount` long, filling missing
 * entries from the device defaults and truncating extras. Called every time
 * the editor opens.
 */
function syncPositions(
  stored: PhotoPosition[] | null,
  photoCount: number,
  pickDefault: (i: number) => PhotoPosition,
): PhotoPosition[] {
  const base = stored ?? []
  const result: PhotoPosition[] = []
  for (let i = 0; i < photoCount; i++) {
    if (base[i]) result.push(clone(base[i]))
    else result.push(pickDefault(i))
  }
  return result
}

/** Convert a photo path like `wedding/sample-01.jpg` to its thumb URL. */
function thumbUrl(photo: string): string {
  return `/photos/thumbs/${photo.replace(/\.[^.]+$/, '.webp')}`
}

/**
 * Rectangle overlap test (AABB). Each rect is {left, top, right, bottom}.
 * Used by marquee selection to find photos intersecting the drag box.
 */
function rectsIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

// Visible resize handles at the four corners (the re-resizable defaults are
// invisible touch areas — these make them discoverable).
const RESIZE_HANDLES: Record<string, any> = {
  topLeft: { width: '8px', height: '8px', background: 'var(--color-primary)', borderRadius: '2px', top: '-4px', left: '-4px' },
  topRight: { width: '8px', height: '8px', background: 'var(--color-primary)', borderRadius: '2px', top: '-4px', right: '-4px' },
  bottomLeft: { width: '8px', height: '8px', background: 'var(--color-primary)', borderRadius: '2px', bottom: '-4px', left: '-4px' },
  bottomRight: { width: '8px', height: '8px', background: 'var(--color-primary)', borderRadius: '2px', bottom: '-4px', right: '-4px' },
}

const ALL_HANDLES = {
  top: true, right: true, bottom: true, left: true,
  topRight: true, bottomRight: true, bottomLeft: true, topLeft: true,
} as const

// ---------------------------------------------------------------------------
// Icons (inline SVG — kept local to avoid pulling lucide-react into the Preact
// admin SPA, matching the rest of the admin field components).
// ---------------------------------------------------------------------------

function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  )
}

function TrashIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  /** Dotted config path to the immersiveGallery object, e.g. "home.immersiveGallery". */
  path: string
}

export function ImmersiveLayoutEditor({ path }: Props) {
  const { getValue, setValue, flushSave, pushToast } = useConfig()

  const [open, setOpen] = useState(false)
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile')
  // Multi-selection: an array of photo indices. Empty = nothing selected.
  // The primary (first) entry is the one whose X/Y/W/H fields are shown when
  // exactly one photo is selected; with >1 selected only Z + Border Radius are
  // editable (bulk), since per-photo geometry doesn't make sense as a batch.
  const [selected, setSelected] = useState<number[]>([])
  // Per-device photos + positions. Positions are PhotoPosition[] (one entry
  // per photo), parallel to the matching *Photos array.
  const [localMobilePhotos, setLocalMobilePhotos] = useState<string[]>([])
  const [localDesktopPhotos, setLocalDesktopPhotos] = useState<string[]>([])
  const [localMobilePositions, setLocalMobilePositions] = useState<PhotoPosition[]>([])
  const [localDesktopPositions, setLocalDesktopPositions] = useState<PhotoPosition[]>([])
  const [dirty, setDirty] = useState(false)
  const [snap, setSnap] = useState(false)
  // Canvas dimensions computed from the workspace size via ResizeObserver.
  // Initialized to a 9:19.5 fallback (the default device is mobile).
  const [canvasSize, setCanvasSize] = useState({ w: 280, h: 607 })
  // Local input state so users can type intermediate values like "-22.5"
  // without onInput fighting them. Commits to positions on blur/Enter.
  const [inputDraft, setInputDraft] = useState<Record<string, string>>({})

  // Photo-picker dialog state (for adding photos to the active device).
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingAdd, setPendingAdd] = useState<string[]>([])

  // Alert dialog state for replacing window.confirm
  const [alertState, setAlertState] = useState<{
    open: boolean
    title: string
    description: string
    actionText?: string
    actionCallback?: () => void
  }>({ open: false, title: '', description: '' })

  // ---- Marquee selection state -------------------------------------------
  // `marquee` holds the current drag-rectangle in canvas-relative px while the
  // user is dragging on the empty canvas. `null` = no active marquee.
  // `marqueeStart` is the mousedown point; we keep it in a ref so the mousemove
  // handler (attached to window) can read it without stale closures.
  const [marquee, setMarquee] = useState<{ left: number; top: number; w: number; h: number } | null>(null)
  // Mirror `marquee` into a ref to avoid stale closures in window event handlers.
  const marqueeRef = useRef<{ left: number; top: number; w: number; h: number } | null>(null)
  marqueeRef.current = marquee
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null)
  // Track if background-mousedown has moved past the threshold to distinguish drag from click.
  const marqueeActiveRef = useRef(false)

  // ---- Group-drag state --------------------------------------------------
  const dragIndexRef = useRef<number | null>(null)
  // Snapshot of positions at drag start to measure delta from a stable origin.
  const dragStartPosRef = useRef<PhotoPosition[] | null>(null)
  const dragStartHandleRef = useRef<{ x: number, y: number } | null>(null)

  // Read-only snapshots of the stored config arrays (for labels / counts).
  const storedMobilePhotos = (getValue(`${path}.mobilePhotos`) as string[]) ?? []
  const storedDesktopPhotos = (getValue(`${path}.desktopPhotos`) as string[]) ?? []

  // Active-device derived state (the canvas + properties panel operate on
  // these, so all the drag/resize/keyboard logic below stays device-agnostic).
  const activePhotos = device === 'mobile' ? localMobilePhotos : localDesktopPhotos
  const activePositions = device === 'mobile' ? localMobilePositions : localDesktopPositions
  const defPicker = device === 'mobile' ? mobileDefs : desktopDefs
  const setActivePhotos = device === 'mobile' ? setLocalMobilePhotos : setLocalDesktopPhotos
  const setActivePositions = device === 'mobile' ? setLocalMobilePositions : setLocalDesktopPositions

  // Use the measured canvas size; fall back to the initial state if somehow 0.
  const canvas = canvasSize.w > 0 ? canvasSize : { w: 280, h: 607 }

  // Keep refs to values the keydown handler reads so it doesn't need to
  // re-register on every state toggle (avoids stale-closure confirm dialogs).
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty
  const alertOpenRef = useRef(false)
  alertOpenRef.current = alertState.open
  const selectedRef = useRef<number[]>([])
  selectedRef.current = selected
  const deviceRef = useRef<'mobile' | 'desktop'>('mobile')
  deviceRef.current = device

  // Ref to the workspace div, used to measure available space for the canvas.
  const workspaceRef = useRef<HTMLDivElement>(null)
  // Ref to the canvas div (the device-viewport rectangle), used to convert
  // marquee mouse coordinates to canvas-relative px.
  const canvasRef = useRef<HTMLDivElement>(null)

  // Clear input drafts when selection changes so stale values from a
  // previously-edited photo don't bleed into the newly-selected photo's inputs.
  useEffect(() => { setInputDraft({}) }, [selected])

  // ---- Selection helpers ---------------------------------------------------

  /** Index of the "primary" selected photo (the one shown in single-edit mode),
   *  or null when nothing is selected. */
  const primary = selected.length > 0 ? selected[0] : null

  const clearSelection = useCallback(() => setSelected([]), [])

  /**
   * Click handler for an individual photo. Implements standard multi-select
   * semantics:
   *   - Cmd/Ctrl-click: toggle the clicked index in the current selection.
   *   - Shift-click: range-select from the anchor (last primary) to the index.
   *   - Plain click: select only this index (replacing any prior selection).
   * Clicking an already-primary photo with no modifier also keeps it selected
   * (so a plain click on the active photo doesn't deselect).
   */
  const selectPhoto = (index: number, e: MouseEvent) => {
    // e.stopPropagation() is already handled by react-rnd or we don't strictly need it 
    // because we check e.target !== e.currentTarget in the background handler, 
    // but just in case, we can keep the logic simple.
    const isMod = e.metaKey || e.ctrlKey
    if (isMod) {
      setSelected((prev) =>
        prev.includes(index)
          ? prev.filter((i) => i !== index)
          : [...prev, index],
      )
      return
    }
    if (e.shiftKey && selectedRef.current.length > 0) {
      const anchor = selectedRef.current[0]
      const from = Math.min(anchor, index)
      const to = Math.max(anchor, index)
      const range: number[] = []
      for (let i = from; i <= to; i++) range.push(i)
      // De-dup while preserving order (anchor stays first).
      setSelected(Array.from(new Set([anchor, ...range])))
      return
    }
    
    // If the item is already selected, don't clear the rest of the selection.
    // This allows the user to mousedown and start a group drag.
    // To select ONLY this item if multiple were selected, they can click the
    // background to clear, or click an unselected item.
    if (!selectedRef.current.includes(index)) {
      setSelected([index])
    }
  }

  // ---- Marquee (background drag-select) ------------------------------------

  /**
   * Convert a client (viewport) coordinate to canvas-relative px by subtracting
   * the canvas div's bounding rect. Used by the marquee handlers.
   */
  const clientToCanvasPx = (clientX: number, clientY: number) => {
    const el = canvasRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  /**
   * mousedown on the bare canvas background. Records the start point and arms
   * the marquee; the actual box only appears once the cursor moves past
   * MARQUEE_THRESHOLD (so a plain click clears the selection instead).
   */
  const handleCanvasMouseDown = (e: MouseEvent) => {
    // Only start a marquee on a bare-canvas (workspace or canvas background) mousedown.
    if (e.target !== workspaceRef.current && e.target !== canvasRef.current) return
    // Ignore right/middle clicks.
    if (e.button !== 0) return
    // Shift/Cmd-drag on the background adds to the existing selection rather
    // than replacing it; we remember the starting set so mouseup can union.
    const pt = clientToCanvasPx(e.clientX, e.clientY)
    marqueeStartRef.current = pt
    marqueeActiveRef.current = false
    e.preventDefault()
  }

  /**
   * mousemove (window-level while a marquee mousedown is armed). If the cursor
   * has moved past the threshold, mark the marquee active and update the box.
   */
  const handleWindowMouseMove = (e: MouseEvent) => {
    const start = marqueeStartRef.current
    if (!start) return
    const pt = clientToCanvasPx(e.clientX, e.clientY)
    const dx = pt.x - start.x
    const dy = pt.y - start.y
    if (!marqueeActiveRef.current) {
      if (Math.abs(dx) < MARQUEE_THRESHOLD && Math.abs(dy) < MARQUEE_THRESHOLD) return
      marqueeActiveRef.current = true
    }
    const left = Math.min(start.x, pt.x)
    const top = Math.min(start.y, pt.y)
    setMarquee({ left, top, w: Math.abs(dx), h: Math.abs(dy) })
  }

  /**
   * mouseup (window-level). If the marquee was active, compute which photos
   * intersect the box and set the selection. If it was just a click (never
   * crossed the threshold), clear the selection. Always resets marquee state.
   */
  const handleWindowMouseUp = () => {
    const start = marqueeStartRef.current
    const wasActive = marqueeActiveRef.current
    marqueeStartRef.current = null
    marqueeActiveRef.current = false
    setMarquee(null)
    if (!start || !wasActive) {
      // Plain click on background → clear selection.
      if (start) clearSelection()
      return
    }
    // Read the latest marquee box from the ref (the state may be stale in this
    // closure because the window listener isn't re-attached on every marquee
    // state change).
    const m = marqueeRef.current
    if (!m) return
    const marqueeRect = {
      left: m.left,
      top: m.top,
      right: m.left + m.w,
      bottom: m.top + m.h,
    }
    // Find photos whose rendered rect (canvas-relative px) intersects the box.
    const hits: number[] = []
    activePositions.forEach((pos, i) => {
      const w = vwToPx(pos.w, canvas.w)
      const h = vhToPx(pos.h, canvas.h)
      const left = canvas.w / 2 + vwToPx(pos.x, canvas.w) - w / 2
      const top = canvas.h / 2 + vhToPx(pos.y, canvas.h) - h / 2
      const photoRect = { left, top, right: left + w, bottom: top + h }
      if (rectsIntersect(marqueeRect, photoRect)) hits.push(i)
    })
    setSelected(hits)
  }

  // Attach window-level mousemove/mouseup only while a marquee mousedown is
  // armed (i.e. marqueeStartRef is set). We use a no-op-state-driven effect:
  // because the ref isn't reactive, we toggle a lightweight state to trigger
  // (re)attachment. Simpler: always attach while the editor is open and gate
  // inside the handlers via the ref. The handlers early-return when the ref is
  // null, so the cost is negligible.
  useEffect(() => {
    if (!open) return
    window.addEventListener('mousemove', handleWindowMouseMove)
    window.addEventListener('mouseup', handleWindowMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove)
      window.removeEventListener('mouseup', handleWindowMouseUp)
    }
  }, [open, canvas.w, canvas.h, activePositions]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Actions -------------------------------------------------------------

  const openEditor = useCallback(() => {
    const storedMobilePos = getValue(`${path}.mobilePositions`) as PhotoPosition[] | null
    const storedDesktopPos = getValue(`${path}.desktopPositions`) as PhotoPosition[] | null
    setLocalMobilePhotos([...storedMobilePhotos])
    setLocalDesktopPhotos([...storedDesktopPhotos])
    setLocalMobilePositions(syncPositions(storedMobilePos, storedMobilePhotos.length, mobileDefs))
    setLocalDesktopPositions(syncPositions(storedDesktopPos, storedDesktopPhotos.length, desktopDefs))
    setDirty(false)
    setSelected([])
    setPendingAdd([])
    setDevice('mobile')
    setOpen(true)
  }, [path, storedMobilePhotos, storedDesktopPhotos]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Apply a patch to a single photo's position. Used by resize, keyboard
   * nudge and single-field edits (NOT by group drag — that goes through
   * handleDragStop's commit path).
   */
  const updatePosition = (
    index: number,
    patch: Partial<PhotoPosition>,
  ) => {
    setActivePositions((prev) => {
      if (!prev[index]) return prev
      const cur = prev[index]
      const next: PhotoPosition = { ...cur }
      if (patch.x !== undefined) next.x = clamp(patch.x, RANGES.x.min, RANGES.x.max)
      if (patch.y !== undefined) next.y = clamp(patch.y, RANGES.y.min, RANGES.y.max)
      if (patch.w !== undefined) next.w = clamp(patch.w, RANGES.w.min, RANGES.w.max)
      if (patch.h !== undefined) next.h = clamp(patch.h, RANGES.h.min, RANGES.h.max)
      if (patch.z !== undefined) next.z = clamp(Math.round(patch.z), RANGES.z.min, RANGES.z.max)
      if (patch.br !== undefined) next.br = clamp(Math.round(patch.br), RANGES.br.min, RANGES.br.max)
      const copy = [...prev]
      copy[index] = next
      return copy
    })
    setDirty(true)
  }

  /**
   * Apply the same patch to every selected photo. Used for bulk Z-index and
   * bulk border-radius edits. Indices outside the active array are skipped.
   */
  const updatePositionsBulk = (indices: number[], patch: Partial<PhotoPosition>) => {
    if (indices.length === 0) return
    setActivePositions((prev) => {
      const copy = prev.map((p) => ({ ...p }))
      for (const idx of indices) {
        if (!copy[idx]) continue
        if (patch.z !== undefined) copy[idx].z = clamp(Math.round(patch.z), RANGES.z.min, RANGES.z.max)
        if (patch.br !== undefined) copy[idx].br = clamp(Math.round(patch.br), RANGES.br.min, RANGES.br.max)
        if (patch.x !== undefined) copy[idx].x = clamp(patch.x, RANGES.x.min, RANGES.x.max)
        if (patch.y !== undefined) copy[idx].y = clamp(patch.y, RANGES.y.min, RANGES.y.max)
        if (patch.w !== undefined) copy[idx].w = clamp(patch.w, RANGES.w.min, RANGES.w.max)
        if (patch.h !== undefined) copy[idx].h = clamp(patch.h, RANGES.h.min, RANGES.h.max)
      }
      return copy
    })
    setDirty(true)
  }

  // ---- Group drag (transient delta approach) -------------------------------

  /**
   * onDragStart for a photo's Rnd. Snapshots the active positions so the
   * delta is measured from a stable origin, and records which photo is the
   * drag handle. If the dragged photo isn't in the selection, we select only
   * it (matching standard file-manager behavior).
   */
  const handlePhotoDragStart = (index: number, d: { x: number; y: number }) => {
    dragStartPosRef.current = activePositions.map((p) => ({ ...p }))
    dragIndexRef.current = index
    dragStartHandleRef.current = { x: d.x, y: d.y }
  }

  const handlePhotoDrag = (index: number, d: { x: number; y: number }) => {
    const sel = selectedRef.current
    const isGroupDrag = sel.length > 1 && sel.includes(index)
    if (!isGroupDrag || !dragStartPosRef.current || !dragStartHandleRef.current) return

    const startPx = dragStartHandleRef.current
    const dxPx = d.x - startPx.x
    const dyPx = d.y - startPx.y
    const dxVw = pxToVw(dxPx, canvas.w)
    const dyVh = pxToVh(dyPx, canvas.h)

    setActivePositions((prev) => {
      const copy = prev.map((p) => ({ ...p }))
      const startList = dragStartPosRef.current!
      for (const idx of sel) {
        if (idx === index) continue // Let react-rnd handle the dragged item internally
        const startPos = startList[idx]
        if (!startPos || !copy[idx]) continue
        let x = startPos.x + dxVw
        let y = startPos.y + dyVh
        // we don't snap mid-drag for followers to keep it smooth
        copy[idx] = { ...copy[idx], x: clamp(x, RANGES.x.min, RANGES.x.max), y: clamp(y, RANGES.y.min, RANGES.y.max) }
      }
      return copy
    })
  }

  const handlePhotoDragStop = (index: number, d: { x: number; y: number }) => {
    const startList = dragStartPosRef.current
    const sel = selectedRef.current
    const startPx = dragStartHandleRef.current || { x: d.x, y: d.y }
    const dxPx = d.x - startPx.x
    const dyPx = d.y - startPx.y
    const dxVw = pxToVw(dxPx, canvas.w)
    const dyVh = pxToVh(dyPx, canvas.h)

    const isGroupDrag = sel.length > 1 && sel.includes(index)

    setActivePositions((prev) => {
      const copy = prev.map((p) => ({ ...p }))
      if (!isGroupDrag || !startList) {
        // Single drag: use the dragged item's final position directly.
        const pos = prev[index]
        if (pos) {
          const w = vwToPx(pos.w, canvas.w)
          const h = vhToPx(pos.h, canvas.h)
          let x = pxToVw(d.x + w / 2 - canvas.w / 2, canvas.w)
          let y = pxToVh(d.y + h / 2 - canvas.h / 2, canvas.h)
          if (snap) { x = snapVal(x); y = snapVal(y) }
          copy[index] = { ...copy[index], x: clamp(x, RANGES.x.min, RANGES.x.max), y: clamp(y, RANGES.y.min, RANGES.y.max) }
        }
      } else {
        // Group drag
        for (const idx of sel) {
          const startPos = startList[idx]
          if (!startPos || !copy[idx]) continue
          let x = startPos.x + dxVw
          let y = startPos.y + dyVh
          if (snap) { x = snapVal(x); y = snapVal(y) }
          copy[idx] = { ...copy[idx], x: clamp(x, RANGES.x.min, RANGES.x.max), y: clamp(y, RANGES.y.min, RANGES.y.max) }
        }
      }
      return copy
    })

    dragStartPosRef.current = null
    dragIndexRef.current = null
    dragStartHandleRef.current = null
    setDirty(true)
  }

  const handleResizeStop = (
    index: number,
    ref: HTMLElement,
    position: { x: number; y: number },
  ) => {
    let w = pxToVw(ref.offsetWidth, canvas.w)
    let h = pxToVh(ref.offsetHeight, canvas.h)
    // Convert react-rnd top-left (px) back to center-origin (vw/vh).
    // The element's center is at (position.x + ref.offsetWidth/2, position.y + ref.offsetHeight/2).
    let x = pxToVw(position.x + ref.offsetWidth / 2 - canvas.w / 2, canvas.w)
    let y = pxToVh(position.y + ref.offsetHeight / 2 - canvas.h / 2, canvas.h)
    if (snap) { w = snapVal(w); h = snapVal(h); x = snapVal(x); y = snapVal(y) }
    updatePosition(index, { w, h, x, y })
  }

  const handleInputChange = (field: keyof PhotoPosition, raw: string, bulkIndices?: number[]) => {
    if (raw === '' || raw === '-' || raw === '.') return
    const num = Number(raw)
    if (Number.isNaN(num)) return
    if (bulkIndices && bulkIndices.length > 1) {
      updatePositionsBulk(bulkIndices, { [field]: num } as Partial<PhotoPosition>)
    } else {
      const idx = bulkIndices ? bulkIndices[0] : primary
      if (idx === null) return
      updatePosition(idx, { [field]: num } as Partial<PhotoPosition>)
    }
  }

  const commitInput = (field: keyof PhotoPosition, bulkIndices?: number[]) => {
    const raw = inputDraft[field]
    if (raw === undefined) return
    handleInputChange(field, raw, bulkIndices)
    setInputDraft((d) => { const next = { ...d }; delete next[field]; return next })
  }

  const handleDeviceToggle = (next: 'mobile' | 'desktop') => {
    if (next === device) return
    if (dirtyRef.current) {
      setAlertState({
        open: true,
        title: 'Unsaved Changes',
        description: 'You have unsaved changes. Switch device anyway?',
        actionText: 'Switch Device',
        actionCallback: () => {
          setDevice(next)
          setSelected([])
        }
      })
      return
    }
    setDevice(next)
    setSelected([])
  }

  const handleCopyMobileToDesktop = () => {
    setAlertState({
      open: true,
      title: 'Overwrite Positions',
      description: 'Overwrite desktop positions with the current mobile positions for all overlapping photos? Continue?',
      actionText: 'Overwrite',
      actionCallback: () => {
        setLocalDesktopPositions((prev) => {
          const result: PhotoPosition[] = []
          for (let i = 0; i < prev.length; i++) {
            // Only copy where mobile has a corresponding photo; leave the rest as-is.
            result.push(i < localMobilePositions.length ? clone(localMobilePositions[i]) : prev[i])
          }
          return result
        })
        setDirty(true)
      }
    })
  }

  const handleReset = () => {
    setAlertState({
      open: true,
      title: 'Reset Positions',
      description: `Reset ${device} positions to the hardcoded defaults?`,
      actionText: 'Reset',
      actionCallback: () => {
        setActivePositions((prev) => prev.map((_, i) => defPicker(i)))
        setDirty(true)
      }
    })
  }

  const handleFront = () => {
    if (selected.length === 0) return
    if (selected.length === 1) {
      const maxZ = Math.max(...activePositions.map((p) => p.z))
      updatePosition(selected[0], { z: maxZ + 1 })
    } else {
      // Bulk: bring all selected to the front, preserving their relative order.
      const baseMax = Math.max(...activePositions.map((p) => p.z))
      const sorted = [...selected].sort((a, b) => activePositions[a].z - activePositions[b].z)
      setActivePositions((prev) => {
        const copy = prev.map((p) => ({ ...p }))
        sorted.forEach((idx, i) => { if (copy[idx]) copy[idx].z = baseMax + 1 + i })
        return copy
      })
      setDirty(true)
    }
  }

  const handleBack = () => {
    if (selected.length === 0) return
    if (selected.length === 1) {
      const minZ = Math.min(...activePositions.map((p) => p.z))
      updatePosition(selected[0], { z: Math.max(RANGES.z.min, minZ - 1) })
    } else {
      const baseMin = Math.min(...activePositions.map((p) => p.z))
      const sorted = [...selected].sort((a, b) => activePositions[b].z - activePositions[a].z)
      setActivePositions((prev) => {
        const copy = prev.map((p) => ({ ...p }))
        sorted.forEach((idx, i) => { if (copy[idx]) copy[idx].z = Math.max(RANGES.z.min, baseMin - 1 - i) })
        return copy
      })
      setDirty(true)
    }
  }

  const handleRemoveSelected = () => {
    if (selected.length === 0) return
    const count = selected.length
    const label = count === 1 ? `photo #${selected[0]}` : `${count} photos`
    setAlertState({
      open: true,
      title: 'Remove Photos',
      description: `Remove ${label} from the ${device} layout?`,
      actionText: 'Remove',
      actionCallback: () => {
        // Remove in descending index order so earlier removals don't shift
        // the indices of later ones.
        const indices = [...selected].sort((a, b) => b - a)
        setActivePhotos((prev) => {
          let next = prev
          for (const idx of indices) next = next.filter((_, i) => i !== idx)
          return next
        })
        setActivePositions((prev) => {
          let next = prev
          for (const idx of indices) next = next.filter((_, i) => i !== idx)
          return next
        })
        setSelected([])
        setDirty(true)
      }
    })
  }

  const togglePendingAdd = (photoPath: string) => {
    setPendingAdd((prev) =>
      prev.includes(photoPath) ? prev.filter((p) => p !== photoPath) : [...prev, photoPath],
    )
  }

  const handleConfirmAdd = () => {
    if (pendingAdd.length === 0) {
      setPickerOpen(false)
      return
    }
    const firstNewIndex = activePhotos.length
    setActivePhotos((prev) => [...prev, ...pendingAdd])
    setActivePositions((prev) => {
      const next = [...prev]
      for (let i = 0; i < pendingAdd.length; i++) {
        next.push(defPicker(prev.length + i))
      }
      return next
    })
    setSelected([firstNewIndex])
    setDirty(true)
    setPendingAdd([])
    setPickerOpen(false)
  }

  const handleClose = useCallback(() => {
    if (dirtyRef.current) {
      setAlertState({
        open: true,
        title: 'Unsaved Changes',
        description: 'You have unsaved changes. Close anyway?',
        actionText: 'Close Anyway',
        actionCallback: () => {
          setOpen(false)
          setPickerOpen(false)
        }
      })
      return
    }
    setOpen(false)
    setPickerOpen(false)
  }, [])

  const handleSave = useCallback(async () => {
    // Write the whole immersiveGallery object in a single setValue call (the
    // established save pattern in this codebase) so flushSave sees a coherent
    // snapshot. Constructing the object explicitly — rather than spreading the
    // stored value — also drops any lingering pre-separation `photos` /
    // `positions` keys from older SQLite blobs, keeping the stored schema clean.
    const stored = getValue(path) as Record<string, unknown> | undefined
    setValue(path, {
      enabled: (stored?.enabled as boolean) ?? true,
      text: (stored?.text as string) ?? '',
      mobilePhotos: localMobilePhotos,
      mobilePositions: localMobilePositions,
      desktopPhotos: localDesktopPhotos,
      desktopPositions: localDesktopPositions,
    })
    await flushSave()
    setDirty(false)
    setOpen(false)
    pushToast('success', 'Layout saved. Click Republish to apply to the live site.')
  }, [path, localMobilePhotos, localMobilePositions, localDesktopPhotos, localDesktopPositions]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Effects -------------------------------------------------------------

  // Escape -> close (with dirty confirm); Arrow keys -> nudge selected photo(s)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (alertOpenRef.current) return
      if (e.key === 'Escape') {
        if (pickerOpen) { setPickerOpen(false); return }
        if (selectedRef.current.length > 0) { setSelected([]); return }
        if (dirtyRef.current) {
          setAlertState({
            open: true,
            title: 'Unsaved Changes',
            description: 'You have unsaved changes. Close anyway?',
            actionText: 'Close Anyway',
            actionCallback: () => {
              setOpen(false)
              setPickerOpen(false)
            }
          })
          return
        }
        setOpen(false)
        return
      }
      // Don't nudge the canvas while the photo picker is open.
      if (pickerOpen) return
      // Cmd/Ctrl+A: select all photos on the active device.
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        if (activePhotos.length === 0) return
        const target = e.target as HTMLElement
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
        e.preventDefault()
        setSelected(activePhotos.map((_, i) => i))
        return
      }
      // Arrow-key nudge: move every selected photo by 1vw/vh (Shift = 5vw/vh).
      // Skip if the user is typing in an input/textarea so arrow keys still
      // work for editing number fields.
      if (selectedRef.current.length === 0) return
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const step = e.shiftKey ? 5 : 1
      const active = deviceRef.current === 'mobile' ? localMobilePositions : localDesktopPositions
      const sel = selectedRef.current
      if (e.key === 'ArrowLeft') {
        updatePositionsBulk(sel, { x: (active[sel[0]]?.x ?? 0) - step })
        e.preventDefault()
      } else if (e.key === 'ArrowRight') {
        updatePositionsBulk(sel, { x: (active[sel[0]]?.x ?? 0) + step })
        e.preventDefault()
      } else if (e.key === 'ArrowUp') {
        updatePositionsBulk(sel, { y: (active[sel[0]]?.y ?? 0) - step })
        e.preventDefault()
      } else if (e.key === 'ArrowDown') {
        updatePositionsBulk(sel, { y: (active[sel[0]]?.y ?? 0) + step })
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, selected, device, localMobilePositions, localDesktopPositions, pickerOpen, activePhotos.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Compute the largest canvas that fits the workspace while maintaining the
  // device aspect ratio. This ensures photo shapes in the editor match what
  // users see on real devices (modern phones are 9:19.5, not 9:16).
  useEffect(() => {
    if (!open || !workspaceRef.current) return
    const el = workspaceRef.current
    const ratio = ASPECT[device]
    const update = () => {
      const pad = 80 // p-10 = 40px each side
      const availW = el.clientWidth - pad
      const availH = el.clientHeight - pad
      if (availW <= 0 || availH <= 0) return
      const r = ratio.w / ratio.h
      let w = availW
      let h = w / r
      if (h > availH) {
        h = availH
        w = h * r
      }
      setCanvasSize({ w: Math.round(w), h: Math.round(h) })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open, device])

  // ---- Derived -------------------------------------------------------------

  // The position shown in single-edit mode (X/Y/W/H/Z/br).
  const selectedPos: PhotoPosition | null =
    primary !== null && activePositions[primary]
      ? activePositions[primary]
      : null

  // Shared value for bulk-editable fields across the selection. When all
  // selected photos share the same value, show it; otherwise show a blank
  // placeholder so the user knows the values differ.
  const bulkZ = (() => {
    if (selected.length === 0) return undefined
    const zs = selected.map((i) => activePositions[i]?.z)
    if (zs.every((v) => v === zs[0])) return zs[0]
    return undefined // mixed
  })()
  const bulkBr = (() => {
    if (selected.length === 0) return undefined
    const brs = selected.map((i) => brOf(activePositions[i]))
    if (brs.every((v) => v === brs[0])) return brs[0]
    return undefined // mixed
  })()

  // Flatten the build-time manifest into a category-grouped list for the picker.
  const pickerCategories: Array<{ slug: string; name: string; photos: string[] }> =
    (manifest as any).categories.map((c: any) => ({
      slug: c.slug,
      name: c.name || c.slug,
      photos: c.photos.map((p: any) => p.filename),
    }))

  // ---- Render --------------------------------------------------------------

  const isMulti = selected.length > 1

  return (
    <>
      <div className="space-y-1.5">
        <Button variant="secondary" size="sm" onClick={openEditor}>
          Edit Layout
        </Button>
        <p className="text-xs text-muted">
          Curate and position photos separately for mobile and desktop.
          {storedMobilePhotos.length > 0 || storedDesktopPhotos.length > 0
            ? ` Mobile: ${storedMobilePhotos.length}, Desktop: ${storedDesktopPhotos.length}.`
            : ' No photos yet — add them inside the editor.'}
        </p>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) handleClose()
          }}
        >
          {/* overflow-hidden fixes the squared-corner glitch where the inner
              header/body/footer bg-surface spilled past the rounded modal frame. */}
          <div className="bg-canvas border border-border rounded-lg w-full max-w-5xl h-[85vh] flex flex-col shadow-xl overflow-hidden">
            {/* ---- Header ---- */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface">
              <h2 className="text-base font-semibold text-ink">Immersive Gallery Layout Editor</h2>
              <div className="flex items-center gap-3">
                <div className="flex bg-canvas border border-border rounded-sm overflow-hidden">
                  <button
                    type="button"
                    onClick={() => handleDeviceToggle('mobile')}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      device === 'mobile'
                        ? 'bg-primary text-primary-text'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    Mobile
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeviceToggle('desktop')}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      device === 'desktop'
                        ? 'bg-primary text-primary-text'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    Desktop
                  </button>
                </div>
                {/* Snap-to-grid toggle */}
                <button
                  type="button"
                  onClick={() => setSnap((s) => !s)}
                  className={`px-2.5 py-1 text-xs font-medium border rounded-sm transition-colors ${
                    snap
                      ? 'bg-primary text-primary-text border-primary'
                      : 'bg-canvas text-muted border-border hover:text-ink'
                  }`}
                  title="Snap positions/sizes to a 2vw/2vh grid"
                >
                  Snap to grid
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="text-muted hover:text-ink transition-colors text-lg leading-none px-1"
                  aria-label="Close"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* ---- Body: canvas (left) + properties (right) ---- */}
            <div className="flex-1 flex overflow-hidden">
              {/* Workspace — scrollable dark area. The canvas (viewport) is
                  centered here with overflow:visible so photos with negative
                  coordinates render outside it (in the dark workspace),
                  visually indicating "off-screen" on the live site. No Rnd
                  bounds constraint; clamping in updatePosition limits to
                  ±50vw / ±60vh. */}
              <div
                ref={workspaceRef}
                className="flex-1 flex items-center justify-center p-10 overflow-auto"
                style={{ background: 'rgba(0,0,0,0.5)' }}
                onMouseDown={handleCanvasMouseDown}
              >
                <div
                  ref={canvasRef}
                  className="relative bg-surface border-2 border-border shadow-inner"
                  style={{ width: canvas.w, height: canvas.h, overflow: 'visible' }}
                >
                  {activePhotos.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
                      No photos — use “Add Photo” to start
                    </div>
                  ) : (
                    activePhotos.map((photo, i) => {
                      const pos = activePositions[i] ?? defPicker(i)
                      const isSel = selected.includes(i)
                      const br = brOf(pos)
                      return (
                        <RndAny
                          key={`${photo}-${i}`}
                          size={{
                            width: vwToPx(pos.w, canvas.w),
                            height: vhToPx(pos.h, canvas.h),
                          }}
                          position={{
                            x: canvas.w / 2 + vwToPx(pos.x, canvas.w) - vwToPx(pos.w, canvas.w) / 2,
                            y: canvas.h / 2 + vhToPx(pos.y, canvas.h) - vhToPx(pos.h, canvas.h) / 2,
                          }}
                          onDragStart={(_e: any, d: any) => handlePhotoDragStart(i, { x: d.x, y: d.y })}
                          onDrag={(_e: any, d: any) => handlePhotoDrag(i, { x: d.x, y: d.y })}
                          onDragStop={(_e: any, d: any) => handlePhotoDragStop(i, { x: d.x, y: d.y })}
                          onResizeStop={(
                            _e: any,
                            _dir: any,
                            ref: any,
                            _delta: any,
                            position: any,
                          ) => handleResizeStop(i, ref, position)}
                          onMouseDown={(e: MouseEvent) => selectPhoto(i, e)}
                          enableResizing={ALL_HANDLES}
                          minWidth={vwToPx(RANGES.w.min, canvas.w)}
                          minHeight={vhToPx(RANGES.h.min, canvas.h)}
                          resizeHandleStyles={RESIZE_HANDLES}
                          style={{
                            zIndex: pos.z,
                            border: isSel
                              ? selected.length > 1
                                ? '2px dashed var(--color-primary)'
                                : '2px solid var(--color-primary)'
                              : '1px solid var(--color-border)',
                            borderRadius: `${br}px`,
                            overflow: 'hidden',
                            cursor: 'move',
                            boxSizing: 'border-box',
                          }}
                        >
                          <div className="relative w-full h-full">
                            <img
                              src={thumbUrl(photo)}
                              alt={`Photo ${i}`}
                              className="w-full h-full object-cover select-none pointer-events-none"
                              draggable={false}
                            />
                            <span className="absolute top-0.5 left-1 text-[10px] font-mono text-white bg-black/60 px-1 rounded-sm pointer-events-none">
                              {i}
                            </span>
                          </div>
                        </RndAny>
                      )
                    })
                  )}

                  {/* Marquee selection box — rendered above photos while the
                      user is drag-selecting on the background. */}
                  {marquee && (
                    <div
                      className="absolute border border-primary bg-primary/20 pointer-events-none z-[150]"
                      style={{
                        left: marquee.left,
                        top: marquee.top,
                        width: marquee.w,
                        height: marquee.h,
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Properties panel */}
              <div className="w-64 border-l border-border bg-surface overflow-y-auto flex flex-col">
                <div className="p-4 border-b border-border">
                  <h3 className="text-sm font-semibold text-ink">
                    {isMulti
                      ? `${selected.length} photos · ${device}`
                      : primary !== null
                        ? `Photo ${primary} · ${device}`
                        : `${device} · ${activePhotos.length} photo${activePhotos.length === 1 ? '' : 's'}`}
                  </h3>
                  {isMulti && (
                    <p className="text-[10px] text-muted mt-1">
                      Shift/Cmd-click or drag on the background to select. X/Y/W/H hidden for multi-select.
                    </p>
                  )}
                </div>

                {selectedPos ? (
                  <div className="p-4 space-y-5 flex-1">
                    {/* Position — only editable when a single photo is selected.
                        For multi-select, per-photo geometry isn't a meaningful
                        batch operation, so hide these inputs. */}
                    {!isMulti && (
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted uppercase tracking-wide">Position (vw / vh)</label>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <span className="text-[10px] text-muted">X</span>
                            <input
                              type="number"
                              value={inputDraft.x ?? selectedPos.x}
                              step={0.5}
                              min={RANGES.x.min}
                              max={RANGES.x.max}
                              onInput={(e) => setInputDraft((d) => ({ ...d, x: (e.currentTarget as HTMLInputElement).value }))}
                              onBlur={() => commitInput('x')}
                              onKeyDown={(e) => { if (e.key === 'Enter') commitInput('x') }}
                              className="w-full h-8 px-2 text-sm bg-canvas border border-border rounded-sm text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
                            />
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] text-muted">Y</span>
                            <input
                              type="number"
                              value={inputDraft.y ?? selectedPos.y}
                              step={0.5}
                              min={RANGES.y.min}
                              max={RANGES.y.max}
                              onInput={(e) => setInputDraft((d) => ({ ...d, y: (e.currentTarget as HTMLInputElement).value }))}
                              onBlur={() => commitInput('y')}
                              onKeyDown={(e) => { if (e.key === 'Enter') commitInput('y') }}
                              className="w-full h-8 px-2 text-sm bg-canvas border border-border rounded-sm text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Size — single-select only (same rationale as Position). */}
                    {!isMulti && (
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted uppercase tracking-wide">Size (vw / vh)</label>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <span className="text-[10px] text-muted">W</span>
                            <input
                              type="number"
                              value={inputDraft.w ?? selectedPos.w}
                              step={0.5}
                              min={RANGES.w.min}
                              max={RANGES.w.max}
                              onInput={(e) => setInputDraft((d) => ({ ...d, w: (e.currentTarget as HTMLInputElement).value }))}
                              onBlur={() => commitInput('w')}
                              onKeyDown={(e) => { if (e.key === 'Enter') commitInput('w') }}
                              className="w-full h-8 px-2 text-sm bg-canvas border border-border rounded-sm text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
                            />
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] text-muted">H</span>
                            <input
                              type="number"
                              value={inputDraft.h ?? selectedPos.h}
                              step={0.5}
                              min={RANGES.h.min}
                              max={RANGES.h.max}
                              onInput={(e) => setInputDraft((d) => ({ ...d, h: (e.currentTarget as HTMLInputElement).value }))}
                              onBlur={() => commitInput('h')}
                              onKeyDown={(e) => { if (e.key === 'Enter') commitInput('h') }}
                              className="w-full h-8 px-2 text-sm bg-canvas border border-border rounded-sm text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Z-index — editable only for single selection. */}
                    {!isMulti && (
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted uppercase tracking-wide">
                          Z-index
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={inputDraft.z ?? selectedPos?.z ?? ''}
                            step={1}
                            min={RANGES.z.min}
                            max={RANGES.z.max}
                            onInput={(e) => setInputDraft((d) => ({ ...d, z: (e.currentTarget as HTMLInputElement).value }))}
                            onBlur={() => commitInput('z', selected)}
                            onKeyDown={(e) => { if (e.key === 'Enter') commitInput('z', selected) }}
                            className="w-20 h-8 px-2 text-sm bg-canvas border border-border rounded-sm text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
                          />
                          <button
                            type="button"
                            onClick={handleFront}
                            className="h-8 px-2 text-xs bg-surface border border-border rounded-sm text-ink hover:bg-surface-hover transition-colors"
                          >
                            Front
                          </button>
                          <button
                            type="button"
                            onClick={handleBack}
                            className="h-8 px-2 text-xs bg-surface border border-border rounded-sm text-ink hover:bg-surface-hover transition-colors"
                          >
                            Back
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Border Radius — range slider for both single and bulk.
                        Sliders only emit valid integers, so we commit directly
                        to state on every change (no inputDraft needed, unlike
                        the text number fields where "-" / "." are intermediate). */}
                    <BorderRadiusSlider
                      value={bulkBr}
                      isMulti={isMulti}
                      isMixed={isMulti && bulkBr === undefined}
                      onChange={(v) => {
                        if (isMulti) {
                          updatePositionsBulk(selected, { br: v })
                        } else if (primary !== null) {
                          updatePosition(primary, { br: v })
                        }
                      }}
                    />

                    {/* Remove + Reset */}
                    <div className="space-y-2 pt-2 border-t border-border">
                      <button
                        type="button"
                        onClick={handleRemoveSelected}
                        className="w-full h-8 px-3 text-xs bg-surface border border-border rounded-sm text-error hover:bg-surface-hover transition-colors inline-flex items-center justify-center gap-1.5"
                      >
                        <TrashIcon size={14} /> Remove {isMulti ? `${selected.length} Photos` : 'Photo'}
                      </button>
                      {device === 'desktop' && (
                        <button
                          type="button"
                          onClick={handleCopyMobileToDesktop}
                          className="w-full h-8 px-3 text-xs bg-surface border border-border rounded-sm text-ink hover:bg-surface-hover transition-colors"
                        >
                          Copy mobile &rarr; desktop
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleReset}
                        className="w-full h-8 px-3 text-xs bg-surface border border-border rounded-sm text-error hover:opacity-80 transition-opacity"
                      >
                        Reset to default
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 flex-1 flex flex-col items-center justify-center gap-3">
                    <p className="text-sm text-muted text-center">Select a photo on the canvas to edit its position.</p>
                    <p className="text-[10px] text-muted/70 text-center -mt-1">Shift/Cmd-click or drag on the background to multi-select · Cmd+A for all</p>
                    <button
                      type="button"
                      onClick={() => { setPendingAdd([]); setPickerOpen(true) }}
                      className="inline-flex items-center gap-1.5 text-xs bg-surface border border-border text-ink px-3 py-1.5 rounded-sm hover:bg-surface-hover transition-colors"
                    >
                      <PlusIcon size={14} /> Add Photo
                    </button>
                  </div>
                )}

                {/* Add Photo is always reachable from the panel footer. */}
                {selectedPos && (
                  <div className="p-3 border-t border-border">
                    <button
                      type="button"
                      onClick={() => { setPendingAdd([]); setPickerOpen(true) }}
                      className="w-full h-8 px-3 text-xs bg-surface border border-border rounded-sm text-ink hover:bg-surface-hover transition-colors inline-flex items-center justify-center gap-1.5"
                    >
                      <PlusIcon size={14} /> Add Photo
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ---- Footer ---- */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface">
              <p className="text-xs text-muted">
                Changes save to config. Run &ldquo;Republish&rdquo; to apply to the live site.
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={handleClose}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={handleSave}>
                  Save
                </Button>
              </div>
            </div>
          </div>

          {/* ---- Photo picker (rendered above the editor modal) ---- */}
          {pickerOpen && (
            <div
              className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setPickerOpen(false)
              }}
            >
              <div className="bg-canvas border border-border rounded-lg w-full max-w-3xl max-h-[80vh] flex flex-col shadow-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface">
                  <h3 className="text-sm font-semibold text-ink">
                    Add photos to {device} layout
                  </h3>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(false)}
                    className="text-muted hover:text-ink transition-colors text-lg leading-none px-1"
                    aria-label="Close"
                  >
                    &times;
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  <div className="mb-3 text-xs text-muted">
                    Selected: {pendingAdd.length}
                  </div>
                  {pickerCategories.length === 0 && (
                    <p className="text-sm text-muted">No categories available. Add photos to your photos source and regenerate.</p>
                  )}
                  {pickerCategories.map((cat) => (
                    <div key={cat.slug} className="mb-6">
                      <h4 className="text-sm font-medium mb-2 text-muted">{cat.name}</h4>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                        {cat.photos.map((filename) => {
                          const photoPath = `${cat.slug}/${filename}`
                          const isSelected = pendingAdd.includes(photoPath)
                          const alreadyAdded = activePhotos.includes(photoPath)
                          return (
                            <div
                              key={photoPath}
                              onClick={() => !alreadyAdded && togglePendingAdd(photoPath)}
                              className={`relative aspect-square rounded-sm overflow-hidden border-2 transition-all ${
                                isSelected
                                  ? 'border-primary ring-1 ring-primary'
                                  : 'border-transparent hover:border-border'
                              } ${alreadyAdded ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                              title={alreadyAdded ? 'Already in this layout' : filename}
                            >
                              <img
                                src={`/photos/thumbs/${cat.slug}/${filename.replace(/\.[^.]+$/, '.webp')}`}
                                alt={filename}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                              {isSelected && (
                                <div className="absolute top-1 right-1 bg-primary text-primary-text rounded-full p-0.5">
                                  <CheckIcon size={12} />
                                </div>
                              )}
                              {alreadyAdded && (
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                  <span className="text-[10px] text-white">Added</span>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2 px-4 py-3 border-t border-border bg-surface">
                  <Button variant="secondary" size="sm" onClick={() => setPickerOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" onClick={handleConfirmAdd} disabled={pendingAdd.length === 0}>
                    Add Selected ({pendingAdd.length})
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <AlertDialog open={alertState.open} onOpenChange={(o) => setAlertState(prev => ({ ...prev, open: o }))}>
        {(<AlertDialogContent className="z-[120]" overlayClassName="z-[120]">
          {(<AlertDialogHeader>
            {(<AlertDialogTitle>{alertState.title}</AlertDialogTitle>) as any}
            {(<AlertDialogDescription>
              {alertState.description}
            </AlertDialogDescription>) as any}
          </AlertDialogHeader>) as any}
          {(<AlertDialogFooter>
            {(<AlertDialogCancel>Cancel</AlertDialogCancel>) as any}
            {(<AlertDialogAction onClick={() => {
              alertState.actionCallback?.()
            }}>
              {alertState.actionText || 'Continue'}
            </AlertDialogAction>) as any}
          </AlertDialogFooter>) as any}
        </AlertDialogContent>) as any}
      </AlertDialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// BorderRadiusSlider — a range slider with a numeric readout. Used for both
// single-select and bulk border-radius editing. In bulk mode with mixed
// values, the slider renders at 0 with a "mixed" label until the user drags it
// (at which point all selected photos adopt the dragged value).
// ---------------------------------------------------------------------------

interface BorderRadiusSliderProps {
  /** Current value, or undefined when photos have differing br values. */
  value: number | undefined
  isMulti: boolean
  isMixed: boolean
  onChange: (v: number) => void
}

function BorderRadiusSlider({ value, isMulti, isMixed, onChange }: BorderRadiusSliderProps) {
  // Render 0 for the thumb position when mixed; the label shows "mixed".
  // Once the user drags, onChange fires and all selected photos adopt the new
  // value, so isMixed becomes false and the thumb tracks normally.
  const sliderVal = isMixed ? 0 : (value ?? 0)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted uppercase tracking-wide">
          Border Radius (px){isMulti ? ' (bulk)' : ''}
        </label>
        <span className="text-xs font-mono text-ink tabular-nums">
          {isMixed ? 'mixed' : `${sliderVal}px`}
        </span>
      </div>
      <input
        type="range"
        min={RANGES.br.min}
        max={RANGES.br.max}
        step={1}
        value={sliderVal}
        // Preact/React wire `onChange` for range inputs to the input event
        // (continuous), so a single handler is enough and the thumb tracks the
        // cursor. No draft/commit split is needed because a slider only emits
        // valid integers (unlike text number inputs where "-" / "." are valid
        // intermediate states).
        onChange={(e) => {
          const v = Number((e.currentTarget as HTMLInputElement).value)
          onChange(v)
        }}
        className="w-full h-2 rounded-full appearance-none cursor-pointer bg-canvas border border-border accent-primary"
      />
    </div>
  )
}
