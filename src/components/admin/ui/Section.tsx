import type { ComponentChildren } from 'preact'

interface Props {
  title?: string
  description?: string
  children?: ComponentChildren
  class?: string
  bare?: boolean
  footer?: ComponentChildren
}

export function Section({ title, description, children, class: cls, bare, footer }: Props) {
  if (bare) {
    return <section class={cls ?? ''}>{children}</section>
  }

  return (
    <section
      class={`bg-surface border border-border rounded-sm shadow-2xs flex flex-col overflow-hidden ${cls ?? ''}`}
    >
      <div class="p-6 flex-1 flex flex-col">
        {(title || description) && (
          <div class="flex flex-col space-y-1.5 mb-6">
            {title && (
              <h3 class="font-display text-xl font-semibold leading-tight tracking-tight text-ink">
                {title}
              </h3>
            )}
            {description && (
              <p class="text-sm text-body-muted leading-relaxed mt-1">
                {description}
              </p>
            )}
          </div>
        )}
        <div class="space-y-6 flex-1">{children}</div>
      </div>
      {footer && (
        <div class="flex items-center px-6 py-4 border-t border-border-light bg-surface/50">
          {footer}
        </div>
      )}
    </section>
  )
}
