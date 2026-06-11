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
    <div>
      <label class="block text-sm font-medium text-body-muted mb-1.5">
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
        class="w-full px-3 py-2 bg-canvas border border-border rounded-xs text-base font-body focus:outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
      />
    </div>
  )
}
