import { useConfig } from '../../../lib/admin/store'

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

interface Props {
  path: string
  label: string
  rows?: number
  maxWords?: number
}

export function TextAreaField({ path, label, rows = 4, maxWords }: Props) {
  const { getValue, setValue, flushSave } = useConfig()
  const value = (getValue(path) as string | undefined) ?? ''
  const wordCount = countWords(value)

  return (
    <div>
      <label class="block text-sm font-medium text-body-muted mb-1.5">
        {label}
      </label>
      <textarea
        rows={rows}
        value={value}
        onInput={(e) => {
          let val = (e.currentTarget as HTMLTextAreaElement).value
          if (maxWords) {
            const words = val.split(/\s+/).filter(Boolean)
            if (words.length > maxWords) {
              val = words.slice(0, maxWords).join(' ')
            }
          }
          setValue(path, val)
        }}
        onBlur={() => flushSave()}
        class="w-full px-3 py-2 bg-canvas border border-border rounded-xs text-base font-body resize-y focus:outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/20"
      />
      {maxWords && (
        <p class="mt-1 text-xs text-body-muted/60">
          {wordCount}/{maxWords} words
        </p>
      )}
    </div>
  )
}
