import type { ComponentChildren } from 'preact'
import { useState, useEffect, useRef } from 'preact/hooks'
import { createPortal } from 'preact/compat'

interface Props {
  text: string
  shortcut?: string
  children: ComponentChildren
}

export function Tooltip({ text, shortcut, children }: Props) {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number; isLeftRail: boolean } | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  const updatePosition = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const isLeftRail = rect.left < 80
    if (isLeftRail) {
      setCoords({
        top: rect.top + rect.height / 2,
        left: rect.right + 8,
        isLeftRail: true,
      })
    } else {
      setCoords({
        top: rect.bottom + 6,
        left: rect.left + rect.width / 2,
        isLeftRail: false,
      })
    }
  }

  const showTooltip = () => {
    updatePosition()
    setVisible(true)
  }

  const hideTooltip = () => {
    setVisible(false)
  }

  useEffect(() => {
    if (!visible) return

    // Update position on scroll/resize
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [visible])

  return (
    <div
      ref={triggerRef}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocusIn={showTooltip}
      onFocusOut={hideTooltip}
      onClick={hideTooltip}
      class="relative"
    >
      {children}
      {visible && coords && createPortal(
        <span
          class="pointer-events-none fixed rounded-sm bg-ink px-2 py-1 text-xs text-primary-text hidden sm:block z-[100] whitespace-nowrap"
          style={{
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            transform: coords.isLeftRail ? 'translateY(-50%)' : 'translateX(-50%)',
          }}
        >
          {text}
          {shortcut && <span class="ml-1.5 opacity-60">{shortcut}</span>}
        </span>,
        document.body
      )}
    </div>
  )
}
