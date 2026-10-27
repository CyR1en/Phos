import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import { Eye, EyeOff } from 'lucide-preact'
import { useConfig } from '../../../lib/admin/store'

interface Props extends Omit<JSX.IntrinsicElements['input'], 'type' | 'value' | 'onInput' | 'onBlur'> {
  path: string
  label: string
  placeholder?: string
  type?: 'text' | 'url' | 'email' | 'password'
  autocomplete?: string
}

export function TextField({ path, label, placeholder, type: fieldType = 'text', autocomplete, ...inputAttributes }: Props) {
  const { getValue, setValue, flushSave } = useConfig()
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = fieldType === 'password'
  const type = isPassword && showPassword ? 'text' : fieldType
  const value = (getValue(path) as string | undefined) ?? ''
  const inputId = path.replace(/\./g, '-')
  return (
    <div class="space-y-1.5">
      <label for={inputId} class="text-sm font-medium text-ink block">
        {label}
      </label>
      <div class="relative">
        <input
          {...inputAttributes}
          id={inputId}
          type={type}
          autocomplete={autocomplete}
          value={value}
          placeholder={placeholder}
          onInput={(e) => setValue(path, (e.currentTarget as HTMLInputElement).value)}
          onBlur={() => flushSave()}
          class={`flex h-9.5 w-full rounded-sm border border-border bg-canvas px-3 py-1 text-sm shadow-2xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:border-border-focus disabled:cursor-not-allowed disabled:opacity-50${isPassword ? ' pr-11' : ''}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            aria-controls={inputId}
            class="absolute right-0 top-0 h-9.5 w-10 flex items-center justify-center text-muted hover:text-ink rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            {showPassword ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}
          </button>
        )}
      </div>
    </div>
  )
}
