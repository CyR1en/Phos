import { useState, useEffect, useRef } from 'preact/hooks'
import { useConfig } from '@lib/admin/store'
import { useLocalStorageState } from '@lib/admin/useLocalStorageState'

const PAGE_TO_PUBLIC_ROUTE: Record<string, string> = {
  site: '/',
  home: '/',
  about: '/about/',
  contact: '/contact/',
  galleries: '/galleries/',
}

interface PreviewPanelProps {
  visible: boolean
  onClose: () => void
  width: number
  onResize: (width: number) => void
}

export function PreviewPanel({ visible, onClose, width, onResize }: PreviewPanelProps) {
  const { currentPage, saveStatus, buildStatus } = useConfig()
  const [lastUrl, setLastUrl] = useLocalStorageState('admin.preview.lastUrl', '/')
  const [currentUrl, setCurrentUrl] = useState(lastUrl)
  const [isEditingUrl, setIsEditingUrl] = useState(false)
  const [urlInputValue, setUrlInputValue] = useState(currentUrl)

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const isDragging = useRef(false)
  const prevSaveStatus = useRef(saveStatus)
  const prevBuildStatus = useRef(buildStatus)

  // Mirror the admin's theme (.dark class + data-theme attribute) onto the iframe's <html>.
  // Same-origin, so the iframe's contentDocument is accessible. Safe to call when the iframe
  // hasn't loaded yet (contentDocument will be null and the call is a no-op).
  const syncThemeToIframe = () => {
    const iframe = iframeRef.current
    if (!iframe) return
    const iframeDoc = iframe.contentDocument
    if (!iframeDoc) return
    const adminHtml = document.documentElement
    const iframeHtml = iframeDoc.documentElement
    if (adminHtml.classList.contains('dark')) {
      iframeHtml.classList.add('dark')
    } else {
      iframeHtml.classList.remove('dark')
    }
    const dataTheme = adminHtml.getAttribute('data-theme')
    if (dataTheme) {
      iframeHtml.setAttribute('data-theme', dataTheme)
    } else {
      iframeHtml.removeAttribute('data-theme')
    }
  }

  // Sync iframe on admin page navigation
  useEffect(() => {
    const mappedRoute = PAGE_TO_PUBLIC_ROUTE[currentPage]
    if (mappedRoute) {
      setCurrentUrl(mappedRoute)
      setLastUrl(mappedRoute)
      setUrlInputValue(mappedRoute)
    }
  }, [currentPage])

  // Sync iframe on save
  useEffect(() => {
    if (prevSaveStatus.current !== 'saved' && saveStatus === 'saved') {
      if (iframeRef.current) {
        try {
          iframeRef.current.contentWindow?.location.reload()
        } catch (e) {
          // fallback
          const src = iframeRef.current.src
          iframeRef.current.src = src
        }
      }
    }
    prevSaveStatus.current = saveStatus
  }, [saveStatus])

  // Sync iframe when a republish/regenerate task completes
  useEffect(() => {
    if (prevBuildStatus.current !== 'done' && buildStatus === 'done') {
      if (iframeRef.current) {
        try {
          iframeRef.current.contentWindow?.location.reload()
        } catch (e) {
          // fallback
          const src = iframeRef.current.src
          iframeRef.current.src = src
        }
      }
    }
    prevBuildStatus.current = buildStatus
  }, [buildStatus])

  // Sync currentUrl and urlInputValue when lastUrl changes from cross-tab
  useEffect(() => {
    setCurrentUrl(lastUrl)
    setUrlInputValue(lastUrl)
  }, [lastUrl])

  // Watch the admin's <html> for theme changes and mirror them onto the iframe.
  // Fires on dark/light toggle (.dark class) and on color-palette changes (data-theme).
  useEffect(() => {
    const observer = new MutationObserver(() => {
      syncThemeToIframe()
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })
    return () => observer.disconnect()
  }, [])

  if (!visible) return null

  const handleRefresh = () => {
    if (iframeRef.current) {
      try {
        iframeRef.current.contentWindow?.location.reload()
      } catch (e) {
        const src = iframeRef.current.src
        iframeRef.current.src = src
      }
    }
  }

  const handleIframeLoad = () => {
    try {
      syncThemeToIframe()
      const pathname = iframeRef.current?.contentWindow?.location.pathname
      if (pathname && pathname !== currentUrl) {
        setCurrentUrl(pathname)
        setLastUrl(pathname)
        setUrlInputValue(pathname)
      }
    } catch (e) {
      // ignore cross-origin errors if any
    }
  }

  const handleUrlSubmit = () => {
    let formatted = urlInputValue.trim()
    if (!formatted.startsWith('/')) {
      formatted = '/' + formatted
    }
    setCurrentUrl(formatted)
    setLastUrl(formatted)
    setIsEditingUrl(false)
  }

  const handleUrlKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleUrlSubmit()
    } else if (e.key === 'Escape') {
      setUrlInputValue(currentUrl)
      setIsEditingUrl(false)
    }
  }

  const handleMouseDown = (e: PointerEvent) => {
    e.preventDefault()
    const target = e.currentTarget as HTMLElement
    isDragging.current = true
    target.setPointerCapture(e.pointerId)
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!isDragging.current) return
      // Preview panel is on the right, so its width is window.innerWidth - mouseX
      const newWidth = Math.max(320, Math.min(800, window.innerWidth - moveEvent.clientX))
      onResize(newWidth)
    }

    const handlePointerEnd = (endEvent: PointerEvent) => {
      if (!isDragging.current) return
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (target.hasPointerCapture(endEvent.pointerId)) {
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

  return (
    <div
      className="fixed top-0 right-0 bottom-0 border-l border-border bg-surface flex flex-col z-30"
      style={{ width: `${width}px` }}
    >
      {/* Resize Handle on Left Edge */}
      <div
        onPointerDown={handleMouseDown}
        className="absolute top-0 left-[-4px] bottom-0 w-[8px] cursor-ew-resize group z-50 select-none"
        style={{ touchAction: 'none' }}
      >
        <div className="absolute top-0 bottom-0 left-[3px] w-[2px] bg-border group-hover:bg-primary transition-colors duration-150" />
      </div>

      {/* Panel Header */}
      <div className="h-16 border-b border-border flex items-center justify-between px-4 gap-2 bg-canvas-alt/20 select-none">
        <div className="flex-1 flex items-center min-w-0">
          {isEditingUrl ? (
            <input
              type="text"
              value={urlInputValue}
              onInput={(e) => setUrlInputValue((e.target as HTMLInputElement).value)}
              onBlur={handleUrlSubmit}
              onKeyDown={handleUrlKeyDown}
              className="w-full text-xs bg-canvas border border-border rounded-sm px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-ink"
              autoFocus
            />
          ) : (
            <div
              onClick={() => setIsEditingUrl(true)}
              className="text-xs text-muted hover:text-ink cursor-pointer truncate font-mono hover:bg-surface-hover px-2 py-1 rounded-sm w-full transition-colors"
              title="Click to edit URL"
            >
              {currentUrl}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded-sm text-muted hover:text-ink hover:bg-surface-hover transition-colors"
            title="Refresh Preview"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.72 2.78L21 8" />
              <polyline points="21 3 21 8 16 8" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-sm text-muted hover:text-ink hover:bg-surface-hover transition-colors"
            title="Close Preview"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Iframe Viewport */}
      <div className="flex-1 bg-white relative">
        <iframe
          ref={iframeRef}
          src={currentUrl}
          onLoad={handleIframeLoad}
          className="w-full h-full border-none"
        />
      </div>
    </div>
  )
}
