import { useConfig } from '../../../lib/admin/store'

interface Props {
  path: string
  label: string
  min?: number
  max?: number
}

export function NumberField({ path, label, min, max }: Props) {
  const { getValue, setValue, flushSave } = useConfig()
  const value = getValue(path)
  return (
    <div class="space-y-1.5">
      <label class="text-sm font-medium text-ink block">
        {label}
      </label>
      <input
        type="number"
        value={value === undefined || value === null ? '' : String(value)}
        min={min}
        max={max}
        onInput={(e) => {
          const v = (e.currentTarget as HTMLInputElement).value
          setValue(path, v === '' ? null : Number(v))
        }}
        onBlur={() => flushSave()}
        class="flex h-9.5 w-full rounded-sm border border-border bg-canvas px-3 py-1 text-sm shadow-2xs transition-colors placeholder:text-muted hover:border-border-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus focus-visible:border-border-focus disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  )
}
