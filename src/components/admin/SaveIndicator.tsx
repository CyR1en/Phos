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
      ? 'text-info'
      : saveStatus === 'saved'
        ? 'text-primary'
        : saveStatus === 'error'
          ? 'text-error'
          : 'text-muted'
  return (
    <span
      class={`text-xs font-mono uppercase tracking-wider ${color} transition-colors`}
    >
      {label}
    </span>
  )
}
