import { useState, useRef, useEffect, useCallback } from 'preact/hooks'
import { useConfig } from '../../../lib/admin/store'
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
  syncPositions,
  thumbUrl,
  rectsIntersect,
  applyPatch,
  computeSnap,
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
  const dragIndexRef = useRef<number | null>(null)
  // Snapshot of positions at drag start to measure delta from a stable origin.
  const dragStartPosRef = useRef<PhotoPosition[] | null>(null)
  const dragStartHandleRef = useRef<{ x: number; y: number } | null>(null)

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
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  /**
   * mousedown on the bare canvas background. Records the start point and arms
   * the marquee; the actual box only appears once the cursor moves past
   * MARQUEE_THRESHOLD (so a plain click clears the selection instead).
   */
  const handleCanvasMouseDown = (e: MouseEvent) => {
    if (e.target !== workspaceRef.current && e.target !== canvasRef.current) return
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
      const w = vwToPx(pos.w, canvas.w)
      const h = vhToPx(pos.h, canvas.h)
      const left = canvas.w / 2 + vwToPx(pos.x, canvas.w) - w / 2
      const top = canvas.h / 2 + vhToPx(pos.y, canvas.h) - h / 2
      if (rectsIntersect(marqueeRect, { left, top, right: left + w, bottom: top + h })) hits.push(i)
    })
    setSelected(hits)
  }

  // Attach window-level mousemove/mouseup only while the editor is open. The
  // handlers early-return when the marquee start ref is null, so always-on
  // attachment is cheap and avoids re-binding on every marquee state change.
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

  /** Apply the same patch to every selected photo. Used for bulk Z-index and
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

  const handlePhotoDragStart = (index: number, d: { x: number; y: number }) => {
    dragStartPosRef.current = activePositions.map((p) => ({ ...p }))
    dragIndexRef.current = index
    dragStartHandleRef.current = { x: d.x, y: d.y }
    dragRawPosRef.current = { x: d.x, y: d.y }
  }

  const handlePhotoDrag = (index: number, d: { x: number; y: number; deltaX: number; deltaY: number }) => {
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
        dragRawPosRef.current.x += d.deltaX
        dragRawPosRef.current.y += d.deltaY

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
        // Single drag: apply grid snap to the already-updated position.
        const pos = prev[index]
        if (pos) {
          const patch = snap ? { x: snapVal(pos.x), y: snapVal(pos.y) } : {}
          copy[index] = applyPatch(copy[index], patch)
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
    dragIndexRef.current = null
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
      if (!Number.isNaN(num)) {
        const sel = selectedRef.current
        if (sel.length > 1) updatePositionsBulk(sel, { [field]: num } as Partial<PhotoPosition>)
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
    if (dirtyRef.current) {
      confirm('Unsaved Changes', 'You have unsaved changes. Switch device anyway?', 'Switch Device', () => {
        setDevice(next)
        setSelected([])
      })
      return
    }
    setDevice(next)
    setSelected([])
  }

  const handleCopyMobileToDesktop = () => {
    confirm(
      'Overwrite Positions',
      'Overwrite desktop positions with the current mobile positions for all overlapping photos? Continue?',
      'Overwrite',
      () => {
        setLocalDesktopPositions((prev) => {
          const result: PhotoPosition[] = []
          for (let i = 0; i < prev.length; i++) {
            // Only copy where mobile has a corresponding photo; leave the rest as-is.
            result.push(i < localMobilePositions.length ? clone(localMobilePositions[i]) : prev[i])
          }
          return result
        })
        setDirty(true)
      },
    )
  }

  const handleReset = () => {
    confirm(
      'Reset Positions',
      `Reset ${device} positions to the hardcoded defaults?`,
      'Reset',
      () => {
        setActivePositions((prev) => prev.map((_, i) => defPicker(i)))
        setDirty(true)
      },
    )
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
      for (let i = 0; i < pendingAdd.length; i++) next.push(defPicker(prev.length + i))
      return next
    })
    setSelected([firstNewIndex])
    setDirty(true)
    setPendingAdd([])
    setPickerOpen(false)
  }

  const closeEditor = () => {
    setOpen(false)
    setPickerOpen(false)
  }

  const handleClose = useCallback(() => {
    if (dirtyRef.current) {
      confirm('Unsaved Changes', 'You have unsaved changes. Close anyway?', 'Close Anyway', closeEditor)
      return
    }
    closeEditor()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
          confirm('Unsaved Changes', 'You have unsaved changes. Close anyway?', 'Close Anyway', closeEditor)
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
      const sel = selectedRef.current
      const step = e.shiftKey ? 5 : 1
      const base = (deviceRef.current === 'mobile' ? localMobilePositions : localDesktopPositions)[sel[0]] ?? { x: 0, y: 0 }
      const nudge =
        e.key === 'ArrowLeft' ? { x: base.x - step } :
        e.key === 'ArrowRight' ? { x: base.x + step } :
        e.key === 'ArrowUp' ? { y: base.y - step } :
        e.key === 'ArrowDown' ? { y: base.y + step } : undefined
      if (nudge) {
        updatePositionsBulk(sel, nudge as Partial<PhotoPosition>)
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

  // Shared value for bulk-editable fields across the selection. When all
  // selected photos share the same value, show it; otherwise show a blank
  // placeholder so the user knows the values differ.
  const sharedValue = (pick: (i: number) => number | undefined) => {
    if (selected.length === 0) return undefined
    const vals = selected.map(pick)
    return vals.every((v) => v === vals[0]) ? vals[0] : undefined
  }
  const bulkZ = sharedValue((i) => activePositions[i]?.z)
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
      className={`px-2.5 py-1 text-sm font-medium border rounded-sm transition-colors ${
        active ? 'bg-primary text-primary-text border-primary' : 'bg-canvas text-muted border-border hover:text-ink'
      }`}
    >
      {label}
    </button>
  )

  return (
    <>
      <div className="space-y-1.5">
        <Button variant="secondary" size="sm" onClick={openEditor}>
          Edit Layout
        </Button>
        <p className="text-sm text-muted">
          Curate and position photos separately for mobile and desktop.
          {storedMobilePhotos.length > 0 || storedDesktopPhotos.length > 0
            ? ` Mobile: ${storedMobilePhotos.length}, Desktop: ${storedDesktopPhotos.length}.`
            : ' No photos yet — add them inside the editor.'}
        </p>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose() }}
        >
          {/* overflow-hidden fixes the squared-corner glitch where the inner
              header/body/footer bg-surface spilled past the rounded modal frame. */}
          <div className="bg-canvas border border-border rounded-lg w-full max-w-5xl h-[85vh] flex flex-col shadow-xl overflow-hidden">
            {/* ---- Header ---- */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface">
              <h2 className="text-base font-semibold text-ink">Immersive Gallery Layout Editor</h2>
              <div className="flex items-center gap-3">
                <div className="flex bg-canvas border border-border rounded-sm overflow-hidden">
                  {(['mobile', 'desktop'] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => handleDeviceToggle(d)}
                      className={`px-3 py-1 text-sm font-medium transition-colors ${
                        device === d ? 'bg-primary text-primary-text' : 'text-muted hover:text-ink'
                      }`}
                    >
                      {d === 'mobile' ? 'Mobile' : 'Desktop'}
                    </button>
                  ))}
                </div>
                {toggleBtn(showGrid, () => setShowGrid((s) => !s), 'Show grid lines on the canvas', 'Show Grid')}
                {toggleBtn(smartAlign, () => setSmartAlign((s) => !s), 'Snap positions dynamically to other photos and canvas center', 'Smart Alignment')}
                {toggleBtn(snap, () => setSnap((s) => !s), 'Snap positions/sizes to a 2vw/2vh grid', 'Snap to grid')}
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
                  style={{
                    width: canvas.w,
                    height: canvas.h,
                    overflow: 'visible',
                    ...(showGrid ? {
                      backgroundImage: `
                        linear-gradient(to right, rgba(128,128,128,0.1) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(128,128,128,0.1) 1px, transparent 1px)
                      `,
                      backgroundSize: `${vwToPx(2, canvas.w)}px ${vhToPx(2, canvas.h)}px`,
                      backgroundPosition: 'center center',
                    } : {}),
                  }}
                >
                  {/* Smart Alignment Guides */}
                  {guides.map((g, i) => (
                    <div
                      key={`guide-${i}`}
                      className="absolute pointer-events-none z-[150]"
                      style={
                        g.type === 'x'
                          ? { left: g.pos, top: g.spanMin, height: g.spanMax - g.spanMin, width: 1, borderLeft: '1px dotted var(--color-primary)' }
                          : { top: g.pos, left: g.spanMin, width: g.spanMax - g.spanMin, height: 1, borderTop: '1px dotted var(--color-primary)' }
                      }
                    />
                  ))}

                  {/* Horizontal/Vertical Center Crosshairs */}
                  {showGrid && (
                    <>
                      <div className="absolute top-0 bottom-0 left-1/2 w-px bg-border/50 pointer-events-none z-0" />
                      <div className="absolute left-0 right-0 top-1/2 h-px bg-border/50 pointer-events-none z-0" />
                    </>
                  )}

                  {activePhotos.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
                      No photos — use “Add Photo” to start
                    </div>
                  ) : (
                    activePhotos.map((photo, i) => (
                      <CanvasPhoto
                        key={`${photo}-${i}`}
                        photo={photo}
                        index={i}
                        pos={activePositions[i] ?? defPicker(i)}
                        isSelected={selected.includes(i)}
                        selectedCount={selected.length}
                        canvas={canvas}
                        onDragStart={handlePhotoDragStart}
                        onDrag={handlePhotoDrag}
                        onDragStop={handlePhotoDragStop}
                        onResizeStop={handleResizeStop}
                        onSelect={selectPhoto}
                        onDoubleClick={(idx) => setCropOpen(idx)}
                      />
                    ))
                  )}

                  {/* Marquee selection box — rendered above photos while the
                      user is drag-selecting on the background. */}
                  {marquee && (
                    <div
                      className="absolute border border-primary bg-primary/20 pointer-events-none z-[150]"
                      style={{ left: marquee.left, top: marquee.top, width: marquee.w, height: marquee.h }}
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
                    <p className="text-xs text-muted mt-1">
                      Shift/Cmd-click or drag on the background to select. X/Y/W/H hidden for multi-select.
                    </p>
                  )}
                </div>

                {selectedPos ? (
                  <div className="p-4 space-y-5 flex-1">
                    {/* Position & Size — only editable when a single photo is
                        selected. For multi-select, per-photo geometry isn't a
                        meaningful batch operation, so hide these inputs. */}
                    {!isMulti && (
                      <FieldGroup label="Position (vw / vh)" fields={['x', 'y']} pos={selectedPos} draft={inputDraft} setDraft={setInputDraft} onCommit={commitInput} />
                    )}
                    {!isMulti && (
                      <FieldGroup label="Size (vw / vh)" fields={['w', 'h']} pos={selectedPos} draft={inputDraft} setDraft={setInputDraft} onCommit={commitInput} />
                    )}

                    {/* Z-index — editable only for single selection. */}
                    {!isMulti && (
                      <div className="space-y-1.5">
                        <label className="text-sm text-muted uppercase tracking-wide">Z-index</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={inputDraft.z ?? selectedPos.z}
                            step={1}
                            min={RANGES.z.min}
                            max={RANGES.z.max}
                            onInput={(e) => setInputDraft((d) => ({ ...d, z: (e.currentTarget as HTMLInputElement).value }))}
                            onBlur={() => commitInput('z')}
                            onKeyDown={(e) => { if (e.key === 'Enter') commitInput('z') }}
                            className="w-20 h-10 px-2 text-sm bg-canvas border border-border rounded-sm text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
                          />
                          <button type="button" onClick={handleFront} className="h-10 px-2 text-sm bg-surface border border-border rounded-sm text-ink hover:bg-surface-hover transition-colors">Front</button>
                          <button type="button" onClick={handleBack} className="h-10 px-2 text-sm bg-surface border border-border rounded-sm text-ink hover:bg-surface-hover transition-colors">Back</button>
                        </div>
                      </div>
                    )}

                    {!isMulti && (
                      <div className="pt-2">
                        <Button variant="secondary" size="sm" onClick={() => setCropOpen(primary)} className="w-full">
                          <CropIcon size={14} /> Crop & Pan Photo
                        </Button>
                      </div>
                    )}

                    {/* Border Radius — range slider for both single and bulk.
                        Sliders only emit valid integers, so we commit directly
                        to state on every change (no inputDraft needed). */}
                    <BorderRadiusSlider
                      value={bulkBr}
                      isMulti={isMulti}
                      isMixed={isMulti && bulkBr === undefined}
                      onChange={(v) => {
                        if (isMulti) updatePositionsBulk(selected, { br: v })
                        else if (primary !== null) updatePosition(primary, { br: v })
                      }}
                    />

                    {/* Remove + Reset */}
                    <div className="space-y-2 pt-2 border-t border-border">
                      <button
                        type="button"
                        onClick={handleRemoveSelected}
                        className="w-full h-10 px-3 text-sm bg-surface border border-border rounded-sm text-error hover:bg-surface-hover transition-colors inline-flex items-center justify-center gap-1.5"
                      >
                        <TrashIcon size={14} /> Remove {isMulti ? `${selected.length} Photos` : 'Photo'}
                      </button>
                      {device === 'desktop' && (
                        <button
                          type="button"
                          onClick={handleCopyMobileToDesktop}
                          className="w-full h-10 px-3 text-sm bg-surface border border-border rounded-sm text-ink hover:bg-surface-hover transition-colors"
                        >
                          Copy mobile &rarr; desktop
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleReset}
                        className="w-full h-10 px-3 text-sm bg-surface border border-border rounded-sm text-error hover:opacity-80 transition-opacity"
                      >
                        Reset to default
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 flex-1 flex flex-col items-center justify-center gap-3">
                    <p className="text-sm text-muted text-center">Select a photo on the canvas to edit its position.</p>
                    <p className="text-xs text-muted/70 text-center -mt-1">Shift/Cmd-click or drag on the background to multi-select · Cmd+A for all</p>
                    <button
                      type="button"
                      onClick={() => { setPendingAdd([]); setPickerOpen(true) }}
                      className="inline-flex items-center gap-1.5 text-sm bg-surface border border-border text-ink px-3 py-1.5 rounded-sm hover:bg-surface-hover transition-colors"
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
                      className="w-full h-10 px-3 text-sm bg-surface border border-border rounded-sm text-ink hover:bg-surface-hover transition-colors inline-flex items-center justify-center gap-1.5"
                    >
                      <PlusIcon size={14} /> Add Photo
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ---- Footer ---- */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface">
              <p className="text-sm text-muted">
                Changes save to config. Run &ldquo;Republish&rdquo; to apply to the live site.
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={handleClose}>Cancel</Button>
                <Button variant="primary" size="sm" onClick={handleSave}>Save</Button>
              </div>
            </div>
          </div>

          {/* ---- Photo picker (rendered above the editor modal) ---- */}
          {pickerOpen && (
            <PhotoPicker
              device={device}
              categories={pickerCategories}
              pendingAdd={pendingAdd}
              activePhotos={activePhotos}
              onToggle={togglePendingAdd}
              onConfirm={handleConfirmAdd}
              onClose={() => setPickerOpen(false)}
            />
          )}
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

      {cropOpen !== null && activePositions[cropOpen] && (
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
  return (
    <div className="space-y-1.5">
      <label className="text-sm text-muted uppercase tracking-wide">{label}</label>
      <div className="grid grid-cols-2 gap-2">
        {fields.map((field) => (
          <div key={field} className="space-y-1">
          <span className="text-xs text-muted">{FIELD_LABELS[field]}</span>
          <input
            type="number"
            value={draft[field] ?? (pos[field] as number)}
            step={0.5}
            min={RANGES[field].min}
            max={RANGES[field].max}
            onInput={(e) => setDraft((d) => ({ ...d, [field]: (e.currentTarget as HTMLInputElement).value }))}
            onBlur={() => onCommit(field)}
            onKeyDown={(e) => { if (e.key === 'Enter') onCommit(field) }}
            className="w-full h-10 px-2 text-sm bg-canvas border border-border rounded-sm text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
          />
          </div>
        ))}
      </div>
    </div>
  )
}
