import { useConfig } from '../../../lib/admin/store'

export function ToastViewport() {
  const { toasts, dismissToast } = useConfig()
  if (toasts.length === 0) return null
  return (
    <div class="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          class={`px-4 py-3 rounded-phos-sm border text-phos-caption font-body transition-all ${
            t.kind === 'error'
              ? 'bg-phos-canvas border-phos-error text-phos-error'
              : t.kind === 'success'
                ? 'bg-phos-canvas border-phos-primary text-phos-primary'
                : 'bg-phos-canvas border-phos-hairline text-phos-ink'
          }`}
        >
          <div class="flex items-start justify-between gap-3">
            <span>{t.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              class="text-phos-muted hover:text-phos-ink"
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
