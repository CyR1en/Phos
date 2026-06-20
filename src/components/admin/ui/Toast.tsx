import { useConfig } from '../../../lib/admin/store'

export function ToastViewport() {
  const { toasts, dismissToast } = useConfig()
  if (toasts.length === 0) return null

  // Limit rendered toasts to a maximum of 3 at a time
  const visibleToasts = toasts.slice(-3)

  return (
    <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full sm:w-80 pointer-events-none">
      {visibleToasts.map((t) => {
        let toastClasses = 'bg-surface text-ink border-border'
        let icon = null

        if (t.kind === 'error') {
          toastClasses = 'bg-surface border-error text-error'
          icon = (
            <svg class="size-4 text-error flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )
        } else if (t.kind === 'success') {
          toastClasses = 'bg-surface border-success text-success'
          icon = (
            <svg class="size-4 text-success flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )
        } else {
          icon = (
            <svg class="size-4 text-muted flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          )
        }

        return (
          <div
            key={t.id}
            class={`pointer-events-auto px-4 py-3 rounded-sm border text-sm font-body shadow-lg flex items-start justify-between gap-3 transition-all duration-300 ${
              t.exiting ? 'animate-toast-out' : 'animate-toast-in'
            } ${toastClasses}`}
          >
            <div class="flex items-center gap-2.5 min-w-0">
              {icon}
              <span class="font-medium truncate block">{t.message}</span>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              class="text-muted hover:text-ink flex-shrink-0 transition-colors p-0.5 rounded-xs hover:bg-surface-hover"
              aria-label="Dismiss"
            >
              <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}
