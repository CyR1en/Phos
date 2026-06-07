interface Props {
  children: string
  active?: boolean
  onClick?: () => void
}

export function Chip({ children, active, onClick }: Props) {
  const base =
    'inline-flex items-center px-3.5 py-2 text-phos-feature font-display rounded-phos-pill border transition-colors'
  const cls = active
    ? `${base} bg-phos-button text-phos-on-button border-phos-button`
    : `${base} bg-phos-canvas text-phos-primary border-phos-primary hover:bg-phos-stone`
  if (onClick) {
    return (
      <button type="button" class={cls} onClick={onClick}>
        {children}
      </button>
    )
  }
  return <span class={cls}>{children}</span>
}
