import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'preact/hooks'
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
import { GalleriesPage } from './pages/GalleriesPage'
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
    case 'galleries':
      return <GalleriesPage />
    case 'plugins':
      return <PluginsPage />
    default:
      return <SitePage />
  }
}

const BUILD_LOG_ENABLED = import.meta.env.PUBLIC_ADMIN_BUILD_LOG !== 'false'

function DashboardBody() {
  const { token, flushSave, setToken, republish, regenerate, currentPage, buildStatus, buildLog, clearBuildStatus } = useConfig()
  const signOut = async () => { await flushSave(); setToken(null) }
  const [countdown, setCountdown] = useState<number | null>(null)
  const autoCloseRef = useRef<ReturnType<typeof setTimeout>>()
  const intervalRef = useRef<ReturnType<typeof setInterval>>()
  const hasInteracted = useRef(false)
  const logRef = useRef<HTMLDivElement>(null)

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
    if (buildStatus !== 'done' && buildStatus !== 'error') {
      setCountdown(null)
      return
    }
    hasInteracted.current = false
    setCountdown(3)

    intervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(intervalRef.current)
          return null
        }
        return prev - 1
      })
    }, 1000)

    autoCloseRef.current = setTimeout(() => {
      if (!hasInteracted.current) clearBuildStatus()
      setCountdown(null)
      clearInterval(intervalRef.current)
    }, 3000)

    return () => {
      clearTimeout(autoCloseRef.current)
      clearInterval(intervalRef.current)
      setCountdown(null)
    }
  }, [buildStatus])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [buildLog])

  useEffect(() => {
    const win = window as any
    if (win.HSStaticMethods?.autoInit) {
      requestAnimationFrame(() => win.HSStaticMethods.autoInit())
    }
  }, [currentPage])

  if (!token) return <AuthGate />

  const onRepublish = async () => { await republish() }
  const onRegenerate = async () => { await regenerate() }

  const running = buildStatus === 'running'
  const showConfigButtons = currentPage !== 'categories'

  return (
    <div class="min-h-screen bg-canvas flex">
      <Sidebar />
      <main class="flex-1 flex flex-col min-w-0">
        <header class="bg-primary text-primary-text">
          <div class="px-4 md:px-8 py-3 flex items-center justify-between md:justify-end gap-2">
            <button
              type="button"
              data-hs-overlay="#admin-sidebar"
              class="md:hidden flex h-9 w-9 items-center justify-center rounded-sm text-primary-text hover:bg-primary-hover transition-colors"
              aria-label="Open menu"
            >
              <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            </button>
            <p class="text-xs font-mono uppercase tracking-wider text-accent md:hidden">
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
                disabled={running}
                class="btn-topbar px-3 py-1.5 sm:px-4 sm:py-2"
              >
                {running ? 'Working…' : 'Republish photos'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={onRepublish}
                disabled={running}
                class="btn-topbar px-3 py-1.5 sm:px-4 sm:py-2"
              >
                {running ? 'Working…' : 'Republish site'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={signOut}
                class="btn-topbar"
              >
                Sign out
              </Button>
            </div>
          </div>
        </header>
        <div class="flex-1 overflow-auto p-4 md:p-8 bg-canvas">
          <PageRouter />
        </div>
      </main>
      <ToastViewport />
      {BUILD_LOG_ENABLED && buildStatus !== 'idle' && (
        <div
          class="fixed bottom-0 inset-x-0 z-50 bg-canvas border-t border-border shadow-2xl transition-all duration-300"
          onMouseEnter={() => {
            if (countdown !== null) {
              hasInteracted.current = true
              clearTimeout(autoCloseRef.current)
              clearInterval(intervalRef.current)
              setCountdown(null)
            }
          }}
        >
          <div class={[
            'flex items-center justify-between px-4 py-3 border-b border-border',
            buildStatus === 'running' && 'bg-surface',
            buildStatus === 'done' && 'bg-success-bg',
            buildStatus === 'error' && 'bg-error-bg',
          ].filter(Boolean).join(' ')}>
            <div class="flex items-center gap-2.5">
              {buildStatus === 'running' && (
                <span class="size-2 rounded-full bg-ink animate-pulse" />
              )}
              {buildStatus === 'done' && (
                <svg class="size-4 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
              {buildStatus === 'error' && (
                <svg class="size-4 text-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              )}
              <span class="font-display text-base text-ink">
                {buildStatus === 'running' && 'Building'}
                {buildStatus === 'done' && 'Build complete'}
                {buildStatus === 'error' && 'Build failed'}
              </span>
            </div>
            <div class="flex items-center gap-3">
              {countdown !== null && (
                <span class="text-xs text-muted transition-opacity duration-300">
                  Closing in {countdown}s
                </span>
              )}
              <button
                type="button"
                onClick={clearBuildStatus}
                class="text-muted hover:text-ink transition-colors p-1 rounded-xs hover:bg-surface"
                aria-label="Close build log"
              >
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div ref={logRef} class="p-4 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-body-muted">
            {buildLog.map((line, i) => (
              <div key={i} class="leading-relaxed">{line}</div>
            ))}
            {buildStatus === 'running' && <span class="animate-pulse">▌</span>}
          </div>
        </div>
      )}
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
