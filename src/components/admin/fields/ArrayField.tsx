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

  const isStringArray = arr.every((x) => typeof x === 'string') || arr.length === 0 && typeof arr[0] === 'string'
  const isObjectArray = arr.length > 0 && typeof arr[0] === 'object'

  const updateAt = (i: number, v: unknown) => {
    const next = arr.map((x, idx) => (idx === i ? v : x))
    setValue(path, next)
  }

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
    <div class="border-t border-border pt-4 mt-4">
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm font-medium text-ink font-mono uppercase tracking-wider">
          {label}
        </span>
        <Button variant="secondary" size="sm" onClick={addItem}>
          + Add item
        </Button>
      </div>
      <div class="space-y-3">
        {arr.map((item, i) => (
          <div
            key={i}
            class="border border-border-light rounded-sm p-4 bg-canvas"
          >
            <div class="flex items-center justify-between mb-3">
              <span class="text-sm font-mono text-muted">
                #{i + 1}
              </span>
              <Button
                variant="danger"
                size="sm"
                onClick={() => removeAt(i)}
              >
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
              <div class="space-y-3">
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
        ))}
        {arr.length === 0 && (
          <p class="text-sm text-muted italic">
            No items. Click + Add item to create one.
          </p>
        )}
      </div>
    </div>
  )
}
