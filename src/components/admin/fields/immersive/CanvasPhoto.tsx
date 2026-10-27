import { Rnd } from 'react-rnd'
import type { PhotoPosition } from '@lib/admin/types'
import { STAGE } from '../../../../lib/immersive-motion'
import {
  RANGES, ALL_HANDLES, RESIZE_HANDLES, vwToPx, vhToPx, brOf, thumbUrl, cropImageStyle, canvasFrameStyle,
} from './utils'

const RndAny = Rnd as any

interface Props {
  photo: string
  index: number
  pos: PhotoPosition
  device: 'mobile' | 'desktop'
  isSelected: boolean
  selectedCount: number
  canvas: { w: number; h: number }
  readOnly?: boolean
  fliesFirst?: boolean
  onDragStart: (index: number, d: { x: number; y: number }) => void
  onDrag: (index: number, d: { x: number; y: number; deltaX: number; deltaY: number }) => void
  onDragStop: (index: number, d: { x: number; y: number }) => void
  onResizeStop: (index: number, ref: HTMLElement, position: { x: number; y: number }) => void
  onSelect: (index: number, e: MouseEvent) => void
  onDoubleClick?: (index: number, e: MouseEvent) => void
}

/** The Rnd box is the live frame box, before the shared stage/motion transforms. */
export function CanvasPhoto({
  photo, index, pos, device, isSelected, selectedCount, canvas, readOnly = false, fliesFirst = false,
  onDragStart, onDrag, onDragStop, onResizeStop, onSelect, onDoubleClick,
}: Props) {
  if (pos.w === 0 && pos.h === 0) return null
  const radius = brOf(pos) * canvas.w / (device === 'mobile' ? 393 : 1440)
  const image = (
    <div className="relative w-full h-full overflow-hidden" style={{ borderRadius: radius }}>
      <img src={thumbUrl(photo)} alt={`Photo ${index + 1}: ${photo.split('/').pop()}`}
        className="w-full h-full object-cover select-none pointer-events-none" draggable={false}
        style={cropImageStyle(pos.cropX, pos.cropY, pos.cropZoom)} />
      {!readOnly && <span className="absolute top-1 left-1 text-xs font-mono text-white bg-black/70 px-1 rounded-sm pointer-events-none">
        {index + 1}{fliesFirst ? ' · flies first' : ''}
      </span>}
    </div>
  )
  if (readOnly) return <div data-photo={photo} data-preview-frame style={{ ...canvasFrameStyle(pos, canvas), position: 'absolute', borderRadius: radius, overflow: 'hidden' }}>{image}</div>
  return (
    <RndAny
      size={{ width: vwToPx(pos.w, canvas.w), height: vhToPx(pos.h, canvas.h) }}
      position={{
        x: canvas.w / 2 + vwToPx(pos.x, canvas.w) - vwToPx(pos.w, canvas.w) / 2,
        y: canvas.h / 2 + vhToPx(pos.y, canvas.h) - vhToPx(pos.h, canvas.h) / 2,
      }}
      scale={STAGE.scale}
      onDragStart={(_e: any, d: any) => onDragStart(index, { x: d.x, y: d.y })}
      onDrag={(_e: any, d: any) => onDrag(index, { x: d.x, y: d.y, deltaX: d.deltaX, deltaY: d.deltaY })}
      onDragStop={(_e: any, d: any) => onDragStop(index, { x: d.x, y: d.y })}
      onResizeStop={(_e: any, _dir: any, ref: any, _delta: any, position: any) => onResizeStop(index, ref, position)}
      onMouseDown={(e: MouseEvent) => onSelect(index, e)}
      onDoubleClick={(e: MouseEvent) => onDoubleClick?.(index, e)}
      enableResizing={ALL_HANDLES}
      minWidth={vwToPx(RANGES.w.min, canvas.w)} minHeight={vhToPx(RANGES.h.min, canvas.h)}
      resizeHandleStyles={RESIZE_HANDLES}
      resizeHandleComponent={Object.fromEntries(Object.keys(RESIZE_HANDLES).map((corner) => [corner,
        <span className="immersive-resize-handle" aria-hidden="true" />,
      ]))}
      data-photo={photo}
      style={{
        zIndex: pos.z,
        outline: isSelected ? `2px ${selectedCount > 1 ? 'dashed' : 'solid'} var(--color-primary)` : undefined,
        borderRadius: radius, cursor: 'move', pointerEvents: 'auto',
      }}
    >{image}</RndAny>
  )
}
