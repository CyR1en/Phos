import { useEffect, useRef, useState } from 'preact/hooks'
import { getToken } from '../../../lib/admin/api'
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

  const [logoStatus, setLogoStatus] = useState<{
    detected: boolean
    type: string | null
    light: string | null
    dark: string | null
  } | null>(null)
  const [logoError, setLogoError] = useState('')
  const [logoUploading, setLogoUploading] = useState(false)
  const lightInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/logo-status', {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(d => setLogoStatus(d))
      .catch(() => {})
  }, [])

  const dataUrlFromFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  const uploadLogo = async () => {
    const file = lightInputRef.current?.files?.[0]
    if (!file) return
    setLogoError('')
    setLogoUploading(true)
    try {
      const res = await fetch('/api/upload-logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ file: await dataUrlFromFile(file) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setLogoStatus({ detected: true, type: data.type, light: data.light, dark: data.dark })
      if (lightInputRef.current) lightInputRef.current.value = ''
    } catch (e: any) {
      setLogoError(e.message)
    } finally {
      setLogoUploading(false)
    }
  }

  const removeLogo = async () => {
    await fetch('/api/upload-logo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ file: '' }),
    })
    setLogoStatus({ detected: false, type: null, light: null, dark: null })
  }

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
        <h2 class="text-xs font-mono uppercase tracking-wider text-accent mb-2">
          site
        </h2>
        <p class="text-base text-muted mt-2">
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
          <div class="border-t border-border pt-4 mt-4">
            <h3 class="font-display font-display text-xl text-ink mb-1">Logo</h3>
            <div class="mb-3 p-3 bg-surface rounded-sm border border-border-light text-base text-ink">
              Current logo: <code class="font-mono text-accent">{logoStatus?.light ?? 'none'}</code>
            </div>
            <div>
              <input
                ref={lightInputRef}
                type="file"
                accept=".svg,.png,.jpg,.jpeg,.webp,.avif"
                class="block w-full text-sm text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-xs file:border-0 file:text-sm file:font-mono file:bg-surface file:text-ink hover:file:bg-border"
              />
            </div>
            <div class="flex items-center gap-3 mt-3">
              <button
                type="button"
                onClick={uploadLogo}
                disabled={logoUploading}
                class="inline-flex items-center rounded-xs bg-primary px-4 py-1.5 text-sm font-medium text-primary-text hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {logoUploading ? 'Uploading...' : 'Upload logo'}
              </button>
              {logoStatus?.detected && (
                <button
                  type="button"
                  onClick={removeLogo}
                  class="text-error hover:text-error/80 transition-colors text-sm"
                >
                  Remove
                </button>
              )}
            </div>
            {logoError && <p class="text-base text-error mt-2">{logoError}</p>}
          </div>
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
              class="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 sm:items-end border border-border-light rounded-sm p-3 bg-canvas"
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
