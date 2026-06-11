import { useConfig } from '../../../lib/admin/store'

export function ToastViewport() {
  const { toasts, dismissToast } = useConfig()
  if (toasts.length === 0) return null
  return (
    <div class="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          class={`px-4 py-3 rounded-sm border text-sm font-body transition-all ${
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
              class="text-muted hover:text-ink"
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
