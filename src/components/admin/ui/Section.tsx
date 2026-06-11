import type { ComponentChildren } from 'preact'

interface Props {
  title?: string
  description?: string
  children: ComponentChildren
  class?: string
  bare?: boolean
}

export function Section({ title, description, children, class: cls, bare }: Props) {
  return (
    <section
      class={
        bare
          ? cls ?? ''
          : `bg-surface border border-border-light rounded-md p-6 ${cls ?? ''}`
      }
    >
      {title && (
        <h3 class="font-display font-display text-xl text-ink mb-1">
          {title}
        </h3>
      )}
      {description && (
        <p class="text-sm text-muted mb-4">{description}</p>
      )}
      <div class="space-y-4">{children}</div>
    </section>
  )
}
