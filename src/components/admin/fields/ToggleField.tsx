import { useConfig } from '../../../lib/admin/store'
import { Toggle } from '../ui/Toggle'

interface Props {
  path: string
  label: string
}

export function ToggleField({ path, label }: Props) {
  const { getValue, setValue, flushSave } = useConfig()
  const value = !!getValue(path)
  return (
    <div class="flex items-center justify-between">
      <span class="text-sm text-ink">{label}</span>
      <Toggle
        checked={value}
        onChange={(v) => {
          setValue(path, v)
          flushSave()
        }}
      />
    </div>
  )
}
