import { useConfig } from '../../../lib/admin/store'
import { Button } from '../ui/Button'
import { TextAreaField } from './TextAreaField'
import { TextField } from './TextField'
import { ToggleField } from './ToggleField'
import { NumberField } from './NumberField'

interface Props {
  path: string
  label: string
}

export function ArrayField({ path, label }: Props) {
  const { getValue, setValue, flushSave } = useConfig()
  const arr = getValue(path) as unknown[] | undefined
  if (!Array.isArray(arr)) return null

  const isStringArray = arr.length === 0 || arr.every((x) => typeof x === 'string')
  const isObjectArray = arr.length > 0 && typeof arr[0] === 'object'

  const removeAt = (i: number) => {
    const next = arr.filter((_, idx) => idx !== i)
    setValue(path, next)
    flushSave()
  }

  const addItem = () => {
    let template: unknown = ''
    if (isObjectArray && arr.length > 0) {
      template = JSON.parse(JSON.stringify(arr[0]))
      for (const k of Object.keys(template as object)) {
        ;(template as Record<string, unknown>)[k] = ''
      }
    }
    setValue(path, [...arr, template])
  }

  return (
    <div class="border-t border-border pt-6 mt-6 space-y-4">
      <div class="flex items-center justify-between">
        <span class="text-sm font-semibold text-ink uppercase tracking-wider font-mono">
          {label}
        </span>
        <Button variant="secondary" size="sm" onClick={addItem}>
          <svg class="size-3.5 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Item
        </Button>
      </div>
      <div class="space-y-4">
        {arr.map((item, i) => {
          const itemObj = item as any
          const stableKey = `${path}-${i}-${(itemObj?.id || itemObj?.slug || itemObj?.platform || (itemObj ? JSON.stringify(itemObj).slice(0, 20) : '') || i)}`
          return (
            <div
              key={stableKey}
              class="border border-border rounded-sm p-5 bg-surface/30 shadow-2xs relative group/item"
            >
              <div class="flex items-center justify-between border-b border-border-light pb-3 mb-4">
                <span class="text-xs font-mono font-medium text-muted">
                  Item #{i + 1}
                </span>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => removeAt(i)}
                  class="opacity-90 group-hover/item:opacity-100 transition-opacity"
                >
                  <svg class="size-3.5 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  Remove
                </Button>
              </div>
              {typeof item === 'string' ? (
                <TextAreaField
                  path={`${path}.${i}`}
                  label=""
                  rows={2}
                />
              ) : isObjectArray && item && typeof item === 'object' ? (
                <div class="space-y-4">
                  {Object.entries(item as Record<string, unknown>).map(
                    ([k, v]) => {
                      const subPath = `${path}.${i}.${k}`
                      const subLabel = k
                        .replace(/_/g, ' ')
                        .replace(/\b\w/g, (c) => c.toUpperCase())
                      if (k.startsWith('toggle_') || typeof v === 'boolean') {
                        return (
                          <ToggleField
                            key={subPath}
                            path={subPath}
                            label={subLabel}
                          />
                        )
                      }
                      if (typeof v === 'number') {
                        return (
                          <NumberField
                            key={subPath}
                            path={subPath}
                            label={subLabel}
                          />
                        )
                      }
                      if (typeof v === 'string' && (v.length > 80 || v.includes('\n'))) {
                        return (
                          <TextAreaField
                            key={subPath}
                            path={subPath}
                            label={subLabel}
                          />
                        )
                      }
                      return (
                        <TextField
                          key={subPath}
                          path={subPath}
                          label={subLabel}
                        />
                      )
                    },
                  )}
                </div>
              ) : null}
            </div>
          )
        })}
        {arr.length === 0 && (
          <div class="border border-dashed border-border rounded-sm p-8 text-center bg-surface/10">
            <p class="text-sm text-muted italic">
              No items. Click Add Item to create one.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
