import { useState, useRef } from 'preact/hooks'
import { Button } from '@components/admin/ui/Button'
import { clamp } from './utils'

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

/**
 * Standalone modal to adjust a photo's crop/pan (object-position) and zoom
 * (scale). Drag the preview to pan, use the slider to zoom.
 */
export function CropEditor({
  photoUrl,
  w,
  h,
  canvasW,
  canvasH,
  initialCropX = 50,
  initialCropY = 50,
  initialZoom = 1,
  onSave,
  onCancel,
}: CropEditorProps) {
  const [cropX, setCropX] = useState(initialCropX)
  const [cropY, setCropY] = useState(initialCropY)
  const [zoom, setZoom] = useState(initialZoom)
  const containerRef = useRef<HTMLDivElement>(null)

  const handlePointerDown = (e: any) => {
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const startCropX = cropX
    const startCropY = cropY
    const cw = containerRef.current?.offsetWidth || 100
    const ch = containerRef.current?.offsetHeight || 100
    const sensitivity = 100 / zoom

    const onPointerMove = (ev: PointerEvent) => {
      setCropX(clamp(startCropX - ((ev.clientX - startX) / cw) * sensitivity, 0, 100))
      setCropY(clamp(startCropY - ((ev.clientY - startY) / ch) * sensitivity, 0, 100))
    }
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  const aspectW = (w / 100) * canvasW
  const aspectH = (h / 100) * canvasH
  const r = aspectW / aspectH

  return (
    <div className="fixed inset-0 z-[150] bg-black/90 flex flex-col items-center justify-center p-8">
      <div className="mb-4 text-white text-sm font-semibold">Drag to pan, use slider to zoom</div>

      <div
        className="relative bg-surface border border-border shadow-2xl overflow-hidden cursor-move"
        ref={containerRef}
        style={{
          width: r > 1 ? '60vw' : `calc(60vh * ${r})`,
          height: r > 1 ? `calc(60vw / ${r})` : '60vh',
          maxHeight: '60vh',
          maxWidth: '60vw',
          aspectRatio: `${aspectW} / ${aspectH}`,
          touchAction: 'none',
        }}
        onPointerDown={handlePointerDown}
      >
        <img
          src={photoUrl}
          draggable={false}
          className="w-full h-full object-cover pointer-events-none will-change-transform"
          style={{
            objectPosition: `${cropX}% ${cropY}%`,
            transform: `scale(${zoom})`,
            transformOrigin: 'center',
          }}
        />
      </div>

      <div className="mt-8 bg-surface p-4 rounded-lg border border-border w-full max-w-md flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <label className="text-xs text-muted uppercase">Zoom</label>
          <input
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(parseFloat((e.currentTarget as HTMLInputElement).value))}
            className="flex-1 accent-primary"
          />
          <span className="text-xs text-ink font-mono">{zoom.toFixed(2)}x</span>
        </div>
        <div className="flex gap-2 justify-end mt-2">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={() => onSave(cropX, cropY, zoom)}>Done</Button>
        </div>
      </div>
    </div>
  )
}
