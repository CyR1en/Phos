import { Rnd } from 'react-rnd'
import type { PhotoPosition } from '@lib/admin/types'
import {
  RANGES,
  ALL_HANDLES,
  RESIZE_HANDLES,
  vwToPx,
  vhToPx,
  brOf,
  thumbUrl,
} from './utils'

// react-rnd is a React component; cast to any to avoid Preact/React JSX type
// mismatches (the established pattern in this codebase).
const RndAny = Rnd as any

interface Props {
  photo: string
  index: number
  pos: PhotoPosition
  isSelected: boolean
  selectedCount: number
  canvas: { w: number; h: number }
  onDragStart: (index: number, d: { x: number; y: number }) => void
  onDrag: (index: number, d: { x: number; y: number; deltaX: number; deltaY: number }) => void
  onDragStop: (index: number, d: { x: number; y: number }) => void
  onResizeStop: (index: number, ref: HTMLElement, position: { x: number; y: number }) => void
  onSelect: (index: number, e: MouseEvent) => void
  onDoubleClick?: (index: number, e: MouseEvent) => void
}

/**
 * A single draggable/resizable photo on the editor canvas. Presentational only
 * — all drag/resize state mutation lives in the parent, which passes handlers
 * keyed by photo index.
 */
export function CanvasPhoto({
  photo,
  index,
  pos,
  isSelected,
  selectedCount,
  canvas,
  onDragStart,
  onDrag,
  onDragStop,
  onResizeStop,
  onSelect,
  onDoubleClick,
}: Props) {
  const br = brOf(pos)
  return (
    <RndAny
      key={`${photo}-${index}`}
      size={{ width: vwToPx(pos.w, canvas.w), height: vhToPx(pos.h, canvas.h) }}
      position={{
        x: canvas.w / 2 + vwToPx(pos.x, canvas.w) - vwToPx(pos.w, canvas.w) / 2,
        y: canvas.h / 2 + vhToPx(pos.y, canvas.h) - vhToPx(pos.h, canvas.h) / 2,
      }}
      onDragStart={(_e: any, d: any) => onDragStart(index, { x: d.x, y: d.y })}
      onDrag={(_e: any, d: any) => onDrag(index, { x: d.x, y: d.y, deltaX: d.deltaX, deltaY: d.deltaY })}
      onDragStop={(_e: any, d: any) => onDragStop(index, { x: d.x, y: d.y })}
      onResizeStop={(_e: any, _dir: any, ref: any, _delta: any, position: any) =>
        onResizeStop(index, ref, position)}
      onMouseDown={(e: MouseEvent) => onSelect(index, e)}
      onDoubleClick={(e: MouseEvent) => onDoubleClick?.(index, e)}
      enableResizing={ALL_HANDLES}
      minWidth={vwToPx(RANGES.w.min, canvas.w)}
      minHeight={vhToPx(RANGES.h.min, canvas.h)}
      resizeHandleStyles={RESIZE_HANDLES}
      style={{
        zIndex: pos.z,
        border: isSelected
          ? selectedCount > 1
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
          alt={`Photo ${index}`}
          className="w-full h-full object-cover select-none pointer-events-none will-change-transform"
          draggable={false}
          style={{
            objectPosition: `${pos.cropX ?? 50}% ${pos.cropY ?? 50}%`,
            transform: `scale(${pos.cropZoom ?? 1})`,
            transformOrigin: 'center',
          }}
        />
        <span className="absolute top-0.5 left-1 text-[10px] font-mono text-white bg-black/60 px-1 rounded-sm pointer-events-none">
          {index}
        </span>
      </div>
    </RndAny>
  )
}
