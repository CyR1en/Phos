import { useConfig } from '../../lib/admin/store'

const NAV: Array<{ id: string; label: string }> = [
  { id: 'site', label: 'Site' },
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'contact', label: 'Contact' },
  { id: 'notFound', label: '404' },
]

interface Props {
  mobileOpen: boolean
  onClose: () => void
}

export function Sidebar({ mobileOpen, onClose }: Props) {
  const { currentPage, setCurrentPage, setToken, flushSave, pluginConfigs, flushPluginSaves } = useConfig()
  const hasPlugins = (pluginConfigs?.length ?? 0) > 0

  const navigate = async (id: string) => {
    onClose()
    if (id === currentPage) return
    await flushSave()
    await flushPluginSaves()
    setCurrentPage(id)
  }

  const logout = async () => {
    onClose()
    await flushSave()
    await flushPluginSaves()
    setToken(null)
  }

  return (
    <aside
      class={`fixed inset-y-0 left-0 z-50 w-64 md:static md:w-56 md:translate-x-0 flex-shrink-0 bg-phos-canvas border-r border-phos-hairline flex flex-col transition-transform duration-200 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}
      aria-label="Admin navigation"
    >
      <div class="px-5 pt-6 pb-5 border-b border-phos-hairline flex items-start justify-between gap-2">
        <div>
          <p class="text-phos-micro font-mono uppercase tracking-wider text-phos-coral mb-1">
            Phos
          </p>
          <h1 class="font-display text-phos-feature text-phos-ink">
            Site Admin
            </h1>
        </div>
        <button
          type="button"
          onClick={onClose}
          class="md:hidden flex h-8 w-8 items-center justify-center rounded-phos-sm text-phos-ink hover:bg-phos-stone transition-colors"
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
              class={`w-full text-left px-5 py-2.5 text-phos-caption font-body transition-colors border-l-2 ${
                active
                  ? 'bg-phos-stone text-phos-ink font-medium border-phos-primary'
                  : 'text-phos-body-muted hover:bg-phos-stone hover:text-phos-ink border-transparent'
              }`}
            >
              {item.label}
            </button>
          )
        })}
        {hasPlugins && (
          <div class="border-t border-phos-hairline mt-3 pt-3">
            <button
              type="button"
              onClick={() => navigate('plugins')}
              class={`w-full text-left px-5 py-2.5 text-phos-caption font-body transition-colors border-l-2 ${
                currentPage === 'plugins'
                  ? 'bg-phos-stone text-phos-ink font-medium border-phos-primary'
                  : 'text-phos-body-muted hover:bg-phos-stone hover:text-phos-ink border-transparent'
              }`}
            >
              Plugins
            </button>
          </div>
        )}
        <div class="border-t border-phos-hairline mt-3 pt-3">
          <button
            type="button"
            onClick={() => navigate('categories')}
            class={`w-full text-left px-5 py-2.5 text-phos-caption font-body transition-colors border-l-2 ${
              currentPage === 'categories'
                ? 'bg-phos-stone text-phos-ink font-medium border-phos-primary'
                : 'text-phos-body-muted hover:bg-phos-stone hover:text-phos-ink border-transparent'
            }`}
          >
            Categories
          </button>
        </div>
      </nav>
      <div class="px-5 py-4 border-t border-phos-hairline">
        <button
          type="button"
          onClick={logout}
          class="text-phos-caption text-phos-muted hover:text-phos-ink underline-offset-2 hover:underline"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
