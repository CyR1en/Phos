import { useState, useRef, useId } from 'preact/hooks'
import { Button } from '@components/admin/ui/Button'
import { clamp, cropImageStyle } from './utils'
import { useModalFocus } from './dialog'

interface CropEditorProps {
  photoUrl: string
  w: number
  h: number
  canvasW: number
  canvasH: number
  initialCropX?: number
  initialCropY?: number
  initialZoom?: number
  onSave: (cropX: number, cropY: number, zoom: number) => void
  onCancel: () => void
}

export function CropEditor({
  photoUrl, w, h, canvasW, canvasH, initialCropX = 50, initialCropY = 50, initialZoom = 1, onSave, onCancel,
}: CropEditorProps) {
  const [cropX, setCropX] = useState(initialCropX)
  const [cropY, setCropY] = useState(initialCropY)
  const [zoom, setZoom] = useState(clamp(initialZoom, 1, 3))
  const dialogRef = useModalFocus()
  const id = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const panRef = useRef<{ x: number; y: number; cropX: number; cropY: number } | null>(null)

  const handlePointerMove = (e: PointerEvent) => {
    const pan = panRef.current
    const box = containerRef.current
    const img = imageRef.current
    if (!pan || !box || !img) return
    const cw = box.clientWidth || 1
    const ch = box.clientHeight || 1
    const cover = Math.max(cw / (img.naturalWidth || cw), ch / (img.naturalHeight || ch))
    const overflowX = (img.naturalWidth || cw) * cover * zoom - cw
    const overflowY = (img.naturalHeight || ch) * cover * zoom - ch
    if (overflowX > 0.01) setCropX(clamp(pan.cropX - (e.clientX - pan.x) / overflowX * 100, 0, 100))
    if (overflowY > 0.01) setCropY(clamp(pan.cropY - (e.clientY - pan.y) / overflowY * 100, 0, 100))
  }

  const onKeyDown = (e: KeyboardEvent) => {
    // Tab must reach the document-level modal focus trap.
    if (e.key === 'Tab') return
    // This overlay owns other keyboard events, including Cmd+A in its controls.
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); return }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); return }
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    const step = e.shiftKey ? 5 : 1
    if (e.key === 'ArrowLeft') setCropX((x) => clamp(x + step, 0, 100))
    else if (e.key === 'ArrowRight') setCropX((x) => clamp(x - step, 0, 100))
    else if (e.key === 'ArrowUp') setCropY((y) => clamp(y + step, 0, 100))
    else if (e.key === 'ArrowDown') setCropY((y) => clamp(y - step, 0, 100))
    else return
    e.preventDefault()
  }

  const r = ((w / 100) * canvasW) / ((h / 100) * canvasH)
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`}
      tabIndex={-1} onKeyDown={onKeyDown}
      className="fixed inset-0 z-[150] bg-black/90 flex flex-col items-center justify-center p-8">
      <h2 id={`${id}-title`} className="mb-2 text-white text-sm font-semibold">Crop & pan photo</h2>
      <p id={`${id}-help`} className="mb-4 text-white text-sm">Drag or use arrow keys to pan. Use the slider to zoom.</p>
      <div ref={containerRef} tabIndex={0} role="group" aria-label="Photo crop preview; arrow keys pan"
        className="relative bg-surface shadow-2xl overflow-hidden cursor-move"
        style={{ width: r > 1 ? '60vw' : `calc(60vh * ${r})`, height: r > 1 ? `calc(60vw / ${r})` : '60vh',
          maxHeight: '60vh', maxWidth: '60vw', aspectRatio: `${r}`, touchAction: 'none' }}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId)
          panRef.current = { x: e.clientX, y: e.clientY, cropX, cropY }
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={() => { panRef.current = null }} onPointerCancel={() => { panRef.current = null }}
        onLostPointerCapture={() => { panRef.current = null }}>
        <img ref={imageRef} src={photoUrl} alt="Photo crop" draggable={false}
          className="w-full h-full object-cover pointer-events-none" style={cropImageStyle(cropX, cropY, zoom)} />
      </div>
      <div className="mt-8 bg-surface p-4 rounded-lg border border-border w-full max-w-md flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <label htmlFor={`${id}-zoom`} className="text-xs text-muted uppercase">Zoom</label>
          <input id={`${id}-zoom`} type="range" min="1" max="3" step="0.05" value={zoom}
            onInput={(e) => setZoom(Number(e.currentTarget.value))} className="flex-1 min-h-11 accent-primary" />
          <span className="text-xs text-ink font-mono">{zoom.toFixed(2)}×</span>
        </div>
        <div className="flex gap-2 justify-end mt-2">
          <Button variant="secondary" className="min-h-11" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" className="min-h-11" onClick={() => onSave(cropX, cropY, zoom)}>Done</Button>
        </div>
      </div>
    </div>
  )
}
