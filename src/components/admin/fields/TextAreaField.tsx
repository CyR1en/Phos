import { useEffect } from 'preact/hooks'
import { useConfig } from '../../../lib/admin/store'

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

interface Props {
  path: string
  label: string
  rows?: number
  maxWords?: number
}

export function TextAreaField({ path, label, rows = 4, maxWords }: Props) {
  const { getValue, setValue, flushSave, setError } = useConfig()
  const value = (getValue(path) as string | undefined) ?? ''
  const wordCount = countWords(value)
  const isOverLimit = maxWords ? wordCount > maxWords : false

  useEffect(() => {
    if (maxWords && setError) {
      setError(path, isOverLimit)
    }
    return () => {
      if (maxWords && setError) {
        setError(path, false)
      }
    }
  }, [path, isOverLimit, maxWords, setError])

  return (
    <div class="space-y-1.5">
      <label class="text-sm font-medium text-ink block">
        {label}
      </label>
      <textarea
        rows={rows}
        value={value}
        onInput={(e) => {
          const val = (e.currentTarget as HTMLTextAreaElement).value
          setValue(path, val)
        }}
        onBlur={() => {
          if (!isOverLimit) {
            flushSave()?.catch(() => {})
          }
        }}
        class={`flex min-h-[60px] w-full rounded-sm border bg-canvas px-3 py-2 text-sm shadow-2xs transition-colors placeholder:text-muted hover:border-border-hover focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50 resize-y ${
          isOverLimit
            ? 'border-error focus-visible:ring-error focus-visible:border-error'
            : 'border-border focus-visible:ring-border-focus focus-visible:border-border-focus'
        }`}
      />
      {maxWords && (
        <div class="flex justify-end">
          <p class={`text-xs ${isOverLimit ? 'text-error font-semibold' : 'text-muted'}`}>
            {wordCount} / {maxWords} words
          </p>
        </div>
      )}
    </div>
  )
}
