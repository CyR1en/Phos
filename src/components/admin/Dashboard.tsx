import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'preact/hooks'
import { AuthGate } from './AuthGate'
import { Sidebar } from './Sidebar'
import { SaveIndicator } from './SaveIndicator'
import { ToastViewport } from './ui/Toast'
import { Button } from './ui/Button'
import { ConfigProvider, useConfig } from '../../lib/admin/store'
import { SitePage } from './pages/SitePage'
import { HomePage } from './pages/HomePage'
import { AboutPage } from './pages/AboutPage'
import { ContactPage } from './pages/ContactPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { CategoriesPage } from './pages/CategoriesPage'
import { PluginsPage } from './pages/PluginsPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
})

function PageRouter() {
  const { currentPage } = useConfig()
  switch (currentPage) {
    case 'site':
      return <SitePage />
    case 'home':
      return <HomePage />
    case 'about':
      return <AboutPage />
    case 'contact':
      return <ContactPage />
    case 'notFound':
      return <NotFoundPage />
    case 'categories':
      return <CategoriesPage />
    case 'plugins':
      return <PluginsPage />
    default:
      return <SitePage />
  }
}

function DashboardBody() {
  const { token, flushSave, republish, regenerate, currentPage } = useConfig()
  const [rebuilding, setRebuilding] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        flushSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flushSave])

  useEffect(() => {
    if (!mobileNavOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileNavOpen])

  useEffect(() => {
    if (mobileNavOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [mobileNavOpen])

  if (!token) return <AuthGate />

  const onRepublish = async () => {
    setRebuilding(true)
    try {
      await republish()
    } finally {
      setRebuilding(false)
    }
  }

  const onRegenerate = async () => {
    setRebuilding(true)
    try {
      await regenerate()
    } finally {
      setRebuilding(false)
    }
  }

  const showConfigButtons = currentPage !== 'categories'
  const closeMobileNav = () => setMobileNavOpen(false)

  return (
    <div class="min-h-screen bg-phos-canvas flex">
      {mobileNavOpen && (
        <div
          class="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={closeMobileNav}
          aria-hidden="true"
        />
      )}
      <Sidebar mobileOpen={mobileNavOpen} onClose={closeMobileNav} />
      <main class="flex-1 flex flex-col min-w-0">
        <header class="bg-phos-primary text-phos-canvas">
          <div class="px-4 md:px-8 py-3 flex items-center justify-between md:justify-end gap-2">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              class="md:hidden flex h-9 w-9 items-center justify-center rounded-phos-sm text-phos-canvas hover:bg-phos-primary-hover transition-colors"
              aria-label="Open menu"
            >
              <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            </button>
            <p class="text-phos-micro font-mono uppercase tracking-wider text-phos-coral md:hidden">
              Site Admin
            </p>
            <div class="flex items-center gap-2 sm:gap-3">
              <SaveIndicator />
              {showConfigButtons ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => flushSave()}
                  class="btn-topbar hidden sm:inline-flex"
                >
                  Save
                </Button>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                onClick={onRegenerate}
                disabled={rebuilding}
                class="btn-topbar px-3 py-1.5 sm:px-4 sm:py-2"
              >
                {rebuilding ? 'Working…' : 'Republish photos'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={onRepublish}
                disabled={rebuilding}
                class="btn-topbar px-3 py-1.5 sm:px-4 sm:py-2"
              >
                {rebuilding ? 'Working…' : 'Republish site'}
              </Button>
            </div>
          </div>
        </header>
        <div class="flex-1 overflow-auto p-4 md:p-8 bg-phos-canvas">
          <PageRouter />
        </div>
      </main>
      <ToastViewport />
    </div>
  )
}

export function Dashboard() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <DashboardBody />
      </ConfigProvider>
    </QueryClientProvider>
  )
}
