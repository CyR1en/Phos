import type { ComponentChildren } from 'preact'

interface Props {
  text: string
  shortcut?: string
  children: ComponentChildren
}

export function Tooltip({ text, shortcut, children }: Props) {
  return (
    <div class="group/tooltip relative">
      {children}
      <span class="pointer-events-none absolute top-full mt-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-ink px-2 py-1 text-xs text-primary-text opacity-0 transition-opacity group-hover/tooltip:opacity-100 hidden sm:block">
        {text}
        {shortcut && <span class="ml-1.5 opacity-60">{shortcut}</span>}
      </span>
    </div>
  )
}
