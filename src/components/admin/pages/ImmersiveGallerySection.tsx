import rawManifest from '../../../generated/categories.json'
import type { CategoriesManifest, SiteConfig } from '../../../lib/admin/types'
import { useConfig } from '../../../lib/admin/store'
import { ImmersiveLayoutEditor } from '../fields/ImmersiveLayoutEditor'
import { SelectField } from '../fields/SelectField'
import { TextAreaField } from '../fields/TextAreaField'
import { TextField } from '../fields/TextField'
import { Section } from '../ui/Section'

const PATH = 'home.immersiveGallery'
const manifest = rawManifest as CategoriesManifest
const photosByKey = new Map<string, CategoriesManifest['categories'][number]['photos'][number]>(manifest.categories.flatMap(category =>
  category.photos.map(photo => [`${category.slug}/${photo.filename}`, photo] as const),
))
type Gallery = NonNullable<SiteConfig['home']['immersiveGallery']>

const FEEL_OPTIONS = {
  intensity: [
    { value: 'dramatic', label: 'Dramatic (original)' },
    { value: 'balanced', label: 'Balanced' },
    { value: 'subtle', label: 'Subtle' },
  ],
  scrollLength: [
    { value: 'short', label: 'Short' },
    { value: 'standard', label: 'Standard (original)' },
    { value: 'long', label: 'Long' },
  ],
  atmosphere: [
    { value: 'stars', label: 'Stars' },
    { value: 'vignette', label: 'Vignette' },
    { value: 'none', label: 'None' },
  ],
}

function PhotoSummary({ device, photos }: { device: 'Desktop' | 'Mobile'; photos: string[] }) {
  const available = photos.filter(photo => photosByKey.has(photo))
  const missing = photos.filter(photo => !photosByKey.has(photo))
  return (
    <div class="space-y-2">
      <p class="text-sm font-medium text-ink">{device} · {photos.length}</p>
      {available.length > 0 && (
        <ul aria-label={`${device} photos`} class="flex flex-wrap gap-2">
          {available.slice(0, 7).map(key => (
            <li key={key}>
              <img
                src={photosByKey.get(key)!.thumb}
                alt={key.split('/')[1]}
                title={key}
                width={56}
                height={56}
                loading="lazy"
                class="size-14 rounded-sm border border-border object-cover"
              />
            </li>
          ))}
          {available.length > 7 && (
            <li class="size-14 flex items-center justify-center text-sm text-muted">+{available.length - 7}</li>
          )}
        </ul>
      )}
      {available.length === 0 && (
        <p class="text-sm text-error" role="status">
          {device === 'Desktop'
            ? 'Desktop has no available photos. Add photos in Edit layout.'
            : 'Mobile has no available photos. Add photos to show the gallery on phones.'}
        </p>
      )}
      {missing.length > 0 && (
        <p class="text-sm text-error" role="status">
          {missing.length} {device.toLowerCase()} {missing.length === 1 ? 'photo is' : 'photos are'} missing from the photo library and will be skipped: {missing.join(', ')}.
          {' '}If these photos were just added, regenerate photos and republish to refresh the library.
        </p>
      )}
    </div>
  )
}

export function ImmersiveGallerySection() {
  const { getValue, setValue, flushSave } = useConfig()
  const gallery = getValue(PATH) as Gallery | undefined
  const enabled = !!gallery?.enabled
  const text = gallery?.text ?? ''
  const desktopPhotos = gallery?.desktopPhotos ?? []
  const mobilePhotos = gallery?.mobilePhotos ?? []
  const hasDesktopPhotos = desktopPhotos.some(photo => photosByKey.has(photo))
  const hasMobilePhotos = mobilePhotos.some(photo => photosByKey.has(photo))
  const placeholder = /^lorem/i.test(text)
  const status = !enabled ? 'Off'
    : !hasDesktopPhotos ? 'Needs desktop photos'
    : !hasMobilePhotos ? 'Mobile empty'
    : placeholder ? 'Placeholder tagline'
    : 'Live'

  return (
    <Section footer={<p class="text-sm text-muted">Saves automatically. Republish to update the live site.</p>}>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h3 class="font-display text-xl font-semibold leading-tight tracking-tight text-ink">Immersive gallery</h3>
        <span role="status" class={`rounded-full border px-3 py-1 text-xs font-medium ${status === 'Live' ? 'border-border text-ink bg-surface' : status === 'Off' ? 'border-border text-muted' : 'border-error text-error'}`}>
          {status}
        </span>
      </div>

      <div class="flex items-center justify-between gap-4">
        <div>
          <label for="immersive-gallery-enabled" class="text-sm font-medium text-ink">Show on home page</label>
          {!enabled && <p class="text-sm text-muted mt-1">Hidden on your site.</p>}
        </div>
        <button
          id="immersive-gallery-enabled"
          type="button"
          aria-label="Show on home page"
          aria-pressed={enabled}
          onClick={() => {
            setValue(`${PATH}.enabled`, !enabled)
            flushSave()
          }}
          class={`min-h-11 min-w-16 rounded-sm border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${enabled ? 'bg-primary text-primary-text border-primary' : 'bg-canvas text-ink border-border hover:border-border-hover'}`}
        >
          {enabled ? 'On' : 'Off'}
        </button>
      </div>

      <div class="space-y-4 [&_input]:min-h-11 [&_select]:min-h-11">
        <div class="space-y-2">
          <TextAreaField
            path="home.immersiveGallery.text"
            label="Tagline"
            rows={3}
            maxLength={280}
            placeholder="A different way of seeing."
            aria-describedby={`immersive-tagline-count immersive-tagline-help${placeholder ? ' immersive-tagline-placeholder' : ''}`}
          />
          <p id="immersive-tagline-count" class={`text-xs ${text.length > 160 ? 'text-amber-600 dark:text-amber-400' : 'text-muted'}`}>{text.length} / 280 · best under 90</p>
          <p id="immersive-tagline-help" class="text-sm text-muted">Shown after the photographs. Leave empty for a photo-only ending.</p>
          {placeholder && (
            <p id="immersive-tagline-placeholder" role="status" class="text-sm text-error">Placeholder text: replace before publishing</p>
          )}
        </div>
        <TextField path="home.immersiveGallery.eyebrow" label="Eyebrow (optional)" maxLength={80} />

        <fieldset class="space-y-4 border-t border-border pt-5">
          <legend class="text-sm font-semibold text-ink">Feel</legend>
          <SelectField path="home.immersiveGallery.intensity" label="Depth intensity" options={FEEL_OPTIONS.intensity} fallbackValue="dramatic" />
          <SelectField path="home.immersiveGallery.scrollLength" label="Scroll length" options={FEEL_OPTIONS.scrollLength} fallbackValue="standard" />
          <SelectField path="home.immersiveGallery.atmosphere" label="Atmosphere" options={FEEL_OPTIONS.atmosphere} fallbackValue="stars" />
        </fieldset>
      </div>

      <div class="space-y-5 border-t border-border pt-5">
        <PhotoSummary device="Desktop" photos={desktopPhotos} />
        <PhotoSummary device="Mobile" photos={mobilePhotos} />
        <ImmersiveLayoutEditor path="home.immersiveGallery" />
      </div>
    </Section>
  )
}
