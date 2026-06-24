import defaultConfig from '@content/site-config.json'
import { useConfig, getPath } from '../../../lib/admin/store'
import { TextField } from './TextField'
import { TextAreaField } from './TextAreaField'
import { ToggleField } from './ToggleField'
import { NumberField } from './NumberField'
import { ArrayField } from './ArrayField'
import { HeroPhotosField } from './HeroPhotosField'
import { ImmersiveLayoutEditor } from './ImmersiveLayoutEditor'
import { Section } from '../ui/Section'

interface Props {
  path: string
}

function prettify(key: string): string {
  return key
    .replace(/^toggle_/, '')
    .replace(/_/g, ' ')
    .replace(/\bog\b/g, 'OG')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

const SKIP_KEYS = new Set(['page_description', 'og_title', 'og_description', 'showcase', 'layout'])

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

        if (fieldPath === 'home.hero.photos') {
          return <HeroPhotosField key={fieldPath} path={fieldPath} label={label} limit={5} />
        }
        // The immersive gallery is curated entirely inside the layout editor
        // (photo add/remove + per-device positioning). Render the editor once
        // (at the first split key) and skip standard array fields for the rest.
        if (fieldPath === 'home.immersiveGallery.mobilePhotos') {
          return <ImmersiveLayoutEditor key={fieldPath} path="home.immersiveGallery" />
        }
        if (
          fieldPath === 'home.immersiveGallery.mobilePositions' ||
          fieldPath === 'home.immersiveGallery.desktopPhotos' ||
          fieldPath === 'home.immersiveGallery.desktopPositions'
        ) {
          return null
        }
        // Defensive: hide any lingering pre-separation keys (photos/positions)
        // so stale data from older SQLite blobs doesn't render duplicate fields.
        if (
          fieldPath === 'home.immersiveGallery.photos' ||
          fieldPath === 'home.immersiveGallery.positions'
        ) {
          return null
        }
        if (Array.isArray(value)) {
          return <ArrayField key={fieldPath} path={fieldPath} label={label} />
        }
        if (value === null) {
          const def = getPath(defaultConfig, fieldPath)
          if (key.startsWith('toggle_') || typeof def === 'boolean') {
            return <ToggleField key={fieldPath} path={fieldPath} label={label} />
          }
          if (typeof def === 'number') {
            return <NumberField key={fieldPath} path={fieldPath} label={label} />
          }
          if (typeof def === 'string') {
            return <TextField key={fieldPath} path={fieldPath} label={label} />
          }
          return <TextField key={fieldPath} path={fieldPath} label={label} />
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
          const isBio = fieldPath === 'about.photographer.bio'
          return useTextarea ? (
            <TextAreaField
              key={fieldPath}
              path={fieldPath}
              label={label}
              rows={Math.min(value.split('\n').length + 1, 8)}
              maxWords={isBio ? 250 : undefined}
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
