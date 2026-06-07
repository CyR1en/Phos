import { useConfig } from '../../../lib/admin/store'

interface Props {
  path: string
  label: string
  placeholder?: string
  type?: 'text' | 'url' | 'email'
}

export function TextField({ path, label, placeholder, type = 'text' }: Props) {
  const { getValue, setValue, flushSave } = useConfig()
  const value = (getValue(path) as string | undefined) ?? ''
  return (
    <div>
      <label class="block text-phos-caption font-medium text-phos-body-muted mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onInput={(e) => setValue(path, (e.currentTarget as HTMLInputElement).value)}
        onBlur={() => flushSave()}
        class="w-full px-3 py-2 bg-phos-canvas border border-phos-hairline rounded-phos-xs text-phos-body font-body focus:outline-none focus:border-phos-form-focus focus:ring-2 focus:ring-phos-form-focus/20"
      />
    </div>
  )
}
