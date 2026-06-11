interface Props {
  children: string
  active?: boolean
  onClick?: () => void
}

export function Chip({ children, active, onClick }: Props) {
  const base =
    'inline-flex items-center px-3.5 py-2 font-display text-xl font-display rounded-pill border transition-colors'
  const cls = active
    ? `${base} bg-primary text-primary-text border-primary`
    : `${base} bg-canvas text-primary border-primary hover:bg-surface`
  if (onClick) {
    return (
      <button type="button" class={cls} onClick={onClick}>
        {children}
      </button>
    )
  }
  return <span class={cls}>{children}</span>
}
