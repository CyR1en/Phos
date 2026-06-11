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
      <label class="block text-sm font-medium text-body-muted mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onInput={(e) => setValue(path, (e.currentTarget as HTMLInputElement).value)}
        onBlur={() => flushSave()}
        class="w-full px-3 py-2 bg-canvas border border-border rounded-xs text-base font-body focus:outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
      />
    </div>
  )
}
