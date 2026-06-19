import { useConfig } from '../../../lib/admin/store'

export function ToastViewport() {
  const { toasts, dismissToast } = useConfig()
  if (toasts.length === 0) return null

  // Limit rendered toasts to a maximum of 3 at a time
  const visibleToasts = toasts.slice(-3)

  return (
    <div class="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full sm:w-80 pointer-events-none">
      {visibleToasts.map((t) => (
        <div
          key={t.id}
          class={`pointer-events-auto px-4 py-3 rounded-sm border text-sm font-body shadow-md ${
            t.exiting ? 'animate-toast-out' : 'animate-toast-in'
          } ${
            t.kind === 'error'
              ? 'bg-canvas border-error text-error'
              : t.kind === 'success'
                ? 'bg-canvas border-primary text-primary'
                : 'bg-canvas border-border text-ink'
          }`}
        >
          <div class="flex items-start justify-between gap-3">
            <span>{t.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              class="text-muted hover:text-ink flex-shrink-0"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
