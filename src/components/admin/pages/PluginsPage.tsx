import { useConfig } from '../../../lib/admin/store'
import { Section } from '../ui/Section'
import { Toggle } from '../ui/Toggle'

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
    <label class="text-sm font-medium text-ink block mb-1.5">
      {children}
    </label>
  )
}

function inputCls() {
  return 'flex h-9.5 w-full rounded-sm border border-border bg-canvas px-3 py-1 text-sm shadow-2xs transition-colors placeholder:text-muted hover:border-border-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus focus-visible:border-border-focus disabled:cursor-not-allowed disabled:opacity-50 text-ink'
}

function textareaCls() {
  return 'flex min-h-[60px] w-full rounded-sm border border-border bg-canvas px-3 py-2 text-sm shadow-2xs transition-colors placeholder:text-muted hover:border-border-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus focus-visible:border-border-focus disabled:cursor-not-allowed disabled:opacity-50 resize-y text-ink'
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
    <div class="space-y-4">
      {Object.entries(config).map(([key, value]) => {
        if (SKIP_KEYS.has(key)) return null
        const fieldPath = key
        const label = prettify(key)

        if (Array.isArray(value)) {
          return (
            <div key={fieldPath} class="space-y-1.5">
              <FieldLabel>{label}</FieldLabel>
              <p class="text-xs text-muted italic">
                Array editing not supported in admin (edit the JSON file directly).
              </p>
            </div>
          )
        }
        if (value && typeof value === 'object') {
          return (
            <div key={fieldPath} class="space-y-1.5">
              <FieldLabel>{label}</FieldLabel>
              <p class="text-xs text-muted italic">
                Nested object editing not supported in admin.
              </p>
            </div>
          )
        }
        if (key.startsWith('toggle_') || typeof value === 'boolean') {
          const checked = !!getPluginValue(name, fieldPath)
          return (
            <div key={fieldPath} class="flex items-center justify-between py-2.5">
              <span class="text-sm font-medium text-ink">{label}</span>
              <Toggle
                checked={checked}
                onChange={(e) => {
                  setPluginValue(name, fieldPath, e)
                }}
              />
            </div>
          )
        }
        if (typeof value === 'number') {
          return (
            <div key={fieldPath} class="space-y-1.5">
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
              <div key={fieldPath} class="space-y-1.5">
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
                  class={textareaCls()}
                />
              </div>
            )
          }
        }
        if (typeof value === 'string') {
          return (
            <div key={fieldPath} class="space-y-1.5">
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
    </div>
  )
}

export function PluginsPage() {
  const { pluginConfigs, flushSave } = useConfig()

  if (!pluginConfigs) {
    return (
      <div class="max-w-3xl space-y-6">
        <div class="space-y-1">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-primary font-mono">
            Extensions
          </h2>
          <h1 class="font-display text-3xl font-bold text-ink">Plugins</h1>
        </div>
        <div class="flex items-center justify-center p-12">
          <svg class="animate-spin h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          <span class="ml-3 text-sm text-muted">Loading plugins...</span>
        </div>
      </div>
    )
  }

  if (pluginConfigs.length === 0) {
    return (
      <div class="max-w-3xl space-y-6">
        <div class="space-y-1">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-primary font-mono">
            Extensions
          </h2>
          <h1 class="font-display text-3xl font-bold text-ink">
            Plugins
          </h1>
          <p class="text-sm text-body-muted">
            Edit deployment-specific plugin configs from the admin.
          </p>
        </div>
        <div class="border border-dashed border-border rounded-sm p-12 text-center bg-surface/20">
          <p class="text-sm text-muted">
            No admin-enabled plugins found. Add <code class="font-mono text-ink">"admin": true</code> to a plugin's <code class="font-mono text-ink">plugin.json</code> to make it editable here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div class="max-w-3xl space-y-8">
      <div class="space-y-1">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-primary font-mono">
          Extensions
        </h2>
        <h1 class="font-display text-3xl font-bold text-ink">
          Plugins
        </h1>
        <p class="text-sm text-body-muted">
          Edit deployment-specific plugin configs. Changes persist to SQLite and apply on the next republish.
        </p>
      </div>
      <div class="space-y-8">
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
      <div class="mt-8 flex items-center justify-between border-t border-border pt-6">
        <button
          type="button"
          onClick={() => flushSave()}
          class="text-xs font-semibold uppercase tracking-wider text-muted hover:text-ink transition-colors cursor-pointer"
        >
          Force Save Changes
        </button>
      </div>
    </div>
  )
}
