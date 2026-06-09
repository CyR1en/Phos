import { useState } from 'preact/hooks'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/admin/api'
import { useConfig } from '../../../lib/admin/store'
import { ToggleField } from '../fields/ToggleField'
import { TextField } from '../fields/TextField'
import { Section } from '../ui/Section'
import { Button } from '../ui/Button'

function FieldLabel({ children }: { children: string }) {
  return (
    <label class="block text-phos-caption font-medium text-phos-body-muted mb-1.5">
      {children}
    </label>
  )
}

function selectCls() {
  return 'w-full px-3 py-2 bg-phos-canvas border border-phos-hairline rounded-phos-xs text-phos-body font-body focus:outline-none focus:border-phos-form-focus focus:ring-2 focus:ring-phos-form-focus/20'
}

interface ShowcaseItem {
  type: 'category' | 'gallery'
  slug: string
  title: string
  description: string
}

function ShowcaseItemEditor({
  item,
  index,
  categories,
  galleries,
  onUpdate,
  onRemove,
}: {
  item: ShowcaseItem
  index: number
  categories: { slug: string; name: string }[]
  galleries: { slug: string; name: string }[]
  onUpdate: (item: ShowcaseItem) => void
  onRemove: () => void
}) {
  const options = item.type === 'category' ? categories : galleries
  const selected = options.find((o) => o.slug === item.slug)

  return (
    <div class="border border-phos-card-border rounded-phos-md p-4 bg-phos-canvas space-y-3">
      <div class="flex items-center justify-between">
        <span class="text-phos-caption font-mono text-phos-muted">#{index + 1}</span>
        <Button variant="danger" size="sm" onClick={onRemove}>
          Remove
        </Button>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Type</FieldLabel>
          <select
            value={item.type}
            onChange={(e) => {
              const newType = (e.currentTarget as HTMLSelectElement).value as 'category' | 'gallery'
              onUpdate({ ...item, type: newType, slug: '' })
            }}
            class={selectCls()}
          >
            <option value="category">Category</option>
            <option value="gallery">Gallery</option>
          </select>
        </div>
        <div>
          <FieldLabel>{item.type === 'category' ? 'Category' : 'Gallery'}</FieldLabel>
          <select
            value={item.slug}
            onChange={(e) => onUpdate({ ...item, slug: (e.currentTarget as HTMLSelectElement).value })}
            class={selectCls()}
          >
            <option value="">Select {item.type}...</option>
            {options.map((o) => (
              <option key={o.slug} value={o.slug}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <FieldLabel>Display title (optional)</FieldLabel>
        <input
          type="text"
          value={item.title}
          placeholder={selected?.name || ''}
          onInput={(e) => onUpdate({ ...item, title: (e.currentTarget as HTMLInputElement).value })}
          class={selectCls()}
        />
      </div>

      <div>
        <FieldLabel>Display description (optional)</FieldLabel>
        <textarea
          rows={2}
          value={item.description}
          placeholder={selected ? `Original: ${(selected as any).description || '(none)'}` : ''}
          onInput={(e) => onUpdate({ ...item, description: (e.currentTarget as HTMLTextAreaElement).value })}
          class={selectCls()}
        />
      </div>
    </div>
  )
}

export function ShowcaseSection() {
  const { config, categories, getValue, setValue, pushToast } = useConfig()

  const galleriesQuery = useQuery({
    queryKey: ['galleries'],
    queryFn: () => api.getGalleries(),
  })

  const galleries = galleriesQuery.data?.galleries ?? []
  const categoryOptions = (categories ?? []).map((c) => ({
    slug: c.slug,
    name: c.meta?.name || c.slug,
  }))
  const galleryOptions = galleries.map((g) => ({ slug: g.slug, name: g.name }))

  const showcase = (getValue('home.showcase') as any) || { enabled: true, heading: 'Showcase', items: [] }
  const items: ShowcaseItem[] = showcase.items || []

  const updateItem = (index: number, item: ShowcaseItem) => {
    const next = items.map((it, i) => (i === index ? item : it))
    setValue('home.showcase.items', next)
  }

  const removeItem = (index: number) => {
    const next = items.filter((_, i) => i !== index)
    setValue('home.showcase.items', next)
  }

  const addItem = () => {
    setValue('home.showcase.items', [
      ...items,
      { type: 'category', slug: '', title: '', description: '' },
    ])
  }

  return (
    <Section title="Showcase" description="Choose categories and galleries to feature on the home page.">
      <ToggleField path="home.showcase.enabled" label="Enabled" />
      <TextField path="home.showcase.heading" label="Section heading" />

      <div class="border-t border-phos-hairline pt-4 mt-4">
        <div class="flex items-center justify-between mb-4">
          <span class="text-phos-caption font-medium text-phos-ink font-mono uppercase tracking-wider">
            Items
          </span>
          <Button variant="secondary" size="sm" onClick={addItem}>
            + Add item
          </Button>
        </div>

        <div class="space-y-3">
          {items.map((item, i) => (
            <ShowcaseItemEditor
              key={i}
              item={item}
              index={i}
              categories={categoryOptions}
              galleries={galleryOptions}
              onUpdate={(updated) => updateItem(i, updated)}
              onRemove={() => removeItem(i)}
            />
          ))}

          {items.length === 0 && (
            <p class="text-phos-caption text-phos-muted italic py-4">
              No items yet. Click + Add item to feature a category or gallery.
            </p>
          )}
        </div>
      </div>
    </Section>
  )
}
