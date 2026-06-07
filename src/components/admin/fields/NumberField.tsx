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
      <label class="block text-phos-caption font-medium text-phos-body-muted mb-1.5">
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
        class="w-full px-3 py-2 bg-phos-canvas border border-phos-hairline rounded-phos-xs text-phos-body font-body focus:outline-none focus:border-phos-form-focus focus:ring-2 focus:ring-phos-form-focus/20"
      />
    </div>
  )
}
