import { useRef } from 'preact/hooks'

interface SidebarResizeHandleProps {
  onResize: (width: number) => void
  minWidth: number
  maxWidth: number
  width?: number
}

export function SidebarResizeHandle({ onResize, minWidth, maxWidth, width: propWidth }: SidebarResizeHandleProps) {
  const isDragging = useRef(false)
  const handleRef = useRef<HTMLDivElement>(null)

  const getCurrentWidth = () => {
    if (propWidth !== undefined) return propWidth
    if (handleRef.current?.parentElement) {
      return handleRef.current.parentElement.getBoundingClientRect().width
    }
    return minWidth
  }

  const handlePointerDown = (e: PointerEvent) => {
    e.preventDefault()
    const el = handleRef.current
    if (!el) return
    isDragging.current = true
    el.setPointerCapture(e.pointerId)
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!isDragging.current) return
      const newWidth = Math.max(minWidth, Math.min(maxWidth, moveEvent.clientX))
      onResize(newWidth)
    }

    const handlePointerEnd = (endEvent: PointerEvent) => {
      if (!isDragging.current) return
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      const target = handleRef.current
      if (target && target.hasPointerCapture(endEvent.pointerId)) {
        target.releasePointerCapture(endEvent.pointerId)
      }
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerEnd)
      window.removeEventListener('pointercancel', handlePointerEnd)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerEnd)
    window.addEventListener('pointercancel', handlePointerEnd)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    const currentWidth = getCurrentWidth()
    let newWidth = currentWidth
    if (e.key === 'ArrowLeft') {
      newWidth = Math.max(minWidth, currentWidth - 8)
      e.preventDefault()
    } else if (e.key === 'ArrowRight') {
      newWidth = Math.min(maxWidth, currentWidth + 8)
      e.preventDefault()
    } else if (e.key === 'Home') {
      newWidth = minWidth
      e.preventDefault()
    } else if (e.key === 'End') {
      newWidth = maxWidth
      e.preventDefault()
    }
    if (newWidth !== currentWidth) {
      onResize(newWidth)
    }
  }

  return (
    <div
      ref={handleRef}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={getCurrentWidth()}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      tabIndex={0}
      className="absolute top-0 right-[-4px] bottom-0 w-[8px] cursor-ew-resize group z-50 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      style={{ touchAction: 'none' }}
    >
      <div className="absolute top-0 bottom-0 left-[3px] w-[2px] bg-border group-hover:bg-primary group-focus-visible:bg-primary transition-colors duration-150" />
    </div>
  )
}
