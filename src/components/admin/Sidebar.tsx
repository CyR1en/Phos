import { useEffect } from 'preact/hooks'
import { useConfig } from '../../lib/admin/store'

const NAV: Array<{ id: string; label: string }> = [
  { id: 'site', label: 'Site' },
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'contact', label: 'Contact' },
  { id: 'notFound', label: '404' },
]

export function Sidebar() {
  const { currentPage, setCurrentPage, flushSave, pluginConfigs, flushPluginSaves } = useConfig()
  const hasPlugins = (pluginConfigs?.length ?? 0) > 0

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

    const onOpen = () => sidebar.classList.remove('hidden')

    sidebar.addEventListener('open.hs.overlay', onOpen)
    return () => {
      sidebar.removeEventListener('open.hs.overlay', onOpen)
    }
  }, [])

  return (
    <aside
      id="admin-sidebar"
      class="hs-overlay hs-overlay-open:translate-x-0 hidden fixed inset-y-0 left-0 z-50 w-64 md:static md:w-56 md:block md:translate-x-0 -translate-x-full bg-canvas border-r border-border flex flex-col transition-transform duration-200"
      role="dialog"
      tabindex="-1"
      aria-label="Admin navigation"
    >
      <div class="px-5 pt-6 pb-5 border-b border-border flex items-start justify-between gap-2">
        <div>
          <p class="text-xs font-mono uppercase tracking-wider text-accent mb-1">
            Phos
          </p>
          <h1 class="font-display font-display text-xl text-ink">
            Site Admin
            </h1>
        </div>
        <button
          type="button"
          data-hs-overlay="#admin-sidebar"
          class="md:hidden flex h-8 w-8 items-center justify-center rounded-sm text-ink hover:bg-surface transition-colors"
          aria-label="Close menu"
        >
          <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <nav class="flex-1 py-2">
        {NAV.map((item) => {
          const active = currentPage === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.id)}
              class={`w-full text-left px-5 py-2.5 text-sm font-body transition-colors border-l-2 ${
                active
                  ? 'bg-surface text-ink font-medium border-primary'
                  : 'text-body-muted hover:bg-surface hover:text-ink border-transparent'
              }`}
            >
              {item.label}
            </button>
          )
        })}
        {hasPlugins && (
          <div class="border-t border-border mt-3 pt-3">
            <button
              type="button"
              onClick={() => navigate('plugins')}
              class={`w-full text-left px-5 py-2.5 text-sm font-body transition-colors border-l-2 ${
                currentPage === 'plugins'
                  ? 'bg-surface text-ink font-medium border-primary'
                  : 'text-body-muted hover:bg-surface hover:text-ink border-transparent'
              }`}
            >
              Plugins
            </button>
          </div>
        )}
        <div class="border-t border-border mt-3 pt-3">
          <button
            type="button"
            onClick={() => navigate('categories')}
            class={`w-full text-left px-5 py-2.5 text-sm font-body transition-colors border-l-2 ${
              currentPage === 'categories'
                ? 'bg-surface text-ink font-medium border-primary'
                : 'text-body-muted hover:bg-surface hover:text-ink border-transparent'
            }`}
          >
            Categories
          </button>
          <button
            type="button"
            onClick={() => navigate('galleries')}
            class={`w-full text-left px-5 py-2.5 text-sm font-body transition-colors border-l-2 ${
              currentPage === 'galleries'
                ? 'bg-surface text-ink font-medium border-primary'
                : 'text-body-muted hover:bg-surface hover:text-ink border-transparent'
            }`}
          >
            Galleries
          </button>
        </div>
      </nav>
    </aside>
  )
}
