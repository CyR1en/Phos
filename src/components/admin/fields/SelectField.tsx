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
  return (
    <div>
      <label class="block text-sm font-medium text-body-muted mb-1.5">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => {
          setValue(path, (e.currentTarget as HTMLSelectElement).value)
          flushSave()
        }}
        class="w-full px-3 py-2 bg-canvas border border-border rounded-xs text-base font-body cursor-pointer focus:outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
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
  return (
    <div>
      <label class="block text-sm font-medium text-body-muted mb-1.5">
        {label}
      </label>
      <div class="flex items-center gap-3">
        <input
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
          class="flex-1 accent-primary"
        />
        <span class="text-sm text-body-muted w-8 text-center font-mono">
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
          reset
        </Button>
      </div>
    </div>
  )
}
