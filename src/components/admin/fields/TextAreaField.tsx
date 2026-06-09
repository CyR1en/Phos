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
      <label class="block text-phos-caption font-medium text-phos-body-muted mb-1.5">
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
        class="w-full px-3 py-2 bg-phos-canvas border border-phos-hairline rounded-phos-xs text-phos-body font-body resize-y focus:outline-none focus:border-phos-form-focus focus:ring-2 focus:ring-phos-form-focus/20"
      />
      {maxWords && (
        <p class="mt-1 text-xs text-phos-body-muted/60">
          {wordCount}/{maxWords} words
        </p>
      )}
    </div>
  )
}
