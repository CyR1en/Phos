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
    <div class="space-y-1.5">
      <label class="text-sm font-medium text-ink block">
        {label}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onInput={(e) => setValue(path, (e.currentTarget as HTMLInputElement).value)}
        onBlur={() => flushSave()}
        class="flex h-9.5 w-full rounded-sm border border-border bg-canvas px-3 py-1 text-sm shadow-2xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted hover:border-border-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus focus-visible:border-border-focus disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  )
}
