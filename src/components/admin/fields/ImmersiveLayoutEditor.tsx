import { useState, useRef, useEffect, useCallback, useId } from 'preact/hooks'
import { useConfig } from '../../../lib/admin/store'
import type { PhotoPosition } from '../../../lib/admin/types'
import { Button } from '../ui/Button'
import { STAGE, resolveLayers, layerScale, layerOpacity, taglineFrame, INTENSITY, type Intensity } from '../../../lib/immersive-motion'
import { useModalFocus } from './immersive/dialog'
import manifest from '../../../generated/categories.json'
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
import {
  RANGES,
  ASPECT,
  MARQUEE_THRESHOLD,
  vwToPx,
  vhToPx,
  pxToVw,
  pxToVh,
  snapVal,
  clone,
  brOf,
  mobileDefs,
  desktopDefs,
  thumbUrl,
  rectsIntersect,
  applyPatch,
  computeSnap,
  reorderDepth,
  applyTypedDepth,
  layoutSnapshot,
  copyMobilePositionsToDesktop,
  nudgePositions,
  readDeviceDraft,
  type DepthMove,
  type Guide,
} from './immersive/utils'
import { PlusIcon, TrashIcon, CropIcon } from './immersive/icons'
import { BorderRadiusSlider } from './immersive/BorderRadiusSlider'
import { CropEditor } from './immersive/CropEditor'
import { PhotoPicker, type PickerCategory } from './immersive/PhotoPicker'
import { CanvasPhoto } from './immersive/CanvasPhoto'

interface Props {
  /** Dotted config path to the immersiveGallery object, e.g. "home.immersiveGallery". */
  path: string
}

