import { useEffect, useState, useRef } from 'preact/hooks'
import { useConfig } from '../../lib/admin/store'
import { version } from '../../../package.json'
import { SidebarResizeHandle } from './SidebarResizeHandle'
import { Tooltip } from './ui/Tooltip'

const NAV: Array<{ id: string; label: string }> = [
  { id: 'site', label: 'Site' },
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'contact', label: 'Contact' },
  { id: 'notFound', label: '404' },
]

function getIcon(id: string, collapsed: boolean) {
  const iconClass = `size-4${collapsed ? '' : ' mr-2.5'}`
  switch (id) {
    case 'site':
      return (
        <svg class={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      )
    case 'home':
      return (
        <svg class={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      )
    case 'about':
      return (
        <svg class={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )
    case 'contact':
      return (
        <svg class={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      )
    case 'notFound':
      return (
        <svg class={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      )
    case 'categories':
      return (
        <svg class={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      )
    case 'galleries':
      return (
        <svg class={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
      )
    case 'plugins':
      return (
        <svg class={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        </svg>
      )
    default:
      return null
  }
}

interface SidebarProps {
  width: number
  collapsed: boolean
  setWidth: (w: number) => void
  setCollapsed: (c: boolean) => void
}

export function Sidebar({ width, collapsed, setWidth, setCollapsed }: SidebarProps) {
  const { currentPage, setCurrentPage, flushSave, pluginConfigs, flushPluginSaves } = useConfig()
  const hasPlugins = (pluginConfigs?.length ?? 0) > 0
  const [isOpen, setIsOpen] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)
  const [minWidth, setMinWidth] = useState(160)

  const isCollapsed = collapsed && !isOpen
  const isMobileOverlay = isOpen && typeof window !== 'undefined' && window.innerWidth < 768

  const closeOverlay = () => {
    const win = window as any
    if (win.HSOverlay?.close) {
      win.HSOverlay.close('#admin-sidebar')
    }
  }

  const navigate = async (id: string) => {
    closeOverlay()
    if (id === currentPage) return
    await flushSave()
    await flushPluginSaves()
    setCurrentPage(id)
  }

  const measureMinWidth = () => {
    if (!sidebarRef.current) return
    const elements = sidebarRef.current.querySelectorAll('[data-measure="nav-item"], [data-measure="nav-header"]')
    let max = 0
    elements.forEach((el) => {
      max = Math.max(max, (el as HTMLElement).scrollWidth)
    })
    if (max > 0) {
      // add 24px for horizontal padding, cap between 120 and 240
      const calculated = Math.max(120, Math.min(240, max + 24))
      setMinWidth(calculated)
    } else {
      setMinWidth(160)
    }
  }

  useEffect(() => {
    // Measure on mount
    measureMinWidth()

    // Measure on theme change (dark class toggle on html element)
    const observer = new MutationObserver(() => {
      measureMinWidth()
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const sidebar = document.getElementById('admin-sidebar')
    if (!sidebar) return

    const onOpen = () => {
      sidebar.classList.remove('hidden')
      setIsOpen(true)
    }
    const onClose = () => {
      setIsOpen(false)
    }

    sidebar.addEventListener('open.hs.overlay', onOpen)
    sidebar.addEventListener('close.hs.overlay', onClose)
    return () => {
      sidebar.removeEventListener('open.hs.overlay', onOpen)
      sidebar.removeEventListener('close.hs.overlay', onClose)
    }
  }, [])

  const renderNavButton = (id: string, label: string, onClick: () => void, active: boolean) => {
    const buttonEl = (
      <button
        type="button"
        onClick={onClick}
        data-measure="nav-item"
        aria-current={active ? 'page' : undefined}
        class={`w-full flex items-center ${isCollapsed ? 'justify-center px-2' : 'px-3'} py-2 text-sm font-medium rounded-sm transition-all duration-150 ${
          active
            ? 'bg-surface text-ink shadow-2xs font-semibold'
            : 'text-body-muted hover:bg-surface/40 hover:text-ink'
        }`}
      >
        {getIcon(id, isCollapsed)}
        {!isCollapsed && label}
      </button>
    )

    if (isCollapsed) {
      return (
        <Tooltip text={label} key={id}>
          {buttonEl}
        </Tooltip>
      )
    }

    return buttonEl
  }

  return (
    <>
      <aside
        id="admin-sidebar"
        data-hs-overlay-options='{"backdrop": false}'
        class="hs-overlay hs-overlay-open:translate-x-0 hs-overlay-open:flex hidden fixed inset-y-0 left-0 z-[60] w-72 md:w-[var(--sidebar-width)] h-full md:flex md:translate-x-0 -translate-x-full bg-canvas border-r border-border flex flex-col transition-transform duration-200 pl-[env(safe-area-inset-left,0px)]"
        role={isMobileOverlay ? 'dialog' : undefined}
        aria-modal={isMobileOverlay ? 'true' : undefined}
        tabindex={-1}
        aria-label="Admin navigation"
        ref={sidebarRef}
      >
        <div class={`h-16 ${isCollapsed ? 'px-2 justify-center' : 'px-6 justify-between'} border-b border-border box-border flex items-center gap-2 bg-canvas-alt/20`}>
          {!isCollapsed && (
            <div class="flex items-center gap-2.5">
              <img src="/logo.svg" alt="Phos Logo" class="h-6 w-auto dark:invert" />
              <div>
                <p class="font-display font-semibold text-base text-ink leading-tight">
                  Phos Admin
                </p>
              </div>
            </div>
          )}
          <button
            type="button"
            data-hs-overlay="#admin-sidebar"
            class="md:hidden flex h-11 w-11 items-center justify-center rounded-sm text-ink hover:bg-surface transition-colors"
            aria-label="Close menu"
          >
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => {
              // When expanding from the icon-only rail, reset to the dynamic
              // min width that fits the widest nav item. Without this, the
              // sidebar would pop back to the stale (often too-small) width
              // it had just before the snap-to-collapse fired, clipping the
              // header logo and "Phos Admin" title.
              if (collapsed) {
                setWidth(minWidth)
              }
              setCollapsed(!collapsed)
            }}
            class="hidden md:flex h-8 w-8 items-center justify-center rounded-sm text-muted hover:text-ink hover:bg-surface transition-colors cursor-pointer"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            ) : (
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            )}
          </button>
        </div>
        <div class="flex-1 overflow-y-auto overflow-x-hidden">
          <nav class={`py-4 space-y-6 ${isCollapsed ? 'px-2' : 'px-3'}`}>
            <div class="space-y-1">
              {!isCollapsed && (
                <p class="px-3 text-xs font-mono uppercase tracking-wider text-muted mb-2" data-measure="nav-header">
                  Pages
                </p>
              )}
              {NAV.map((item) => {
                const active = currentPage === item.id
                return renderNavButton(item.id, item.label, () => navigate(item.id), active)
              })}
            </div>

            <div class="space-y-1">
              {!isCollapsed && (
                <p class="px-3 text-xs font-mono uppercase tracking-wider text-muted mb-2" data-measure="nav-header">
                  Content
                </p>
              )}
              {renderNavButton('categories', 'Categories', () => navigate('categories'), currentPage === 'categories')}
              {renderNavButton('galleries', 'Galleries', () => navigate('galleries'), currentPage === 'galleries')}
            </div>

            {hasPlugins && (
              <div class="space-y-1">
                {!isCollapsed && (
                  <p class="px-3 text-xs font-mono uppercase tracking-wider text-muted mb-2" data-measure="nav-header">
                    Extensions
                  </p>
                )}
                {renderNavButton('plugins', 'Plugins', () => navigate('plugins'), currentPage === 'plugins')}
              </div>
            )}
          </nav>
        </div>
        <div class={`mt-auto border-t border-border p-4 bg-surface/10 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`} data-measure="nav-item">
          {isCollapsed ? (
            <div class="flex items-center justify-center">
              <span class="size-2 rounded-full bg-success animate-pulse" title="System Active" />
            </div>
          ) : (
            <>
              <div class="flex items-center gap-2">
                <span class="size-2 rounded-full bg-success animate-pulse" />
                <span class="text-xs text-muted">System Active</span>
              </div>
              <span class="text-xs text-muted">v{version}</span>
            </>
          )}
        </div>

        {/* Sidebar Resize Handle */}
        {!collapsed && (
          <div className="hidden md:block">
            <SidebarResizeHandle onResize={setWidth} minWidth={200} maxWidth={256} />
          </div>
        )}
      </aside>
      {isOpen && (
        <div
          onClick={closeOverlay}
          class="fixed inset-0 z-40 bg-black/50 md:hidden transition-opacity"
        />
      )}
    </>
  )
}
