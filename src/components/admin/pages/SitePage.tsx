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
import { ThemePicker } from './ThemePicker'

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

  return (
    <div class="max-w-3xl space-y-8">
      <div class="space-y-1">
        <p class="text-xs font-semibold uppercase tracking-wider text-primary font-mono">
          Site Configuration
        </p>
        <h1 class="font-display text-3xl font-bold text-ink">
          General Settings
        </h1>
        <p class="text-sm text-body-muted leading-relaxed">
          {config?.site?.page_description || 'Manage your website identity, theme, metadata, and social links.'}
        </p>
      </div>

      <div class="space-y-8">
        <Section title="Identity" description="Configure your website title, description, logo, and active mode.">
          <TextField path="site.title" label="Title" />
          <TextAreaField
            path="site.description"
            label="Description"
            rows={2}
          />
          <div class="border-t border-border pt-6 mt-6 space-y-4">
            <h3 class="text-sm font-semibold text-ink uppercase tracking-wider font-mono">Logo</h3>
            <div class="p-4 bg-canvas/30 rounded-sm border border-border text-sm text-ink flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
              <span class="text-muted">Current Logo File</span>
              <div class="overflow-x-auto max-w-full">
                <code class="font-mono text-xs font-semibold px-2.5 py-1 rounded-sm bg-surface border border-border text-primary block whitespace-nowrap">
                  {logoStatus?.light ?? 'none'}
                </code>
              </div>
            </div>
            <div class="space-y-2">
              <label class="text-xs font-medium text-muted block">Upload New Logo SVG/PNG</label>
              <input
                ref={lightInputRef}
                type="file"
                accept=".svg,.png,.jpg,.jpeg,.webp,.avif"
                class="block w-full text-sm text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-sm file:border file:border-border file:text-xs file:font-medium file:bg-surface file:text-ink hover:file:bg-surface-hover hover:file:border-border-hover file:transition-colors file:cursor-pointer"
              />
            </div>
            <div class="flex items-center gap-3 pt-2">
              <Button
                variant="primary"
                size="sm"
                onClick={uploadLogo}
                disabled={logoUploading}
              >
                {logoUploading ? 'Uploading...' : 'Upload logo'}
              </Button>
              {logoStatus?.detected && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={removeLogo}
                  class="text-error hover:text-error hover:bg-error/10"
                >
                  Remove Logo
                </Button>
              )}
            </div>
            {logoError && <p class="text-sm text-error mt-2 font-medium">{logoError}</p>}
          </div>
          <ToggleField path="site.toggle_demo" label="Enable Demo Mode" />
        </Section>

        <Section title="Theme" description="Select a predefined color theme for your portfolio. Changes apply in real-time.">
          <ThemePicker />
        </Section>

        <Section title="Open Graph" description="Configure search engine and social media preview metadata.">
          <TextField path="site.og.image" label="OG Image URL" placeholder="/og.png" />
          <TextField path="site.og.imageAlt" label="OG Image Alt Text" placeholder="Description of the image" />
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <NumberField path="site.og.imageWidth" label="OG Image Width" />
            <NumberField path="site.og.imageHeight" label="OG Image Height" />
          </div>
          <TextField path="site.og.locale" label="OG Locale" placeholder="en_US" />
        </Section>

        <Section title="Social Links" description="Manage platform profiles displayed in your website footer.">
          <div class="space-y-4">
            {social.map((s, i) => (
              <div
                key={`social-${i}-${s?.platform || s?.url || i}`}
                class="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-4 sm:items-end border border-border rounded-sm p-4 bg-canvas/20 shadow-2xs relative group/social"
              >
                <SelectField
                  path={`site.social.${i}.platform`}
                  label="Platform"
                  options={PLATFORMS.map((p) => ({ value: p, label: p }))}
                />
                <TextField
                  path={`site.social.${i}.url`}
                  label="Profile URL"
                  placeholder="https://..."
                />
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => removeSocial(i)}
                  class="mb-0.5 sm:mb-0"
                >
                  <svg class="size-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  Remove
                </Button>
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={addSocial}>
              <svg class="size-3.5 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add social link
            </Button>
          </div>
        </Section>
      </div>
    </div>
  )
}
