import { useConfig } from '../../../lib/admin/store'
import { TextField } from './TextField'
import { TextAreaField } from './TextAreaField'
import { ToggleField } from './ToggleField'
import { NumberField } from './NumberField'
import { ArrayField } from './ArrayField'
import { Section } from '../ui/Section'

interface Props {
  path: string
}

function prettify(key: string): string {
  return key
    .replace(/^toggle_/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

const SKIP_KEYS = new Set(['page_description'])

export function ObjectField({ path }: Props) {
  const { getValue } = useConfig()
  const data = getValue(path) as Record<string, unknown> | undefined
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null

  return (
    <>
      {Object.entries(data).map(([key, value]) => {
        if (SKIP_KEYS.has(key)) return null
        const fieldPath = `${path}.${key}`
        const label = prettify(key)

        if (Array.isArray(value)) {
          return <ArrayField key={fieldPath} path={fieldPath} label={label} />
        }
        if (value && typeof value === 'object') {
          return (
            <Section key={fieldPath} title={label}>
              <ObjectField path={fieldPath} />
            </Section>
          )
        }
        if (key.startsWith('toggle_') || typeof value === 'boolean') {
          return <ToggleField key={fieldPath} path={fieldPath} label={label} />
        }
        if (typeof value === 'number') {
          return <NumberField key={fieldPath} path={fieldPath} label={label} />
        }
        if (typeof value === 'string') {
          const useTextarea = value.length > 80 || value.includes('\n')
          return useTextarea ? (
            <TextAreaField
              key={fieldPath}
              path={fieldPath}
              label={label}
              rows={Math.min(value.split('\n').length + 1, 8)}
            />
          ) : (
            <TextField key={fieldPath} path={fieldPath} label={label} />
          )
        }
        return null
      })}
    </>
  )
}
