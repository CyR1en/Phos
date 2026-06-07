import { useConfig } from '../../lib/admin/store'

const LABEL: Record<string, string> = {
  idle: '',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'All changes saved',
  error: 'Save failed',
}

export function SaveIndicator() {
  const { saveStatus } = useConfig()
  const label = LABEL[saveStatus]
  if (!label) return null
  const color =
    saveStatus === 'saving'
      ? 'text-phos-action-blue'
      : saveStatus === 'saved'
        ? 'text-phos-primary'
        : saveStatus === 'error'
          ? 'text-phos-error'
          : 'text-phos-muted'
  return (
    <span
      class={`text-phos-micro font-mono uppercase tracking-wider ${color} transition-colors`}
    >
      {label}
    </span>
  )
}
