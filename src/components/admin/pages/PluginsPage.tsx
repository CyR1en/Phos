import { useConfig } from '../../../lib/admin/store'
import { Section } from '../ui/Section'

function prettify(key: string): string {
  return key
    .replace(/^toggle_/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

const SKIP_KEYS = new Set(['page_description'])

function FieldLabel({ children }: { children: string }) {
  return (
    <label class="block text-phos-caption font-medium text-phos-body-muted mb-1.5">
      {children}
    </label>
  )
}

function inputCls() {
  return 'w-full px-3 py-2 bg-phos-canvas border border-phos-hairline rounded-phos-xs text-phos-body font-body focus:outline-none focus:border-phos-form-focus focus:ring-2 focus:ring-phos-form-focus/20'
}

interface PluginConfigFieldProps {
  name: string
}

function PluginConfigField({ name }: PluginConfigFieldProps) {
  const { pluginConfigs, getPluginValue, setPluginValue } = useConfig()
  const plugin = pluginConfigs?.find((p) => p.name === name)
  if (!plugin) return null
  const config = plugin.config

  return (
    <>
      {Object.entries(config).map(([key, value]) => {
        if (SKIP_KEYS.has(key)) return null
        const fieldPath = key
        const label = prettify(key)

        if (Array.isArray(value)) {
          return (
            <div key={fieldPath}>
              <FieldLabel>{label}</FieldLabel>
              <p class="text-phos-caption text-phos-muted">
                Array editing not supported in admin (edit the JSON file directly).
              </p>
            </div>
          )
        }
        if (value && typeof value === 'object') {
          return (
            <div key={fieldPath}>
              <FieldLabel>{label}</FieldLabel>
              <p class="text-phos-caption text-phos-muted">
                Nested object editing not supported in admin.
              </p>
            </div>
          )
        }
        if (key.startsWith('toggle_') || typeof value === 'boolean') {
          const checked = !!getPluginValue(name, fieldPath)
          return (
            <div key={fieldPath} class="flex items-center justify-between">
              <span class="text-phos-caption text-phos-ink">{label}</span>
              <label class="inline-flex items-center gap-3 cursor-pointer select-none">
                <span class="relative inline-block w-10 h-[22px] flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      setPluginValue(name, fieldPath, (e.currentTarget as HTMLInputElement).checked)
                    }}
                    class="sr-only peer"
                  />
                  <span class="absolute inset-0 bg-phos-hairline rounded-phos-pill peer-checked:bg-phos-primary transition-colors" />
                  <span class="absolute left-[3px] bottom-[3px] h-4 w-4 bg-phos-canvas rounded-full transition-transform peer-checked:translate-x-[18px]" />
                </span>
              </label>
            </div>
          )
        }
        if (typeof value === 'number') {
          return (
            <div key={fieldPath}>
              <FieldLabel>{label}</FieldLabel>
              <input
                type="number"
                value={
                  getPluginValue(name, fieldPath) === undefined ||
                  getPluginValue(name, fieldPath) === null
                    ? ''
                    : String(getPluginValue(name, fieldPath))
                }
                onInput={(e) => {
                  const v = (e.currentTarget as HTMLInputElement).value
                  setPluginValue(name, fieldPath, v === '' ? null : Number(v))
                }}
                class={inputCls()}
              />
            </div>
          )
        }
        if (typeof value === 'string') {
          const useTextarea = value.length > 80 || value.includes('\n')
          if (useTextarea) {
            return (
              <div key={fieldPath}>
                <FieldLabel>{label}</FieldLabel>
                <textarea
                  rows={Math.min(value.split('\n').length + 1, 8)}
                  value={(getPluginValue(name, fieldPath) as string) ?? ''}
                  onInput={(e) =>
                    setPluginValue(
                      name,
                      fieldPath,
                      (e.currentTarget as HTMLTextAreaElement).value,
                    )
                  }
                  class={inputCls()}
                />
              </div>
            )
          }
        }
        if (typeof value === 'string') {
          return (
            <div key={fieldPath}>
              <FieldLabel>{label}</FieldLabel>
              <input
                type="text"
                value={(getPluginValue(name, fieldPath) as string) ?? ''}
                onInput={(e) =>
                  setPluginValue(
                    name,
                    fieldPath,
                    (e.currentTarget as HTMLInputElement).value,
                  )
                }
                class={inputCls()}
              />
            </div>
          )
        }
        return null
      })}
    </>
  )
}

export function PluginsPage() {
  const { pluginConfigs, flushSave } = useConfig()

  if (!pluginConfigs) {
    return (
      <div class="max-w-3xl">
        <h2 class="font-display text-phos-heading text-phos-ink mb-2">Plugins</h2>
        <p class="text-phos-body text-phos-muted">Loading…</p>
      </div>
    )
  }

  if (pluginConfigs.length === 0) {
    return (
      <div class="max-w-3xl">
        <div class="mb-8">
          <h2 class="text-phos-micro font-mono uppercase tracking-wider text-phos-coral mb-2">
            plugins
          </h2>
          <p class="text-phos-body text-phos-muted mt-2">
            Edit deployment-specific plugin configs from the admin.
          </p>
        </div>
        <div class="border border-phos-card-border rounded-phos-md p-12 text-center">
          <p class="text-phos-muted">
            No admin-enabled plugins found. Add <code class="font-mono text-phos-ink">"admin": true</code> to a plugin's <code class="font-mono text-phos-ink">plugin.json</code> to make it editable here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div class="max-w-3xl">
      <div class="mb-8">
          <h2 class="text-phos-micro font-mono uppercase tracking-wider text-phos-coral mb-2">
            plugins
          </h2>
          <p class="text-phos-body text-phos-muted mt-2">
            Edit deployment-specific plugin configs. Changes persist to SQLite and apply on the next republish.
          </p>
      </div>
      <div class="space-y-6">
        {pluginConfigs.map((plugin) => (
          <Section
            key={plugin.name}
            title={plugin.name}
            description={plugin.slot ? `Slot: ${plugin.slot} • Entry: ${plugin.entry}` : `Entry: ${plugin.entry}`}
          >
            <PluginConfigField name={plugin.name} />
          </Section>
        ))}
      </div>
      <div class="mt-8">
        <button
          type="button"
          onClick={() => flushSave()}
          class="text-phos-caption text-phos-muted hover:text-phos-ink underline-offset-2 hover:underline"
        >
          Force save
        </button>
      </div>
    </div>
  )
}
