export function LoadingState({ label = 'Loading settings' }: { label?: string }) {
  return (
    <div class="admin-loading" role="status" aria-label={label}>
      <div aria-hidden="true" /><div aria-hidden="true" /><div aria-hidden="true" />
      <span class="sr-only">{label}</span>
    </div>
  )
}
