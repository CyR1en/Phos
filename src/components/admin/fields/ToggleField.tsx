import { useConfig } from '../../../lib/admin/store'
import { Toggle } from '../ui/Toggle'

interface Props {
  path: string
  label: string
}

export function ToggleField({ path, label }: Props) {
  const { getValue, setValue, flushSave } = useConfig()
  const value = !!getValue(path)
  const inputId = path.replace(/\./g, '-')
  return (
    <div class="flex items-center justify-between py-2.5">
      <label for={inputId} class="text-sm font-medium text-ink">{label}</label>
      <Toggle
        id={inputId}
        checked={value}
        onChange={(v) => {
          setValue(path, v)
          flushSave()
        }}
      />
    </div>
  )
}
