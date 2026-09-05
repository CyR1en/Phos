import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useRef, useState, useCallback } from 'preact/hooks'
import { lazy, Suspense } from 'preact/compat'
import { AuthGate } from './AuthGate'
import { Sidebar } from './Sidebar'
import { useLocalStorageState } from '../../lib/admin/useLocalStorageState'
import { PreviewPanel } from './PreviewPanel'
import { SaveIndicator } from './SaveIndicator'
import { ToastViewport } from './ui/Toast'
import { Tooltip } from './ui/Tooltip'
import { ThemeToggle } from './ui/ThemeToggle'
import { SaveIcon, RepublishPhotosIcon, RepublishSiteIcon, SignOutIcon, SpinnerIcon } from './ui/Icons'
import { ConfigProvider, useConfig } from '../../lib/admin/store'
import { ErrorBoundary } from './ErrorBoundary'
import { Menu, Monitor } from 'lucide-preact'
import { LoadingState } from './ui/LoadingState'

const PAGE_LABELS: Record<string, string> = {
  site: 'Site', home: 'Home', about: 'About', contact: 'Contact', notFound: '404',
  categories: 'Categories', galleries: 'Galleries', plugins: 'Plugins',
}

const SitePage = lazy(() => import('./pages/SitePage').then(m => ({ default: m.SitePage })))
const HomePage = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })))
const AboutPage = lazy(() => import('./pages/AboutPage').then(m => ({ default: m.AboutPage })))
const ContactPage = lazy(() => import('./pages/ContactPage').then(m => ({ default: m.ContactPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })))
const CategoriesPage = lazy(() => import('./pages/CategoriesPage').then(m => ({ default: m.CategoriesPage })))
const GalleriesPage = lazy(() => import('./pages/GalleriesPage').then(m => ({ default: m.GalleriesPage })))
const PluginsPage = lazy(() => import('./pages/PluginsPage').then(m => ({ default: m.PluginsPage })))

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
  return (
    <Suspense fallback={<LoadingState />}>
      {(() => {
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
      })()}
    </Suspense>
  )
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
  const mainRef = useRef<HTMLElement>(null)

  const [sidebarWidth, setSidebarWidth] = useLocalStorageState('admin.sidebar.width', 256)
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorageState('admin.sidebar.collapsed', false)
  const [previewVisible, setPreviewVisible] = useLocalStorageState('admin.preview.visible', true)
  const [previewWidth, setPreviewWidth] = useLocalStorageState('admin.preview.width', 480)
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth)
  const previewAvailable = viewportWidth >= 1280
  const effectivePreviewWidth = Math.min(previewWidth, viewportWidth - (sidebarCollapsed ? 56 : sidebarWidth) - 544)

  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useEffect(() => {
    if (!sidebarCollapsed && sidebarWidth <= 200) {
      setSidebarWidth(256)
    }
  }, [])

  const handleSidebarResize = useCallback((newWidth: number) => {
    if (newWidth <= 200) {
      setSidebarCollapsed(true)
    } else {
      setSidebarWidth(newWidth)
      setSidebarCollapsed(false)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        flushSave()?.catch(() => {})
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
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [currentPage])

  if (!token) return <AuthGate />

  const onRepublish = async () => { await republish() }
  const onRegenerate = async () => { await regenerate() }

  const running = buildStatus === 'running'
  const showConfigButtons = currentPage !== 'categories'

  return (
    <div
      class="admin-shell bg-canvas flex"
      style={{
        '--sidebar-width': `${sidebarCollapsed ? 56 : sidebarWidth}px`,
        '--preview-width': `${previewVisible && previewAvailable ? effectivePreviewWidth : 0}px`,
      } as any}
    >
      <Sidebar
        width={sidebarWidth}
        collapsed={sidebarCollapsed}
        setWidth={handleSidebarResize}
        setCollapsed={setSidebarCollapsed}
      />
      <main ref={mainRef} id="admin-main" class="flex-1 flex flex-col min-w-0 overflow-y-auto overflow-x-hidden md:ml-[var(--sidebar-width)] md:mr-[var(--preview-width)]">
        <header class="admin-toolbar fixed top-0 left-0 md:left-[var(--sidebar-width)] right-0 md:right-[var(--preview-width)] z-40 h-[calc(4rem+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] border-b border-border box-border text-ink">
          <div class="admin-toolbar-inner h-full px-4 md:px-8 flex items-center">
            <span class="admin-toolbar-title">{PAGE_LABELS[currentPage]}</span>
            <button
              type="button"
              data-hs-overlay="#admin-sidebar"
              class="md:hidden flex h-11 w-11 items-center justify-center rounded-sm text-muted hover:text-ink hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              aria-label="Open menu"
            >
              <Menu size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
            <div class="admin-toolbar-actions flex items-center gap-1 sm:gap-2 overflow-x-auto max-w-full scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <style>{`
                .scrollbar-hide::-webkit-scrollbar {
                  display: none;
                }
              `}</style>
              <SaveIndicator />
              {showConfigButtons ? (
                <Tooltip text="Save changes" shortcut="⌘S">
                  <button
                    type="button"
                    onClick={() => flushSave()}
                    class="flex h-11 w-11 items-center justify-center rounded-sm text-muted hover:text-ink hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    aria-label="Save"
                  >
                    <SaveIcon />
                  </button>
                </Tooltip>
              ) : null}
              <Tooltip text="Republish photos">
                <button
                  type="button"
                  onClick={onRegenerate}
                  disabled={running}
                  class="flex h-11 w-11 items-center justify-center rounded-sm text-muted hover:text-ink hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  aria-label="Republish photos"
                >
                  {running ? <SpinnerIcon /> : <RepublishPhotosIcon />}
                </button>
              </Tooltip>
              <Tooltip text="Republish site">
                <button
                  type="button"
                  onClick={onRepublish}
                  disabled={running}
                  class="flex h-11 w-11 items-center justify-center rounded-sm text-muted hover:text-ink hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  aria-label="Republish site"
                  data-publish-button
                >
                  {running ? <SpinnerIcon /> : <RepublishSiteIcon />}
                  <span class="publish-label">Publish</span>
                </button>
              </Tooltip>
              <div class="w-px h-4 bg-border mx-1" />
              <div class="hidden xl:block">
                <Tooltip text="Toggle preview">
                  <button
                    type="button"
                    onClick={() => setPreviewVisible(!previewVisible)}
                    class={`flex h-11 w-11 items-center justify-center rounded-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
                      previewVisible ? 'text-ink bg-surface-hover' : 'text-muted hover:text-ink hover:bg-surface-hover'
                    }`}
                    aria-label="Toggle preview"
                  >
                    <Monitor size={18} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </Tooltip>
              </div>
              <ThemeToggle />
              <Tooltip text="Sign out">
                <button
                  type="button"
                  onClick={signOut}
                  class="flex h-11 w-11 items-center justify-center rounded-sm text-muted hover:text-ink hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  aria-label="Sign out"
                >
                  <SignOutIcon />
                </button>
              </Tooltip>
            </div>
          </div>
        </header>
        <div class="admin-content flex-1 bg-canvas">
          <PageRouter />
        </div>
      </main>
      <PreviewPanel
        visible={previewVisible && previewAvailable}
        onClose={() => setPreviewVisible(false)}
        width={effectivePreviewWidth}
        onResize={setPreviewWidth}
        sidebarWidth={sidebarWidth}
        sidebarCollapsed={sidebarCollapsed}
      />
      <ToastViewport />
       {BUILD_LOG_ENABLED && buildStatus !== 'idle' && (
        <div
          class="fixed bottom-0 inset-x-0 z-[70] bg-surface border-t border-border shadow-2xl transition-all duration-300 pb-[env(safe-area-inset-bottom,0px)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          tabIndex={0}
          onMouseEnter={() => {
            if (countdown !== null) {
              hasInteracted.current = true
              clearTimeout(autoCloseRef.current)
              clearInterval(intervalRef.current)
              setCountdown(null)
            }
          }}
          onFocus={() => {
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
            buildStatus === 'running' && 'bg-surface text-ink',
            buildStatus === 'done' && 'bg-success-bg/10 text-success border-b-success/20',
            buildStatus === 'error' && 'bg-error-bg/10 text-error border-b-error/20',
          ].filter(Boolean).join(' ')}>
            <div class="flex items-center gap-2.5">
              {buildStatus === 'running' && (
                <span class="size-2 rounded-full bg-primary animate-pulse" />
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
              <span class="text-sm font-medium text-ink" role="status" aria-live="polite">
                {buildStatus === 'running' && 'Building...'}
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
                class="text-muted hover:text-ink transition-colors h-11 w-11 flex items-center justify-center rounded-xs hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                aria-label="Close build log"
              >
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div ref={logRef} class="p-4 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted bg-canvas/40">
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
      {(<ConfigProvider>
        <ErrorBoundary>
          <DashboardBody />
        </ErrorBoundary>
      </ConfigProvider>) as any}
    </QueryClientProvider>
  )
}
