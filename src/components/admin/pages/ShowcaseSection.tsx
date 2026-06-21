import { useState } from 'preact/hooks'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/admin/api'
import { useConfig } from '../../../lib/admin/store'
import { ToggleField } from '../fields/ToggleField'
import { TextField } from '../fields/TextField'
import { Section } from '../ui/Section'
import { Button } from '../ui/Button'

function FieldLabel({ children, htmlFor }: { children: string; htmlFor?: string }) {
  return (
    <label for={htmlFor} class="text-sm font-medium text-ink block mb-1.5">
      {children}
    </label>
  )
}

function selectCls() {
  return 'flex h-9.5 w-full rounded-sm border border-border bg-canvas px-3 py-1 text-sm shadow-2xs transition-colors hover:border-border-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus focus-visible:border-border-focus cursor-pointer appearance-none pr-8 text-ink'
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
    <div class="border border-border rounded-sm p-5 bg-surface/30 shadow-2xs space-y-5 relative group/item">
      <div class="flex items-center justify-between border-b border-border-light pb-3">
        <span class="text-xs font-mono font-medium text-muted">Feature Item #{index + 1}</span>
        <Button variant="danger" size="sm" onClick={onRemove}>
          <svg class="size-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Remove
        </Button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel htmlFor={`showcase-type-${index}`}>Type</FieldLabel>
          <div class="relative">
            <select
              id={`showcase-type-${index}`}
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
            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-muted">
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </div>
        </div>
        <div>
          <FieldLabel htmlFor={`showcase-slug-${index}`}>{item.type === 'category' ? 'Category' : 'Gallery'}</FieldLabel>
          <div class="relative">
            <select
              id={`showcase-slug-${index}`}
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
            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-muted">
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div>
        <FieldLabel htmlFor={`showcase-title-${index}`}>Display Title (Optional)</FieldLabel>
        <input
          id={`showcase-title-${index}`}
          type="text"
          value={item.title}
          placeholder={selected?.name || ''}
          onInput={(e) => onUpdate({ ...item, title: (e.currentTarget as HTMLInputElement).value })}
          class="flex h-9.5 w-full rounded-sm border border-border bg-canvas px-3 py-1 text-sm shadow-2xs transition-colors placeholder:text-muted hover:border-border-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus focus-visible:border-border-focus"
        />
      </div>

      <div>
        <FieldLabel htmlFor={`showcase-desc-${index}`}>Display Description (Optional)</FieldLabel>
        <textarea
          id={`showcase-desc-${index}`}
          rows={2}
          value={item.description}
          placeholder={selected ? `Original: ${(selected as any).description || '(none)'}` : ''}
          onInput={(e) => onUpdate({ ...item, description: (e.currentTarget as HTMLTextAreaElement).value })}
          class="flex min-h-[60px] w-full rounded-sm border border-border bg-canvas px-3 py-2 text-sm shadow-2xs transition-colors placeholder:text-muted hover:border-border-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus focus-visible:border-border-focus resize-y"
        />
      </div>
    </div>
  )
}

export function ShowcaseSection() {
  const { config, categories, getValue, setValue } = useConfig()

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
      <div class="space-y-4">
        <ToggleField path="home.showcase.enabled" label="Enable Showcase Section" />
        <TextField path="home.showcase.heading" label="Section Heading" />
      </div>

      <div class="border-t border-border pt-6 mt-6 space-y-4">
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold text-ink uppercase tracking-wider font-mono">
            Featured Items
          </span>
          <Button variant="secondary" size="sm" onClick={addItem}>
            <svg class="size-3.5 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Item
          </Button>
        </div>

        <div class="space-y-4">
          {items.map((item, i) => (
            <ShowcaseItemEditor
              key={`showcase-${i}-${item?.type || item?.slug || i}`}
              item={item}
              index={i}
              categories={categoryOptions}
              galleries={galleryOptions}
              onUpdate={(updated) => updateItem(i, updated)}
              onRemove={() => removeItem(i)}
            />
          ))}

          {items.length === 0 && (
            <div class="border border-dashed border-border rounded-sm p-8 text-center bg-surface/10">
              <p class="text-sm text-muted italic">
                No items yet. Click Add Item to feature a category or gallery.
              </p>
            </div>
          )}
        </div>
      </div>
    </Section>
  )
}
