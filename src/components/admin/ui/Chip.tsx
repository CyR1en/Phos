import type { ComponentChildren } from 'preact'

interface Props {
  children?: ComponentChildren
  active?: boolean
  onClick?: () => void
}

export function Chip({ children, active, onClick }: Props) {
  const base =
    'inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-sm border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus'
  const cls = active
    ? `${base} bg-primary text-primary-text border-primary shadow-xs`
    : `${base} bg-surface text-ink border-border hover:bg-surface-hover hover:border-border-hover`
  if (onClick) {
    return (
      <button type="button" class={cls} onClick={onClick}>
        {children}
      </button>
    )
  }
  return <span class={cls}>{children}</span>
}
