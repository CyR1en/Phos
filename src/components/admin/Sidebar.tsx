import { useEffect, useState } from 'preact/hooks'
import { useConfig } from '../../lib/admin/store'
import { version } from '../../../package.json'

const NAV: Array<{ id: string; label: string }> = [
  { id: 'site', label: 'Site' },
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'contact', label: 'Contact' },
  { id: 'notFound', label: '404' },
]

function getIcon(id: string) {
  switch (id) {
    case 'site':
      return (
        <svg class="size-4 mr-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      )
    case 'home':
      return (
        <svg class="size-4 mr-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      )
    case 'about':
      return (
        <svg class="size-4 mr-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )
    case 'contact':
      return (
        <svg class="size-4 mr-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      )
    case 'notFound':
      return (
        <svg class="size-4 mr-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      )
    case 'categories':
      return (
        <svg class="size-4 mr-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      )
    case 'galleries':
      return (
        <svg class="size-4 mr-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
      )
    case 'plugins':
      return (
        <svg class="size-4 mr-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        </svg>
      )
    default:
      return null
  }
}

export function Sidebar() {
  const { currentPage, setCurrentPage, flushSave, pluginConfigs, flushPluginSaves } = useConfig()
  const hasPlugins = (pluginConfigs?.length ?? 0) > 0
  const [isOpen, setIsOpen] = useState(false)

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

  return (
    <>
      <aside
        id="admin-sidebar"
        data-hs-overlay-options='{"backdrop": false}'
        class="hs-overlay hs-overlay-open:translate-x-0 hs-overlay-open:flex hidden fixed inset-y-0 left-0 z-[60] w-64 h-full md:flex md:translate-x-0 -translate-x-full bg-canvas border-r border-border flex flex-col transition-transform duration-200"
        role="dialog"
        tabindex={-1}
        aria-label="Admin navigation"
      >
        <div class="h-16 px-6 border-b border-border box-border flex items-center justify-between gap-2 bg-canvas-alt/20">
          <div class="flex items-center gap-2.5">
            <img src="/logo.svg" alt="Phos Logo" class="h-6 w-auto dark:invert" />
            <div>
              <h1 class="font-display font-semibold text-base text-ink leading-tight">
                Phos Admin
              </h1>
            </div>
          </div>
          <button
            type="button"
            data-hs-overlay="#admin-sidebar"
            class="md:hidden flex h-8 w-8 items-center justify-center rounded-sm text-ink hover:bg-surface transition-colors"
            aria-label="Close menu"
          >
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="flex-1 overflow-y-auto">
          <nav class="px-3 py-4 space-y-6">
            <div class="space-y-1">
            <p class="px-3 text-[10px] font-mono uppercase tracking-wider text-muted mb-2">
              Pages
            </p>
            {NAV.map((item) => {
              const active = currentPage === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.id)}
                  class={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-sm transition-all duration-150 ${
                    active
                      ? 'bg-surface text-ink shadow-2xs font-semibold'
                      : 'text-body-muted hover:bg-surface/40 hover:text-ink'
                  }`}
                >
                  {getIcon(item.id)}
                  {item.label}
                </button>
              )
            })}
          </div>

          <div class="space-y-1">
            <p class="px-3 text-[10px] font-mono uppercase tracking-wider text-muted mb-2">
              Content
            </p>
            <button
              type="button"
              onClick={() => navigate('categories')}
              class={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-sm transition-all duration-150 ${
                currentPage === 'categories'
                  ? 'bg-surface text-ink shadow-2xs font-semibold'
                  : 'text-body-muted hover:bg-surface/40 hover:text-ink'
              }`}
            >
              {getIcon('categories')}
              Categories
            </button>
            <button
              type="button"
              onClick={() => navigate('galleries')}
              class={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-sm transition-all duration-150 ${
                currentPage === 'galleries'
                  ? 'bg-surface text-ink shadow-2xs font-semibold'
                  : 'text-body-muted hover:bg-surface/40 hover:text-ink'
              }`}
            >
              {getIcon('galleries')}
              Galleries
            </button>
          </div>

          {hasPlugins && (
            <div class="space-y-1">
              <p class="px-3 text-[10px] font-mono uppercase tracking-wider text-muted mb-2">
                Extensions
              </p>
              <button
                type="button"
                onClick={() => navigate('plugins')}
                class={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-sm transition-all duration-150 ${
                  currentPage === 'plugins'
                    ? 'bg-surface text-ink shadow-2xs font-semibold'
                    : 'text-body-muted hover:bg-surface/40 hover:text-ink'
                }`}
              >
                {getIcon('plugins')}
                Plugins
              </button>
            </div>
          )}
        </nav>
        </div>
        <div class="mt-auto border-t border-border p-4 bg-surface/10 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="size-2 rounded-full bg-success animate-pulse" />
            <span class="text-xs text-muted">System Active</span>
          </div>
          <span class="text-xs text-muted">v{version}</span>
        </div>
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
