import type { JSX, ComponentChildren } from 'preact'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface Props extends Omit<JSX.HTMLAttributes<HTMLButtonElement>, 'size'> {
  variant?: Variant
  size?: 'sm' | 'md'
  children: ComponentChildren
}

const base =
  'inline-flex items-center justify-center font-body font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

const sizes: Record<NonNullable<Props['size']>, string> = {
  sm: 'text-sm px-3 py-1.5',
  md: 'text-sm font-medium px-5 py-2.5',
}

const variants: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-text rounded-pill hover:bg-primary-hover',
  secondary:
    'bg-surface text-ink rounded-sm hover:bg-border',
  danger:
    'bg-accent text-primary-text rounded-sm hover:opacity-90',
  ghost:
    'bg-transparent text-ink rounded-sm underline-offset-2 hover:underline',
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
