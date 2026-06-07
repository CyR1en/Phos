import { useConfig } from '../../../lib/admin/store'
import { Button } from '../ui/Button'
import { Section } from '../ui/Section'
import { TextField } from '../fields/TextField'
import { ToggleField } from '../fields/ToggleField'
import { NumberField } from '../fields/NumberField'
import { SelectField } from '../fields/SelectField'
import { TextAreaField } from '../fields/TextAreaField'
import { ObjectField } from '../fields/ObjectField'

const PLATFORMS = [
  'instagram',
  'facebook',
  'twitter',
  'linkedin',
  'youtube',
  'tiktok',
  'github',
  'other',
]

export function SitePage() {
  const { getValue, setValue, flushSave, config } = useConfig()
  const social = (getValue('site.social') as Array<{ platform: string; url: string }>) ?? []

  const addSocial = () => {
    setValue('site.social', [...social, { platform: 'instagram', url: '' }])
  }
  const removeSocial = (i: number) => {
    setValue('site.social', social.filter((_, idx) => idx !== i))
    flushSave()
  }
  const updateSocial = (i: number, key: 'platform' | 'url', v: string) => {
    setValue(
      'site.social',
      social.map((s, idx) => (idx === i ? { ...s, [key]: v } : s)),
    )
  }

  return (
    <div class="max-w-3xl">
      <div class="mb-8">
        <p class="text-phos-micro font-mono uppercase tracking-wider text-phos-coral mb-2">
          site
        </p>
        <h2 class="font-display text-phos-heading text-phos-ink">Site</h2>
        <p class="text-phos-body text-phos-muted mt-2">
          {config?.site?.page_description}
        </p>
      </div>
      <div class="space-y-6">
        <Section title="Identity">
          <TextField path="site.title" label="Title" />
          <TextAreaField
            path="site.description"
            label="Description"
            rows={2}
          />
          <ToggleField path="site.toggle_demo" label="Toggle Demo" />
        </Section>
        <Section title="Open Graph">
          <TextField path="site.og.image" label="OG Image URL" placeholder="/og.png" />
          <TextField path="site.og.imageAlt" label="OG Image Alt Text" placeholder="Description of the image" />
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <NumberField path="site.og.imageWidth" label="OG Image Width" />
            <NumberField path="site.og.imageHeight" label="OG Image Height" />
          </div>
          <TextField path="site.og.locale" label="OG Locale" placeholder="en_US" />
        </Section>
        <Section title="Social links">
        <div class="space-y-3">
          {social.map((s, i) => (
            <div
              key={i}
              class="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 sm:items-end border border-phos-card-border rounded-phos-sm p-3 bg-phos-canvas"
            >
              <SelectField
                path={`site.social.${i}.platform`}
                label=""
                options={PLATFORMS.map((p) => ({ value: p, label: p }))}
              />
              <TextField
                path={`site.social.${i}.url`}
                label=""
                placeholder="https://..."
              />
              <Button
                variant="danger"
                size="sm"
                onClick={() => removeSocial(i)}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={addSocial}>
            + Add social link
          </Button>
        </div>
      </Section>
      </div>
    </div>
  )
}
