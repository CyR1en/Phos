import { useEffect, useState } from 'preact/hooks'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../../lib/admin/api'
import { useConfig } from '../../../lib/admin/store'
import type { Gallery, GalleryPhoto } from '../../../lib/admin/types'
import { Button } from '../ui/Button'
import { Section } from '../ui/Section'

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

function GalleryEditor({
  gallery,
  categories,
  onBack,
}: {
  gallery: Gallery
  categories: { slug: string; photos: string[] }[]
  onBack: () => void
}) {
  const { pushToast } = useConfig()
  const queryClient = useQueryClient()
  const [name, setName] = useState(gallery.name)
  const [description, setDescription] = useState(gallery.description)
  const [orderNum, setOrderNum] = useState(gallery.order_num)
  const [selectedPhotos, setSelectedPhotos] = useState<GalleryPhoto[]>(gallery.photos)
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<Gallery>) => api.updateGallery(gallery.slug, updates),
    onSuccess: () => {
      pushToast('success', 'Gallery saved')
      queryClient.invalidateQueries({ queryKey: ['galleries'] })
    },
    onError: (e: unknown) => {
      pushToast('error', e instanceof ApiError ? e.message : 'Save failed')
    },
  })

  const photosMutation = useMutation({
    mutationFn: (photos: GalleryPhoto[]) =>
      api.setGalleryPhotos(gallery.slug, photos),
    onSuccess: () => {
      pushToast('success', 'Photos updated')
      queryClient.invalidateQueries({ queryKey: ['galleries'] })
    },
    onError: (e: unknown) => {
      pushToast('error', e instanceof ApiError ? e.message : 'Failed to update photos')
    },
  })

  const isPhotoSelected = (cat: string, filename: string) =>
    selectedPhotos.some((p) => p.category === cat && p.filename === filename)

  const togglePhoto = (cat: string, filename: string) => {
    setSelectedPhotos((prev) => {
      if (prev.some((p) => p.category === cat && p.filename === filename)) {
        return prev.filter((p) => !(p.category === cat && p.filename === filename))
      }
      return [...prev, { category: cat, filename, position: prev.length }]
    })
  }

  const toggleCat = (slug: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  const saveMeta = () => {
    updateMutation.mutate({ name, description, order_num: orderNum })
  }

  const savePhotos = () => {
    photosMutation.mutate(selectedPhotos)
  }

  const setCoverPhoto = (photo: GalleryPhoto) => {
    updateMutation.mutate({ cover: `${photo.category}/${photo.filename}` })
  }

  return (
    <div class="max-w-4xl">
      <div class="mb-6">
        <button
          type="button"
          onClick={onBack}
          class="text-phos-caption text-phos-muted hover:text-phos-ink flex items-center gap-1 mb-3"
        >
          <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to galleries
        </button>
        <h2 class="text-phos-micro font-mono uppercase tracking-wider text-phos-coral mb-2">
          gallery
        </h2>
        <p class="font-display text-phos-heading text-phos-ink">
          {gallery.name}
        </p>
      </div>

      <div class="space-y-6">
        <Section title="Details">
          <div>
            <FieldLabel>Name</FieldLabel>
            <input
              type="text"
              value={name}
              onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
              class={inputCls()}
            />
          </div>
          <div>
            <FieldLabel>Description</FieldLabel>
            <textarea
              rows={3}
              value={description}
              onInput={(e) => setDescription((e.currentTarget as HTMLTextAreaElement).value)}
              class={inputCls()}
            />
          </div>
          <div>
            <FieldLabel>Order</FieldLabel>
            <input
              type="number"
              value={orderNum}
              onInput={(e) => setOrderNum(Number((e.currentTarget as HTMLInputElement).value))}
              class={inputCls()}
            />
          </div>
          <div class="flex gap-3">
            <Button variant="primary" onClick={saveMeta} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save details'}
            </Button>
          </div>
        </Section>

        <Section title="Cover Photo" description="Select a cover from the photos in this gallery.">
          {gallery.cover && (
            <p class="text-phos-caption text-phos-muted mb-2">
              Current: <code class="font-mono text-phos-ink">{gallery.cover}</code>
            </p>
          )}
          {selectedPhotos.length === 0 ? (
            <p class="text-phos-muted">Add photos to the gallery first to set a cover.</p>
          ) : (
            <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {selectedPhotos.map((p) => {
                const coverRef = `${p.category}/${p.filename}`
                const isCover = gallery.cover === coverRef
                const thumbName = p.filename.replace(/\.[^.]+$/, '.webp')
                return (
                  <button
                    key={coverRef}
                    type="button"
                    onClick={() => setCoverPhoto(p)}
                    class={`relative rounded-phos-xs overflow-hidden border-2 transition-colors ${
                      isCover ? 'border-phos-primary' : 'border-transparent hover:border-phos-hairline'
                    }`}
                  >
                    <img
                      src={`/photos/thumbs/${p.category}/${thumbName}`}
                      alt={p.filename}
                      loading="lazy"
                      class="w-full aspect-[4/3] object-cover"
                    />
                    {isCover && (
                      <span class="absolute top-1 right-1 text-phos-micro bg-phos-button text-phos-on-button px-1.5 py-0.5 rounded-phos-xs">
                        Cover
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </Section>

        <Section title="Photos" description="Select photos from your categories to include in this gallery.">
          <div class="space-y-3">
            {categories.map((cat) => {
              const isExpanded = expandedCats.has(cat.slug)
              const selectedInCat = selectedPhotos.filter((p) => p.category === cat.slug).length
              return (
                <div key={cat.slug} class="border border-phos-card-border rounded-phos-md overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleCat(cat.slug)}
                    class="w-full flex items-center justify-between px-4 py-3 bg-phos-stone hover:bg-phos-hairline transition-colors"
                  >
                    <span class="text-phos-caption font-medium text-phos-ink">
                      {cat.slug}
                      {selectedInCat > 0 && (
                        <span class="ml-2 text-phos-micro bg-phos-button text-phos-on-button px-2 py-0.5 rounded-phos-pill">
                          {selectedInCat}
                        </span>
                      )}
                    </span>
                    <svg
                      class={`size-4 text-phos-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {isExpanded && (
                    <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 p-3">
                      {cat.photos.map((filename) => {
                        const selected = isPhotoSelected(cat.slug, filename)
                        const thumbName = filename.replace(/\.[^.]+$/, '.webp')
                        return (
                          <button
                            key={filename}
                            type="button"
                            onClick={() => togglePhoto(cat.slug, filename)}
                            class={`relative rounded-phos-xs overflow-hidden border-2 transition-colors ${
                              selected ? 'border-phos-primary' : 'border-transparent hover:border-phos-hairline'
                            }`}
                          >
                            <img
                              src={`/photos/thumbs/${cat.slug}/${thumbName}`}
                              alt={filename}
                              loading="lazy"
                              class="w-full aspect-[4/3] object-cover"
                            />
                            {selected && (
                              <span class="absolute top-1 right-1 size-5 bg-phos-button text-phos-on-button rounded-full flex items-center justify-center text-xs">
                                ✓
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div class="flex gap-3 mt-4">
            <Button variant="primary" onClick={savePhotos} disabled={photosMutation.isPending}>
              {photosMutation.isPending ? 'Saving...' : `Save photos (${selectedPhotos.length})`}
            </Button>
          </div>
        </Section>
      </div>
    </div>
  )
}

export function GalleriesPage() {
  const { categories, pushToast } = useConfig()
  const queryClient = useQueryClient()
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const galleriesQuery = useQuery({
    queryKey: ['galleries'],
    queryFn: () => api.getGalleries(),
  })

  const createMutation = useMutation({
    mutationFn: () => api.createGallery(newName, newDescription),
    onSuccess: (gallery) => {
      pushToast('success', 'Gallery created')
      queryClient.invalidateQueries({ queryKey: ['galleries'] })
      setNewName('')
      setNewDescription('')
      setShowCreate(false)
      setEditingSlug(gallery.slug)
    },
    onError: (e: unknown) => {
      pushToast('error', e instanceof ApiError ? e.message : 'Create failed')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => api.deleteGallery(slug),
    onSuccess: () => {
      pushToast('success', 'Gallery deleted')
      queryClient.invalidateQueries({ queryKey: ['galleries'] })
      setEditingSlug(null)
    },
    onError: (e: unknown) => {
      pushToast('error', e instanceof ApiError ? e.message : 'Delete failed')
    },
  })

  const galleries = galleriesQuery.data?.galleries ?? []
  const editingGallery = galleries.find((g) => g.slug === editingSlug)

  if (editingGallery) {
    return (
      <GalleryEditor
        gallery={editingGallery}
        categories={categories ?? []}
        onBack={() => setEditingSlug(null)}
      />
    )
  }

  return (
    <div class="max-w-4xl">
      <div class="mb-6">
        <h2 class="text-phos-micro font-mono uppercase tracking-wider text-phos-coral mb-2">
          galleries
        </h2>
        <p class="text-phos-body text-phos-muted mt-2">
          Curate photo collections that tell stories. Galleries pull photos from your categories without duplicating them.
        </p>
      </div>

      <div class="mb-8">
        {showCreate ? (
          <Section title="New Gallery">
            <div>
              <FieldLabel>Title</FieldLabel>
              <input
                type="text"
                value={newName}
                onInput={(e) => setNewName((e.currentTarget as HTMLInputElement).value)}
                placeholder="e.g. Golden Hour, Behind the Scenes"
                class={inputCls()}
              />
            </div>
            <div>
              <FieldLabel>Description</FieldLabel>
              <textarea
                rows={2}
                value={newDescription}
                onInput={(e) => setNewDescription((e.currentTarget as HTMLTextAreaElement).value)}
                placeholder="What story does this gallery tell?"
                class={inputCls()}
              />
            </div>
            <div class="flex gap-3">
              <Button
                variant="primary"
                onClick={() => createMutation.mutate()}
                disabled={!newName.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating...' : 'Create gallery'}
              </Button>
              <Button variant="ghost" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </Section>
        ) : (
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            New gallery
          </Button>
        )}
      </div>

      {galleriesQuery.isLoading ? (
        <p class="text-phos-muted">Loading galleries...</p>
      ) : galleries.length === 0 ? (
        <div class="border border-phos-card-border rounded-phos-md p-12 text-center">
          <p class="text-phos-muted">
            No galleries yet. Create one to start curating photo collections.
          </p>
        </div>
      ) : (
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {galleries.map((g) => (
            <div
              key={g.slug}
              class="group border border-phos-card-border rounded-phos-md overflow-hidden bg-phos-canvas hover:border-phos-hairline transition-colors"
            >
              {g.cover && (() => {
                const [cat, file] = g.cover.split('/')
                const thumbName = file?.replace(/\.[^.]+$/, '.webp')
                return (
                  <div class="aspect-[16/10] bg-phos-stone overflow-hidden">
                    <img
                      src={`/photos/thumbs/${cat}/${thumbName}`}
                      alt={g.name}
                      loading="lazy"
                      class="w-full h-full object-cover"
                    />
                  </div>
                )
              })()}
              <div class="p-4">
                <h3 class="font-display text-phos-feature text-phos-ink">{g.name}</h3>
                {g.description && (
                  <p class="text-phos-caption text-phos-muted mt-1 line-clamp-2">{g.description}</p>
                )}
                <p class="text-phos-micro text-phos-muted mt-2">
                  {g.photo_count} photo{g.photo_count !== 1 ? 's' : ''}
                </p>
                <div class="flex gap-2 mt-3">
                  <Button variant="secondary" size="sm" onClick={() => setEditingSlug(g.slug)}>
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Delete "${g.name}"? This cannot be undone.`)) {
                        deleteMutation.mutate(g.slug)
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
