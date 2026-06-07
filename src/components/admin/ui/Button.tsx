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
  sm: 'text-phos-caption px-3 py-1.5',
  md: 'text-phos-button px-5 py-2.5',
}

const variants: Record<Variant, string> = {
  primary:
    'bg-phos-button text-phos-on-button rounded-phos-pill hover:bg-phos-button-hover',
  secondary:
    'bg-phos-stone text-phos-ink rounded-phos-sm hover:bg-phos-hairline',
  danger:
    'bg-phos-coral text-phos-on-primary rounded-phos-sm hover:opacity-90',
  ghost:
    'bg-transparent text-phos-ink rounded-phos-sm underline-offset-2 hover:underline',
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