export function ImmersiveLayoutEditor({ path }: Props) {
  const { getValue, setValue, flushSave, pushToast, toasts } = useConfig()

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
  const [saveError, setSaveError] = useState('')
  const saveToastIdsRef = useRef<Set<number>>(new Set())
  const [openNotice, setOpenNotice] = useState('')
  const [previewProgress, setPreviewProgress] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false)
  const snapshotRef = useRef<{ value: unknown } | null>(null)
  const deviceSelectionsRef = useRef<{ mobile: number[]; desktop: number[] }>({ mobile: [], desktop: [] })
  const id = useId()
  const [snap, setSnap] = useState(false)
  const [smartAlign, setSmartAlign] = useState(true)
  const [showGrid, setShowGrid] = useState(false)
  const [guides, setGuides] = useState<Guide[]>([])
  const [cropOpen, setCropOpen] = useState<number | null>(null)
  // Canvas dimensions computed from the workspace size via ResizeObserver.
  // Initialized to a 9:19.5 fallback (the default device is mobile).
  const [canvasSize, setCanvasSize] = useState({ w: 280, h: 607 })
  // Local input state so users can type intermediate values like "-22.5"
  // without onInput fighting them. Commits to positions on blur/Enter.
  const [inputDraft, setInputDraft] = useState<Record<string, string>>({})

  // Photo-picker dialog state (for adding photos to the active device).
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingAdd, setPendingAdd] = useState<string[]>([])

  // Alert dialog state for replacing window.confirm.
  const [alertState, setAlertState] = useState<{
    open: boolean
    title: string
    description: string
    actionText?: string
    actionCallback?: () => void
  }>({ open: false, title: '', description: '' })

  const dialogRef = useModalFocus(open, pickerOpen || cropOpen !== null || alertState.open)

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
  const dragRafRef = useRef<number | null>(null)
  const dragRawPosRef = useRef<{ x: number; y: number } | null>(null)
  const latestDragRef = useRef<{ index: number; d: { x: number; y: number; deltaX: number; deltaY: number } } | null>(null)
  // Snapshot of positions at drag start to measure delta from a stable origin.
  const dragStartPosRef = useRef<PhotoPosition[] | null>(null)
  const dragStartHandleRef = useRef<{ x: number; y: number } | null>(null)

  // Active-device derived state (the canvas + properties panel operate on
  // these, so all the drag/resize/keyboard logic below stays device-agnostic).
  const activePhotos = device === 'mobile' ? localMobilePhotos : localDesktopPhotos
  const activePositions = device === 'mobile' ? localMobilePositions : localDesktopPositions
  const defPicker = device === 'mobile' ? mobileDefs : desktopDefs
  const setActivePhotos = device === 'mobile' ? setLocalMobilePhotos : setLocalDesktopPhotos
  const setActivePositions = (update: PhotoPosition[] | ((previous: PhotoPosition[]) => PhotoPosition[])) => {
    const setter = device === 'mobile' ? setLocalMobilePositions : setLocalDesktopPositions
    setter(update)
  }
  const layers = resolveLayers(activePositions, activePhotos.length, device)
  const visibleLayers = layers.filter((layer) => !layer.hidden && layer.pos.w > 0 && layer.pos.h > 0)
  const frontLayer = [...visibleLayers].sort((a, b) => b.z - a.z || b.index - a.index)[0]
  const previewing = previewProgress > 0 || playing
  // resolveLayers already caps the scene; photos beyond the cap are sized but hidden.
  const deviceCap = device === 'mobile' ? 6 : 8
  const sizedCount = layers.filter((layer) => layer.pos.w > 0 && layer.pos.h > 0).length
  const intensityName = getValue(`${path}.intensity`) as Intensity | undefined
  const intensity = INTENSITY[intensityName ?? 'dramatic'] ?? INTENSITY.dramatic
  const tagline = String(getValue(`${path}.text`) ?? '')
  const eyebrow = String(getValue(`${path}.eyebrow`) ?? '')

  // Use the measured canvas size; fall back to the initial state if somehow 0.
  const canvas = canvasSize.w > 0 ? canvasSize : { w: 280, h: 607 }

  // Keep the server's precise failure visible after its transient toast expires.
  useEffect(() => {
    if (!saveError) return
    const failure = [...toasts].reverse().find((toast) => toast.kind === 'error' && !saveToastIdsRef.current.has(toast.id))
    if (failure) setSaveError(failure.message)
  }, [saveError, toasts])

  // Keep refs to values the keydown handler reads so it doesn't need to
  // re-register on every state toggle (avoids stale-closure confirm dialogs).
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty
  const alertOpenRef = useRef(false)
  alertOpenRef.current = alertState.open
  const selectedRef = useRef<number[]>([])
  selectedRef.current = selected
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
    const isMod = e.metaKey || e.ctrlKey
    if (isMod) {
      setSelected((prev) =>
        prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
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
    if (!selectedRef.current.includes(index)) {
      setSelected([index])
    }
  }

  // ---- Marquee (background drag-select) ------------------------------------

  /** Convert a client (viewport) coordinate to canvas-relative px. */
  const clientToCanvasPx = (clientX: number, clientY: number) => {
    const el = canvasRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    return {
      x: (clientX - rect.left - canvas.w / 2) / STAGE.scale + canvas.w / 2,
      y: (clientY - rect.top - canvas.h / 2 - canvas.h * STAGE.offsetY / 100) / STAGE.scale + canvas.h / 2,
    }
  }

  /**
   * mousedown on the bare canvas background. Records the start point and arms
   * the marquee; the actual box only appears once the cursor moves past
   * MARQUEE_THRESHOLD (so a plain click clears the selection instead).
   */
  const handleCanvasMouseDown = (e: MouseEvent) => {
    if (previewing || pickerOpen || cropOpen !== null) return
    if (e.target !== workspaceRef.current && e.target !== canvasRef.current && !(e.target as HTMLElement).hasAttribute('data-stage')) return
    if (e.button !== 0) return
    // Shift/Cmd-drag on the background adds to the existing selection rather
    // than replacing it; we remember the starting set so mouseup can union.
    marqueeStartRef.current = clientToCanvasPx(e.clientX, e.clientY)
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
    setMarquee({ left: Math.min(start.x, pt.x), top: Math.min(start.y, pt.y), w: Math.abs(dx), h: Math.abs(dy) })
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
    const marqueeRect = { left: m.left, top: m.top, right: m.left + m.w, bottom: m.top + m.h }
    // Find photos whose rendered rect (canvas-relative px) intersects the box.
    const hits: number[] = []
    activePositions.forEach((pos, i) => {
      if (pos.w === 0 || pos.h === 0) return
      const w = vwToPx(pos.w, canvas.w)
      const h = vhToPx(pos.h, canvas.h)
      const left = canvas.w / 2 + vwToPx(pos.x, canvas.w) - w / 2
      const top = canvas.h / 2 + vhToPx(pos.y, canvas.h) - h / 2
      if (rectsIntersect(marqueeRect, { left, top, right: left + w, bottom: top + h })) hits.push(i)
    })
    setSelected(hits)
  }

  // Read fresh state through refs without rebinding listeners on every drag.
  const marqueeHandlersRef = useRef({ move: handleWindowMouseMove, up: handleWindowMouseUp })
  marqueeHandlersRef.current = { move: handleWindowMouseMove, up: handleWindowMouseUp }
  useEffect(() => {
    if (!open) return
    const move = (event: MouseEvent) => marqueeHandlersRef.current.move(event)
    const up = () => marqueeHandlersRef.current.up()
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [open])

  // ---- Actions -------------------------------------------------------------

  const openEditor = () => {
    snapshotRef.current = { value: clone(getValue(path)) }
    const available = new Set<string>((manifest as any).categories.flatMap((category: any) =>
      category.photos.map((photo: any) => `${category.slug}/${photo.filename}`)))
    let removed = 0
    const readDevice = (target: 'mobile' | 'desktop') => {
      const draft = readDeviceDraft(getValue(`${path}.${target}Photos`) as string[] | undefined,
        getValue(`${path}.${target}Positions`) as PhotoPosition[] | null, target, available)
      removed += draft.removed
      return draft
    }
    const mobile = readDevice('mobile')
    const desktop = readDevice('desktop')
    setLocalMobilePhotos(mobile.photos)
    setLocalDesktopPhotos(desktop.photos)
    setLocalMobilePositions(mobile.positions)
    setLocalDesktopPositions(desktop.positions)
    setOpenNotice(removed ? `${removed} unavailable photo${removed === 1 ? '' : 's'} removed from this draft, together with their positions.` : '')
    setSaveError('')
    setDirty(removed > 0)
    setSelected([])
    deviceSelectionsRef.current = { mobile: [], desktop: [] }
    setPendingAdd([])
    setCropOpen(null)
    setPickerOpen(false)
    setPreviewProgress(0)
    setPlaying(false)
    setLayoutMenuOpen(false)
    setDevice('mobile')
    setOpen(true)
  }

  /** Apply a clamped patch to a single photo's position. Used by resize,
   *  keyboard nudge and single-field edits (NOT by group drag — that goes
   *  through handleDragStop's commit path). */
  const updatePosition = (index: number, patch: Partial<PhotoPosition>) => {
    setActivePositions((prev) => {
      if (!prev[index]) return prev
      const copy = [...prev]
      copy[index] = applyPatch(prev[index], patch)
      return copy
    })
    setDirty(true)
  }

  /** Apply the same patch to every selected photo. Used for bulk depth and
   *  bulk border-radius edits. Indices outside the active array are skipped. */
  const updatePositionsBulk = (indices: number[], patch: Partial<PhotoPosition>) => {
    if (indices.length === 0) return
    setActivePositions((prev) => {
      const copy = prev.map((p) => ({ ...p }))
      for (const idx of indices) {
        if (copy[idx]) copy[idx] = applyPatch(copy[idx], patch)
      }
      return copy
    })
    setDirty(true)
  }

  // ---- Group drag (transient delta approach) -------------------------------

  const handlePhotoDragStart = (_index: number, d: { x: number; y: number }) => {
    dragStartPosRef.current = activePositions.map((p) => ({ ...p }))
    dragStartHandleRef.current = { x: d.x, y: d.y }
    dragRawPosRef.current = { x: d.x, y: d.y }
  }

  const handlePhotoDrag = (index: number, d: { x: number; y: number; deltaX: number; deltaY: number }) => {
    // Accumulate every event, even when several pointer updates share a frame.
    if (dragRawPosRef.current) {
      dragRawPosRef.current.x += d.deltaX
      dragRawPosRef.current.y += d.deltaY
    } else dragRawPosRef.current = { x: d.x, y: d.y }
    latestDragRef.current = { index, d }
    if (dragRafRef.current) return
    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = null
      const current = latestDragRef.current
      if (!current) return
      const { index, d } = current

      const sel = selectedRef.current
      const isGroupDrag = sel.length > 1 && sel.includes(index)

      if (!isGroupDrag) {
        // Single drag logic with smart guides.
        if (!dragRawPosRef.current) {
          dragRawPosRef.current = { x: d.x, y: d.y }
        }
        const snapData = computeSnap(index, dragRawPosRef.current.x, dragRawPosRef.current.y, activePositions, canvas.w, canvas.h, smartAlign)
        setGuides(snapData.guides)
        const pos = activePositions[index]
        if (pos) {
          const wPx = vwToPx(pos.w, canvas.w)
          const hPx = vhToPx(pos.h, canvas.h)
          const x = pxToVw(snapData.left + wPx / 2 - canvas.w / 2, canvas.w)
          const y = pxToVh(snapData.top + hPx / 2 - canvas.h / 2, canvas.h)
          setActivePositions((prev) => {
            if (!prev[index]) return prev
            const copy = [...prev]
            copy[index] = applyPatch(prev[index], { x, y })
            return copy
          })
        }
        return
      }

      if (!dragStartPosRef.current || !dragStartHandleRef.current) return
      const startPx = dragStartHandleRef.current
      const dxVw = pxToVw(d.x - startPx.x, canvas.w)
      const dyVh = pxToVh(d.y - startPx.y, canvas.h)

      setActivePositions((prev) => {
        const copy = prev.map((p) => ({ ...p }))
        const startList = dragStartPosRef.current!
        for (const idx of sel) {
          if (idx === index) continue // react-rnd handles dragged item internally
          const startPos = startList[idx]
          if (!startPos || !copy[idx]) continue
          // We don't snap mid-drag followers to keep it smooth.
          copy[idx] = applyPatch(copy[idx], { x: startPos.x + dxVw, y: startPos.y + dyVh })
        }
        return copy
      })
    })
  }

  const handlePhotoDragStop = (index: number, d: { x: number; y: number }) => {
    const raw = dragRawPosRef.current ?? d
    dragRawPosRef.current = null
    if (dragRafRef.current) {
      cancelAnimationFrame(dragRafRef.current)
      dragRafRef.current = null
    }
    setGuides([])
    const startList = dragStartPosRef.current
    const sel = selectedRef.current
    const startPx = dragStartHandleRef.current || { x: d.x, y: d.y }
    const dxVw = pxToVw(d.x - startPx.x, canvas.w)
    const dyVh = pxToVh(d.y - startPx.y, canvas.h)
    const isGroupDrag = sel.length > 1 && sel.includes(index)

    setActivePositions((prev) => {
      const copy = prev.map((p) => ({ ...p }))
      if (!isGroupDrag || !startList) {
        // Commit the final event even if the last scheduled frame was cancelled.
        const pos = prev[index]
        if (pos) {
          const aligned = computeSnap(index, raw.x, raw.y, prev, canvas.w, canvas.h, smartAlign)
          let x = pxToVw(aligned.left + vwToPx(pos.w, canvas.w) / 2 - canvas.w / 2, canvas.w)
          let y = pxToVh(aligned.top + vhToPx(pos.h, canvas.h) / 2 - canvas.h / 2, canvas.h)
          if (snap) { x = snapVal(x); y = snapVal(y) }
          copy[index] = applyPatch(copy[index], { x, y })
        }
      } else {
        // Group drag: apply delta + optional grid snap to every selected photo.
        for (const idx of sel) {
          const startPos = startList[idx]
          if (!startPos || !copy[idx]) continue
          let x = startPos.x + dxVw
          let y = startPos.y + dyVh
          if (snap) { x = snapVal(x); y = snapVal(y) }
          copy[idx] = applyPatch(copy[idx], { x, y })
        }
      }
      return copy
    })

    dragStartPosRef.current = null
    dragStartHandleRef.current = null
    setDirty(true)
  }

  const handleResizeStop = (
    index: number,
    ref: HTMLElement,
    position: { x: number; y: number },
  ) => {
    // Convert react-rnd top-left (px) back to center-origin (vw/vh).
    let w = pxToVw(ref.offsetWidth, canvas.w)
    let h = pxToVh(ref.offsetHeight, canvas.h)
    let x = pxToVw(position.x + ref.offsetWidth / 2 - canvas.w / 2, canvas.w)
    let y = pxToVh(position.y + ref.offsetHeight / 2 - canvas.h / 2, canvas.h)
    if (snap) { w = snapVal(w); h = snapVal(h); x = snapVal(x); y = snapVal(y) }
    updatePosition(index, { w, h, x, y })
  }

  /**
   * Commit a drafted numeric input for `field` against the current selection.
   * Merges the old handleInputChange + commitInput: validates the raw draft
   * (skips intermediate states like "-" / "." / "" and NaN), routes to single
   * or bulk update, then always clears the draft.
   */
  const commitInput = (field: keyof PhotoPosition) => {
    const raw = inputDraft[field]
    if (raw === undefined) return
    if (raw !== '' && raw !== '-' && raw !== '.') {
      const num = Number(raw)
      if (Number.isFinite(num)) {
        const sel = selectedRef.current
        if (field === 'z' && sel.length === 1) {
          setActivePositions((prev) => applyTypedDepth(prev, sel[0], num))
          setDirty(true)
        } else if (sel.length > 1) updatePositionsBulk(sel, { [field]: num } as Partial<PhotoPosition>)
        else if (sel.length === 1) updatePosition(sel[0], { [field]: num } as Partial<PhotoPosition>)
      }
    }
    setInputDraft((d) => { const next = { ...d }; delete next[field]; return next })
  }

  /** Shorthand to open the confirm alert dialog with a titled action. */
  const confirm = (
    title: string,
    description: string,
    actionText: string,
    actionCallback: () => void,
  ) => setAlertState({ open: true, title, description, actionText, actionCallback })

  const handleDeviceToggle = (next: 'mobile' | 'desktop') => {
    if (next === device) return
    deviceSelectionsRef.current[device] = selectedRef.current
    setDevice(next)
    setSelected(deviceSelectionsRef.current[next])
    setCropOpen(null)
    setPlaying(false)
    setPreviewProgress(0)
  }

  const handleCopyMobileToDesktop = () => {
    setLayoutMenuOpen(false)
    confirm('Copy mobile → desktop', 'Copy the mobile photo selection and its layout to desktop? This replaces the desktop selection.', 'Copy', () => {
      setLocalDesktopPhotos([...localMobilePhotos])
      setLocalDesktopPositions(copyMobilePositionsToDesktop(localMobilePositions))
      const mobileSelection = device === 'mobile' ? selectedRef.current : deviceSelectionsRef.current.mobile
      const selectedPhotos = mobileSelection.map((index) => localMobilePhotos[index])
      const desktopSelection = localMobilePhotos.flatMap((photo, index) => selectedPhotos.includes(photo) ? [index] : [])
      deviceSelectionsRef.current.desktop = desktopSelection
      if (device === 'desktop') setSelected(desktopSelection)
      setDirty(true)
    })
  }

  const handleReset = (resetAppearance = false) => {
    setLayoutMenuOpen(false)
    confirm(resetAppearance ? 'Reset layout, crops & radius' : 'Reset to original',
      resetAppearance ? `Reset ${device} positions, crops and corner radii?` : `Reset ${device} positions and depth? Crops and corner radii are kept.`,
      'Reset', () => {
        setActivePositions((prev) => prev.map((pos, i) => {
          const defaults = defPicker(i)
          if (resetAppearance) return defaults
          return { ...pos, ...defaults, br: pos.br, cropX: pos.cropX, cropY: pos.cropY, cropZoom: pos.cropZoom }
        }))
        setDirty(true)
      })
  }

  const reorderSelection = (direction: DepthMove) => {
    if (!selectedRef.current.length) return
    setActivePositions((prev) => {
      const chosen = [...selectedRef.current].sort((a, b) => prev[a].z - prev[b].z || a - b)
      if (direction === 'back' || direction === 'up') chosen.reverse()
      return chosen.reduce((next, index) => reorderDepth(next, index, direction), prev)
    })
    setDirty(true)
  }
  const handleFront = () => reorderSelection('front')
  const handleBack = () => reorderSelection('back')

  const handleRemoveAll = () => {
    setLayoutMenuOpen(false)
    confirm('Remove all photos', `Remove every photo from the ${device} layout?`, 'Remove all', () => {
      setActivePhotos([]); setActivePositions([]); setSelected([]); setDirty(true)
    })
  }

  // New/explicitly shown photos must be visible; Reset keeps the original hidden slot.
  const visibleDefault = (index: number) => {
    const pos = defPicker(index)
    return pos.w === 0 && pos.h === 0 ? { ...mobileDefs(0), x: 0, y: 0 } : pos
  }

  const showPhoto = (index: number) => {
    const defaults = visibleDefault(index)
    setActivePositions((prev) => prev.map((pos, i) => i === index ? { ...pos, w: defaults.w, h: defaults.h } : pos))
    setDirty(true)
  }
  // A sized photo behind the device cap only enters the scene by moving forward.
  const bringForward = (index: number) => {
    setActivePositions((prev) => reorderDepth(prev, index, 'front'))
    setDirty(true)
  }

  const handleRemoveSelected = () => {
    if (selected.length === 0) return
    const count = selected.length
    const label = count === 1 ? `photo #${selected[0] + 1}` : `${count} photos`
    confirm(`Remove Photos`, `Remove ${label} from the ${device} layout?`, 'Remove', () => {
      // Remove in descending index order so earlier removals don't shift
      // the indices of later ones.
      const indices = [...selected].sort((a, b) => b - a)
      setActivePhotos((prev) => indices.reduce((next, idx) => next.filter((_, i) => i !== idx), prev))
      setActivePositions((prev) => indices.reduce((next, idx) => next.filter((_, i) => i !== idx), prev))
      setSelected([])
      setDirty(true)
    })
  }

  const togglePendingAdd = (photoPath: string) => {
    setPendingAdd((prev) =>
      prev.includes(photoPath) ? prev.filter((p) => p !== photoPath) : prev.length + activePhotos.length < 24 ? [...prev, photoPath] : prev,
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
      for (let i = 0; i < pendingAdd.length; i++) next.push(visibleDefault(prev.length + i))
      return next
    })
    setSelected([firstNewIndex])
    setDirty(true)
    setPendingAdd([])
    setPickerOpen(false)
  }

  const closeEditor = () => {
    if (snapshotRef.current && JSON.stringify(getValue(path)) !== JSON.stringify(snapshotRef.current.value)) {
      setValue(path, clone(snapshotRef.current.value))
    }
    setOpen(false)
    setPickerOpen(false)
    setCropOpen(null)
    setPlaying(false)
    setPreviewProgress(0)
    setDirty(false)
    setAlertState((previous) => ({ ...previous, open: false }))
  }

  const handleClose = () => {
    if (dirtyRef.current) {
      confirm('Unsaved Changes', 'You have unsaved changes. Close anyway? Your draft will be discarded.', 'Close Anyway', closeEditor)
      return
    }
    closeEditor()
  }

  const handleSave = useCallback(async () => {
    setSaveError('')
    saveToastIdsRef.current = new Set(toasts.map((toast) => toast.id))
    // Preserve the gallery's copy and Feel settings in one coherent snapshot.
    // Omit only obsolete pre-separation keys from the client snapshot; the API
    // merges existing data, so this is not a deletion of legacy SQLite keys.
    const stored = getValue(path) as Record<string, unknown> | undefined
    setValue(path, layoutSnapshot(stored, {
      mobilePhotos: localMobilePhotos,
      mobilePositions: localMobilePositions,
      desktopPhotos: localDesktopPhotos,
      desktopPositions: localDesktopPositions,
    }))
    if (!(await flushSave())) return setSaveError('Could not save the layout. Resolve any field errors, check your connection, and try again.')
    setDirty(false)
    setOpen(false)
    pushToast('success', 'Layout saved. Click Republish to apply to the live site.')
  }, [path, localMobilePhotos, localMobilePositions, localDesktopPhotos, localDesktopPositions, toasts]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Effects -------------------------------------------------------------

  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {})
  keyHandlerRef.current = (e) => {
    if (alertOpenRef.current || cropOpen !== null || pickerOpen || e.defaultPrevented) return
    const target = e.target as HTMLElement
    const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    if (e.key === 'Escape') {
      e.preventDefault()
      if (previewing) { setPlaying(false); setPreviewProgress(0); return }
      if (layoutMenuOpen) { setLayoutMenuOpen(false); return }
      if (selectedRef.current.length) { setSelected([]); return }
      handleClose()
      return
    }
    if (typing || previewing) return
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault(); setSelected(activePhotos.map((_, i) => i)); return
    }
    if (!selectedRef.current.length) return
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); handleRemoveSelected(); return }
    if (e.key === '[' || e.key === ']') { e.preventDefault(); reorderSelection(e.key === ']' ? 'up' : 'down'); return }
    if (e.key === 'Enter' && (target.tagName !== 'BUTTON') && selectedRef.current.length === 1) {
      if (activePositions[selectedRef.current[0]]?.w > 0) setCropOpen(selectedRef.current[0])
      e.preventDefault(); return
    }
    const step = e.shiftKey ? 5 : 1
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
    if (dx || dy) {
      e.preventDefault()
      setActivePositions((prev) => nudgePositions(prev, selectedRef.current, dx, dy))
      setDirty(true)
    }
  }
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => keyHandlerRef.current(event)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!open || !dirty) return
    // returnValue is deprecated, but older WebKit still needs it to show the prompt.
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); (event as { returnValue: string }).returnValue = '' }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [open, dirty])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!open || !playing || reducedMotion) { if (reducedMotion) setPlaying(false); return }
    let frame = 0
    let start: number | undefined
    const tick = (time: number) => {
      start ??= time
      const progress = Math.min(1, (time - start) / 3000)
      setPreviewProgress(progress)
      if (progress < 1) frame = requestAnimationFrame(tick)
      else setPlaying(false)
    }
    setPreviewProgress(0)
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [open, playing, reducedMotion])

  useEffect(() => () => {
    if (dragRafRef.current !== null) cancelAnimationFrame(dragRafRef.current)
  }, [open])

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
      const r = ratio
      let w = availW
      let h = w / r
      if (h > availH) { h = availH; w = h * r }
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
    primary !== null && activePositions[primary] ? activePositions[primary] : null
  const distinctDepths = [...new Set(visibleLayers.map((layer) => layer.z))].sort((a, b) => a - b)
  const selectedDepthRank = selectedPos ? distinctDepths.indexOf(selectedPos.z) + 1 : 1
  const maxDepthRank = new Set(visibleLayers.filter((layer) => layer.index !== primary).map((layer) => layer.z)).size + 1

  // Shared value for bulk-editable fields across the selection. When all
  // selected photos share the same value, show it; otherwise show a blank
  // placeholder so the user knows the values differ.
  const sharedValue = (pick: (i: number) => number | undefined) => {
    if (selected.length === 0) return undefined
    const vals = selected.map(pick)
    return vals.every((v) => v === vals[0]) ? vals[0] : undefined
  }
  const bulkBr = sharedValue((i) => brOf(activePositions[i]))

  // Flatten the build-time manifest into a category-grouped list for the picker.
  const pickerCategories: PickerCategory[] = (manifest as any).categories.map((c: any) => ({
    slug: c.slug,
    name: c.name || c.slug,
    photos: c.photos.map((p: any) => p.filename),
  }))

  // ---- Render --------------------------------------------------------------

  const isMulti = selected.length > 1
  const toggleBtn = (active: boolean, onClick: () => void, title: string, label: string) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`min-h-11 min-w-11 px-2.5 py-1 text-sm font-medium border rounded-sm transition-colors ${
        active ? 'bg-primary text-primary-text border-primary' : 'bg-canvas text-muted border-border hover:text-ink'
      }`}
    >
      {label}
    </button>
  )

  return (
    <>
      <div className="space-y-2">
        <Button type="button" variant="primary" size="md" onClick={openEditor} aria-haspopup="dialog">
          Edit layout…
        </Button>
        <p className="text-sm text-muted">
          Curate and position photos separately for mobile and desktop.
        </p>
      </div>

      {open && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-2 sm:p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose() }}>
          <style>{`
            .immersive-resize-handle { position:absolute; width:8px; height:8px; left:50%; top:50%; transform:translate(-50%,-50%); background:var(--color-primary); border-radius:2px; pointer-events:none; }
            @media (pointer:coarse) {
              .immersive-editor { --immersive-handle-hit:calc(44px / ${STAGE.scale}); }
              .immersive-editor .immersive-resize-handle { width:calc(24px / ${STAGE.scale}); height:calc(24px / ${STAGE.scale}); }
            }
          `}</style>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1}
            className="immersive-editor bg-canvas border border-border rounded-lg w-full max-w-7xl h-[90vh] flex flex-col shadow-xl overflow-hidden"
            inert={pickerOpen || cropOpen !== null || alertState.open ? true : undefined}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-border bg-surface">
              <h2 id={`${id}-title`} className="text-base font-semibold text-ink">Immersive Gallery Layout Editor</h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex bg-canvas border border-border rounded-sm overflow-hidden" role="group" aria-label="Device layout">
                  {(['mobile', 'desktop'] as const).map((d) => (
                    <button key={d} type="button" aria-pressed={device === d} onClick={() => handleDeviceToggle(d)}
                      className={`min-h-11 min-w-11 px-3 text-sm font-medium transition-colors ${device === d ? 'bg-primary text-primary-text' : 'text-muted hover:text-ink'}`}>
                      {d === 'mobile' ? 'Mobile' : 'Desktop'}
                    </button>
                  ))}
                </div>
                {toggleBtn(showGrid, () => setShowGrid((s) => !s), 'Show grid lines on the canvas', 'Grid')}
                {toggleBtn(smartAlign, () => setSmartAlign((s) => !s), 'Snap to other photos and canvas center', 'Smart align')}
                {toggleBtn(snap, () => setSnap((s) => !s), 'Snap positions and sizes to a 2vw/2vh grid', 'Snap')}
                <div className="relative">
                  <button type="button" aria-expanded={layoutMenuOpen} aria-controls={`${id}-layout-actions`} disabled={previewing}
                    className="min-h-11 px-3 border border-border rounded-sm text-sm text-ink"
                    onClick={() => setLayoutMenuOpen((previous) => !previous)}>Layout ▾</button>
                  {layoutMenuOpen && <div id={`${id}-layout-actions`} role="group" aria-label="Layout actions"
                    className="absolute right-0 top-full z-[250] w-64 bg-canvas border border-border rounded-sm shadow-xl p-1">
                    <button type="button" onClick={() => handleReset()} className="w-full min-h-11 text-left px-3 text-sm text-ink">Reset to original</button>
                    <button type="button" onClick={() => handleReset(true)} className="w-full min-h-11 text-left px-3 text-sm text-ink">Reset layout, crops & radius…</button>
                    <button type="button" onClick={handleCopyMobileToDesktop} className="w-full min-h-11 text-left px-3 text-sm text-ink">Copy mobile → desktop</button>
                    <button type="button" onClick={handleRemoveAll} className="w-full min-h-11 text-left px-3 text-sm text-error">Remove all</button>
                  </div>}
                </div>
                <button type="button" onClick={handleClose} className="min-w-11 min-h-11 text-muted hover:text-ink text-xl" aria-label="Close layout editor">×</button>
              </div>
            </div>
            {openNotice && <p role="status" className="px-4 py-2 text-sm text-muted bg-surface">{openNotice}</p>}
            <div className="flex-1 flex min-h-0 overflow-hidden">
              <div className="flex-1 min-w-0 flex flex-col">
                <div ref={workspaceRef} className="flex-1 min-h-0 flex items-center justify-center p-10 overflow-hidden isolate"
                  style={{ background: 'rgba(0,0,0,0.5)' }} onMouseDown={handleCanvasMouseDown}>
                  <div ref={canvasRef} data-canvas-viewport className="relative bg-surface shrink-0"
                    style={{ width: canvas.w, height: canvas.h, overflow: 'visible', outline: '1px solid var(--color-border)' }}>
                    {showGrid && <div className="absolute inset-0 pointer-events-none" style={{
                      backgroundImage: 'linear-gradient(to right, rgba(128,128,128,.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(128,128,128,.15) 1px, transparent 1px)',
                      backgroundSize: `${vwToPx(2, canvas.w)}px ${vhToPx(2, canvas.h)}px`, backgroundPosition: 'center',
                    }} />}
                    <div data-stage className="absolute inset-0" style={{
                      transform: `translateY(${STAGE.offsetY}%) scale(${STAGE.scale})`, transformOrigin: 'center', pointerEvents: 'none',
                    }}>
                      {visibleLayers.map((layer) => (
                        <div key={activePhotos[layer.index]} data-layer={layer.index} className="absolute inset-0" style={{
                          zIndex: layer.z, transform: `scale(${layerScale(previewProgress, layer, intensity)})`,
                          transformOrigin: 'center', opacity: layerOpacity(previewProgress, layer, intensity),
                          visibility: previewProgress >= 0.8 ? 'hidden' : 'visible', pointerEvents: 'none',
                        }}>
                          <CanvasPhoto photo={activePhotos[layer.index]} index={layer.index} pos={layer.pos} device={device}
                            isSelected={selected.includes(layer.index)} selectedCount={selected.length} canvas={canvas}
                            readOnly={previewing} fliesFirst={layer.index === frontLayer?.index}
                            onDragStart={handlePhotoDragStart} onDrag={handlePhotoDrag} onDragStop={handlePhotoDragStop}
                            onResizeStop={handleResizeStop} onSelect={selectPhoto}
                            onDoubleClick={(index) => setCropOpen(index)} />
                        </div>
                      ))}
                      {guides.map((g, i) => <div key={i} className="absolute pointer-events-none z-[150]" style={g.type === 'x'
                        ? { left: g.pos, top: g.spanMin, height: g.spanMax - g.spanMin, width: 1, borderLeft: '1px dotted var(--color-primary)' }
                        : { top: g.pos, left: g.spanMin, width: g.spanMax - g.spanMin, height: 1, borderTop: '1px dotted var(--color-primary)' }} />)}
                      {marquee && !previewing && <div className="absolute border border-primary bg-primary/20 pointer-events-none z-[150]"
                        style={{ left: marquee.left, top: marquee.top, width: marquee.w, height: marquee.h }} />}
                    </div>
                    {activePhotos.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-sm text-muted pointer-events-none p-3 text-center">No photos — use “Add Photo” to start</div>}
                    {tagline && <div data-tagline-ghost aria-hidden="true" className="absolute inset-0 flex items-center justify-center pointer-events-none z-[150]" style={{
                      transform: `translateY(${(device === 'mobile' ? 64 : 72) / 2 * canvas.w / (device === 'mobile' ? 393 : 1440)}px)`,
                    }}>
                      <div className="text-center text-ink" style={{ maxWidth: '90%' }}>
                        {eyebrow && <p style={{
                          fontSize: 12 * canvas.w / (device === 'mobile' ? 393 : 1440), fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase',
                          marginBottom: 20 * canvas.w / (device === 'mobile' ? 393 : 1440),
                          opacity: taglineFrame(previewProgress + .03).opacity, transform: `scale(${taglineFrame(previewProgress + .03).scale})`,
                        }}>{eyebrow}</p>}
                        <p className="font-display" style={{
                          fontWeight: 400, fontSize: (tagline.length > 90
                            ? Math.min(36, Math.max(24, 20 + (device === 'mobile' ? 393 : 1440) * .01))
                            : Math.min(52, Math.max(32, 24 + (device === 'mobile' ? 393 : 1440) * .02))) * canvas.w / (device === 'mobile' ? 393 : 1440),
                          lineHeight: tagline.length > 90 ? 1.18 : 1.12, letterSpacing: 'var(--text-h2--letter-spacing, -.022em)',
                          maxWidth: tagline.length > 90 ? '30ch' : '22ch', textWrap: 'balance', margin: '0 auto',
                          opacity: taglineFrame(previewProgress).opacity, transform: `scale(${taglineFrame(previewProgress).scale})`,
                        }}>{tagline}</p>
                      </div>
                    </div>}
                    <div aria-hidden="true" className="absolute inset-0 pointer-events-none z-[200]" style={{ boxShadow: '0 0 0 100vmax rgba(0,0,0,.6)' }} />
                    <div aria-hidden="true" className="absolute top-0 inset-x-0 pointer-events-none z-[210] border-b border-dashed border-border bg-canvas/60" style={{
                      height: (device === 'mobile' ? 64 : 72) * canvas.w / (device === 'mobile' ? 393 : 1440),
                    }}><span className="absolute top-0 left-1 text-xs text-muted">Header safe zone</span></div>
                  </div>
                </div>
                <div className="border-t border-border bg-surface px-4 py-2">
                  <div className="flex items-center gap-3">
                    <label htmlFor={`${id}-progress`} className="text-sm text-ink whitespace-nowrap">Scroll preview</label>
                    <input id={`${id}-progress`} type="range" min={0} max={100} step={1} value={Math.round(previewProgress * 100)}
                      aria-valuetext={`${Math.round(previewProgress * 100)} percent`}
                      onInput={(e) => { setPlaying(false); setPreviewProgress(Number(e.currentTarget.value) / 100) }} className="flex-1 min-h-11 min-w-0 accent-primary" />
                    <output htmlFor={`${id}-progress`} className="text-xs font-mono text-muted">{Math.round(previewProgress * 100)}%</output>
                    <button type="button" disabled={reducedMotion || playing} className="min-h-11 min-w-11 px-3 text-sm border border-border rounded-sm text-ink disabled:opacity-50"
                      title={reducedMotion ? 'Playback is disabled while reduced motion is preferred' : 'Play one three-second pass'}
                      onClick={() => setPlaying(true)}>{playing ? 'Playing…' : 'Play'}</button>
                    <button type="button" className="min-h-11 px-2 text-sm text-ink" onClick={() => { setPlaying(false); setPreviewProgress(0) }}>Edit</button>
                  </div>
                  <p className="text-xs text-muted">{reducedMotion ? 'Reduced motion: Play is disabled. Scrub manually to inspect frames.' : previewing ? 'Preview is read-only. Return to 0% or choose Edit to arrange photos.' : 'Drag to arrange. Scroll preview shows how photos fly past.'}</p>
                  {sizedCount > deviceCap && <p className="text-xs text-muted">Only the front {deviceCap} photos appear in the live scene on this device. Bring a photo forward to include it.</p>}
                </div>
              </div>
              <div className="w-56 sm:w-64 shrink-0 border-l border-border bg-surface overflow-y-auto flex flex-col">
                <div className="p-3 border-b border-border">
                  <h3 className="text-sm font-semibold text-ink mb-2">Photos · {device}</h3>
                  <div role="group" aria-label="Photos in depth order, front first" className="max-h-44 overflow-y-auto space-y-1">
                    {[...layers].sort((a, b) => b.z - a.z || b.index - a.index).map((layer) => (
                      <div key={activePhotos[layer.index]} className="flex items-center gap-1">
                        <button type="button" aria-pressed={selected.includes(layer.index)}
                          className={`flex-1 min-w-0 min-h-11 px-2 text-left border rounded-sm ${selected.includes(layer.index) ? 'border-primary text-ink' : 'border-border text-muted'}`}
                          onClick={(e) => selectPhoto(layer.index, e)}
                          onDblClick={() => { if (!previewing && !layer.hidden) setCropOpen(layer.index) }}>
                          <span className="block text-xs truncate">{layer.index + 1}. {activePhotos[layer.index].split('/').pop()}</span>
                          {(layer.pos.w === 0 || layer.pos.h === 0) ? <span className="block text-xs">Hidden on this device</span>
                            : layer.hidden ? <span className="block text-xs">Behind the front {deviceCap}; not in the live scene</span>
                            : layer.index === frontLayer?.index && <span className="block text-xs">flies first</span>}
                        </button>
                        {(layer.pos.w === 0 || layer.pos.h === 0) ? <button type="button" disabled={previewing}
                          aria-label={`Show photo ${layer.index + 1}: ${activePhotos[layer.index].split('/').pop()}`}
                          className="min-h-11 min-w-11 text-xs text-ink border border-border rounded-sm" onClick={() => showPhoto(layer.index)}>Show</button>
                        : layer.hidden && <button type="button" disabled={previewing}
                          aria-label={`Bring photo ${layer.index + 1} to the front: ${activePhotos[layer.index].split('/').pop()}`}
                          className="min-h-11 min-w-11 px-1 text-xs text-ink border border-border rounded-sm" onClick={() => bringForward(layer.index)}>Front</button>}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-3 border-b border-border">
                  <h3 className="text-sm font-semibold text-ink">{isMulti ? `${selected.length} photos selected` : primary !== null ? `Photo ${primary + 1}` : 'Select a photo'}</h3>
                  {primary !== null && !isMulti && <p className="text-xs text-muted break-all mt-1">{activePhotos[primary]?.split('/').pop()}</p>}
                </div>
                <fieldset disabled={previewing} className="min-w-0 border-0 p-0 m-0 flex-1 disabled:opacity-60">
                  {selectedPos ? <div className="p-4 space-y-4">
                    {!isMulti && <FieldGroup label="Position (vw / vh)" fields={['x', 'y']} pos={selectedPos} draft={inputDraft} setDraft={setInputDraft} onCommit={commitInput} />}
                    {!isMulti && selectedPos.w > 0 && selectedPos.h > 0 && <FieldGroup label="Size (vw / vh)" fields={['w', 'h']} pos={selectedPos} draft={inputDraft} setDraft={setInputDraft} onCommit={commitInput} />}
                    <div className="space-y-1.5">
                      {isMulti ? <p className="text-xs text-muted uppercase tracking-wide">Depth (bulk)</p>
                        : <label htmlFor={`${id}-depth`} className="text-xs text-muted uppercase tracking-wide">Depth</label>}
                      <div className="flex flex-wrap gap-2">
                        {!isMulti && selectedPos.w > 0 && selectedPos.h > 0 && <input id={`${id}-depth`} type="number" value={inputDraft.z ?? selectedDepthRank} step={1} min={1} max={maxDepthRank}
                          onInput={(e) => setInputDraft((d) => ({ ...d, z: e.currentTarget.value }))} onBlur={() => commitInput('z')}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitInput('z') }} className="w-16 min-h-11 px-2 text-sm bg-canvas border border-border rounded-sm text-ink" />}
                        <button type="button" onClick={handleFront} className="min-h-11 min-w-11 px-2 text-sm border border-border rounded-sm text-ink">Front</button>
                        <button type="button" onClick={handleBack} className="min-h-11 min-w-11 px-2 text-sm border border-border rounded-sm text-ink">Back</button>
                      </div>
                      <p className="text-xs text-muted">Front photos fly past first and fastest</p>
                    </div>
                    {!isMulti && selectedPos.w > 0 && selectedPos.h > 0 && <Button variant="secondary" size="sm" className="w-full min-h-11" onClick={() => setCropOpen(primary)}><CropIcon size={14} /> Crop & Pan Photo</Button>}
                    <BorderRadiusSlider value={bulkBr} isMulti={isMulti} isMixed={isMulti && bulkBr === undefined} onChange={(v) => {
                      if (isMulti) updatePositionsBulk(selected, { br: v })
                      else if (primary !== null) updatePosition(primary, { br: v })
                    }} />
                    <button type="button" onClick={handleRemoveSelected} className="w-full min-h-11 px-3 text-sm border border-border rounded-sm text-error inline-flex items-center justify-center gap-1.5">
                      <TrashIcon size={14} /> Remove {isMulti ? `${selected.length} Photos` : 'Photo'}
                    </button>
                  </div> : <div className="p-4 space-y-2"><p className="text-sm text-muted">Select a photo on the canvas or in the list to edit it.</p><p className="text-xs text-muted">Shift/Cmd-click for multiple photos · Cmd+A for all · arrow keys to nudge · [ / ] for depth.</p></div>}
                </fieldset>
                <div className="p-3 border-t border-border">
                  <button type="button" disabled={previewing || activePhotos.length >= 24} onClick={() => { setPendingAdd([]); setPickerOpen(true) }}
                    className="w-full min-h-11 px-3 text-sm border border-border rounded-sm text-ink inline-flex items-center justify-center gap-1.5 disabled:opacity-50"><PlusIcon size={14} /> Add Photo</button>
                </div>
              </div>
            </div>
            {saveError && <p role="alert" className="px-4 py-2 text-sm text-error border-t border-border">{saveError}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-t border-border bg-surface">
              <p className="text-xs text-muted">Save changes, then Republish to update the live site.</p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="min-h-11" onClick={handleClose}>Cancel</Button>
                <Button variant="primary" size="sm" className="min-h-11" onClick={handleSave}>Save</Button>
              </div>
            </div>
          </div>
          {pickerOpen && <PhotoPicker device={device} categories={pickerCategories} pendingAdd={pendingAdd} activePhotos={activePhotos}
            onToggle={togglePendingAdd} onConfirm={handleConfirmAdd} onClose={() => setPickerOpen(false)} />}
        </div>
      )}

      <AlertDialog open={alertState.open} onOpenChange={(o) => setAlertState((prev) => ({ ...prev, open: o }))}>
        {(<AlertDialogContent className="z-[120]" overlayClassName="z-[120]">
          {(<AlertDialogHeader>
            {(<AlertDialogTitle>{alertState.title}</AlertDialogTitle>) as any}
            {(<AlertDialogDescription>
              {alertState.description}
            </AlertDialogDescription>) as any}
          </AlertDialogHeader>) as any}
          {(<AlertDialogFooter>
            {(<AlertDialogCancel>Cancel</AlertDialogCancel>) as any}
            {(<AlertDialogAction onClick={() => alertState.actionCallback?.()}>
              {alertState.actionText || 'Continue'}
            </AlertDialogAction>) as any}
          </AlertDialogFooter>) as any}
        </AlertDialogContent>) as any}
      </AlertDialog>

      {open && cropOpen !== null && activePositions[cropOpen] && (
        <CropEditor
          photoUrl={thumbUrl(activePhotos[cropOpen])}
          w={activePositions[cropOpen].w}
          h={activePositions[cropOpen].h}
          canvasW={canvas.w}
          canvasH={canvas.h}
          initialCropX={activePositions[cropOpen].cropX ?? 50}
          initialCropY={activePositions[cropOpen].cropY ?? 50}
          initialZoom={activePositions[cropOpen].cropZoom ?? 1}
          onSave={(cropX, cropY, zoom) => {
            updatePosition(cropOpen, { cropX, cropY, cropZoom: zoom })
            setCropOpen(null)
          }}
          onCancel={() => setCropOpen(null)}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// FieldGroup — renders a labeled 2-column row of numeric inputs (X/Y or W/H)
// for single-select editing. Each input drafts intermediate keystrokes and
// commits on blur/Enter via the parent's commitInput.
// ---------------------------------------------------------------------------

const FIELD_LABELS: Record<string, string> = { x: 'X', y: 'Y', w: 'W', h: 'H' }

function FieldGroup({
  label,
  fields,
  pos,
  draft,
  setDraft,
  onCommit,
}: {
  label: string
  fields: Array<keyof typeof RANGES>
  pos: PhotoPosition
  draft: Record<string, string>
  setDraft: (upd: (prev: Record<string, string>) => Record<string, string>) => void
  onCommit: (field: keyof PhotoPosition) => void
}) {
  const id = useId()
  return (
    <div className="space-y-1.5">
      <p className="text-sm text-muted uppercase tracking-wide">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {fields.map((field) => (
          <div key={field} className="space-y-1">
          <label htmlFor={`${id}-${field}`} className="text-xs text-muted">{FIELD_LABELS[field]}</label>
          <input
            id={`${id}-${field}`}
            type="number"
            value={draft[field] ?? (pos[field] as number)}
            step={0.5}
            min={RANGES[field].min}
            max={RANGES[field].max}
            onInput={(e) => setDraft((d) => ({ ...d, [field]: (e.currentTarget as HTMLInputElement).value }))}
            onBlur={() => onCommit(field)}
            onKeyDown={(e) => { if (e.key === 'Enter') onCommit(field) }}
            className="w-full min-h-11 px-2 text-sm bg-canvas border border-border rounded-sm text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
          />
          </div>
        ))}
      </div>
    </div>
  )
}
