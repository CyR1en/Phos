import { useEffect, useRef, useState } from 'preact/hooks'
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
  const darkInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/logo-status', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
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
      const body: Record<string, any> = { file: await dataUrlFromFile(file) }
      const darkFile = darkInputRef.current?.files?.[0]
      if (darkFile) body.darkFile = await dataUrlFromFile(darkFile)
      const res = await fetch('/api/upload-logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setLogoStatus({ detected: true, type: data.type, light: data.light, dark: data.dark })
      if (lightInputRef.current) lightInputRef.current.value = ''
      if (darkInputRef.current) darkInputRef.current.value = ''
    } catch (e: any) {
      setLogoError(e.message)
    } finally {
      setLogoUploading(false)
    }
  }

  const removeLogo = async () => {
    await fetch('/api/upload-logo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
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
          <div class="border-t border-phos-hairline pt-4 mt-4">
            <h3 class="font-display text-phos-feature text-phos-ink mb-1">Logo</h3>
            <p class="text-phos-body text-phos-muted text-sm mb-3">
              Upload an SVG for an inline logo, or a raster image (light + optional dark variant) for an &lt;img&gt; logo.
            </p>
            {logoStatus?.detected && (
              <div class="mb-3 p-3 bg-phos-stone rounded-phos-sm border border-phos-card-border">
                {logoStatus.type === 'svg' ? (
                  <div class="flex items-center justify-center py-2 [&_svg]:max-h-12 [&_svg]:w-auto [&_svg]:fill-current text-phos-ink">
                    <img src={logoStatus.light!} alt="Current logo" class="max-h-12" />
                  </div>
                ) : (
                  <div class="flex items-center gap-4">
                    <div class="flex-1">
                      <p class="text-phos-caption text-phos-muted mb-1">Light</p>
                      <img src={logoStatus.light!} alt="Light logo" class="max-h-12 rounded-phos-xs bg-white p-1 border border-phos-card-border" />
                    </div>
                    <div class="flex-1">
                      <p class="text-phos-caption text-phos-muted mb-1">Dark</p>
                      <img src={logoStatus.dark!} alt="Dark logo" class="max-h-12 rounded-phos-xs bg-phos-ink p-1 border border-phos-card-border" />
                    </div>
                  </div>
                )}
              </div>
            )}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-phos-caption text-phos-muted mb-1">Logo file</label>
                <input
                  ref={lightInputRef}
                  type="file"
                  accept=".svg,.png,.jpg,.jpeg,.webp,.avif"
                  class="block w-full text-sm text-phos-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-phos-xs file:border-0 file:text-sm file:font-mono file:bg-phos-stone file:text-phos-ink hover:file:bg-phos-hairline"
                />
              </div>
              <div>
                <label class="block text-phos-caption text-phos-muted mb-1">Dark variant (optional)</label>
                <input
                  ref={darkInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.avif"
                  class="block w-full text-sm text-phos-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-phos-xs file:border-0 file:text-sm file:font-mono file:bg-phos-stone file:text-phos-ink hover:file:bg-phos-hairline"
                />
              </div>
            </div>
            <div class="flex items-center gap-3 mt-3">
              <button
                type="button"
                onClick={uploadLogo}
                disabled={logoUploading}
                class="inline-flex items-center rounded-phos-xs bg-phos-primary px-4 py-1.5 text-sm font-medium text-phos-canvas hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {logoUploading ? 'Uploading...' : 'Upload logo'}
              </button>
              {logoStatus?.detected && (
                <button
                  type="button"
                  onClick={removeLogo}
                  class="text-phos-error hover:text-phos-error/80 transition-colors text-sm"
                >
                  Remove
                </button>
              )}
            </div>
            {logoError && <p class="text-phos-body text-phos-error mt-2">{logoError}</p>}
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
