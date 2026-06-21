import { useConfig } from '../../../lib/admin/store'
import { Button } from '../ui/Button'

interface Props {
  path: string
  label: string
  options: Array<{ value: string; label: string }>
}

export function SelectField({ path, label, options }: Props) {
  const { getValue, setValue, flushSave } = useConfig()
  const value = (getValue(path) as string | undefined) ?? ''
  const inputId = path.replace(/\./g, '-')
  return (
    <div class="space-y-1.5">
      {label && (
        <label for={inputId} class="text-sm font-medium text-ink block">
          {label}
        </label>
      )}
      <div class="relative">
        <select
          id={inputId}
          value={value}
          onChange={(e) => {
            setValue(path, (e.currentTarget as HTMLSelectElement).value)
            flushSave()
          }}
          class="flex h-9.5 w-full rounded-sm border border-border bg-canvas px-3 py-1 text-sm shadow-2xs transition-colors hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:border-border-focus cursor-pointer appearance-none pr-8 text-ink"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-muted">
          <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>
    </div>
  )
}

export function RangeField({
  path,
  label,
  min = 0,
  max = 5,
}: {
  path: string
  label: string
  min?: number
  max?: number
}) {
  const { getValue, setValue, flushSave } = useConfig()
  const v = getValue(path)
  const value = typeof v === 'number' ? v : 0
  const inputId = path.replace(/\./g, '-')
  return (
    <div class="space-y-1.5">
      <label for={inputId} class="text-sm font-medium text-ink block">
        {label}
      </label>
      <div class="flex items-center gap-4 bg-surface border border-border rounded-sm p-3 shadow-2xs">
        <input
          id={inputId}
          type="range"
          min={min}
          max={max}
          value={value}
          onInput={(e) => {
            setValue(
              path,
              Number((e.currentTarget as HTMLInputElement).value),
            )
          }}
          onBlur={() => flushSave()}
          class="flex-1 accent-primary cursor-pointer h-1.5 bg-border rounded-lg appearance-none"
        />
        <span class="text-sm font-mono font-medium text-ink w-8 text-center bg-canvas border border-border rounded-sm py-0.5 px-1 shadow-2xs tabular-nums">
          {value}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setValue(path, 0)
            flushSave()
          }}
        >
          Reset
        </Button>
      </div>
    </div>
  )
}
