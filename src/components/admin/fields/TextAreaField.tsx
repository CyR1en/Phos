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
    <div>
      <label class="block text-sm font-medium text-body-muted mb-1.5">
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
        class={`w-full px-3 py-2 bg-canvas border rounded-xs text-base font-body resize-y focus:outline-none focus:ring-2 ${
          isOverLimit
            ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
            : 'border-border focus:border-border-focus focus:ring-border-focus/20'
        }`}
      />
      {maxWords && (
        <p class={`mt-1 text-xs ${isOverLimit ? 'text-red-500 font-semibold' : 'text-body-muted/60'}`}>
          {wordCount}/{maxWords} words
        </p>
      )}
    </div>
  )
}
