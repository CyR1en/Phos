import type { JSX, ComponentChildren } from 'preact'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface Props extends Omit<JSX.HTMLAttributes<HTMLButtonElement>, 'size'> {
  variant?: Variant
  size?: 'sm' | 'md'
  children?: ComponentChildren
  type?: 'submit' | 'button' | 'reset'
  disabled?: boolean
}

const base =
  'inline-flex items-center justify-center font-body font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus disabled:opacity-50 disabled:cursor-not-allowed select-none cursor-pointer'

const sizes: Record<NonNullable<Props['size']>, string> = {
  sm: 'text-xs h-8 px-3 rounded-sm',
  md: 'text-sm h-9.5 px-4 rounded-sm',
}

const variants: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-text hover:bg-primary-hover shadow-xs active:scale-[0.98]',
  secondary:
    'bg-surface border border-border text-ink hover:bg-surface-hover hover:border-border-hover shadow-2xs active:scale-[0.98]',
  danger:
    'bg-error text-primary-text hover:opacity-90 shadow-xs active:scale-[0.98]',
  ghost:
    'bg-transparent text-muted hover:bg-surface hover:text-ink',
}

export function Button({
  variant = 'primary',
  size = 'md',
  class: className,
  className: cn,
  children,
  ...rest
}: Props) {
  const cls = `${base} ${sizes[size]} ${variants[variant]} ${className ?? ''} ${cn ?? ''}`
  return (
    <button class={cls.trim()} {...rest}>
      {children}
    </button>
  )
}
