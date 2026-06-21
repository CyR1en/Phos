import { useEffect, useState } from 'preact/hooks'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../../lib/admin/api'
import { useConfig } from '../../../lib/admin/store'
import type { Gallery, GalleryPhoto } from '../../../lib/admin/types'
import { Button } from '../ui/Button'
import { Section } from '../ui/Section'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '../../ui/alert-dialog'

function FieldLabel({ children, htmlFor }: { children: string; htmlFor?: string }) {
  return (
    <label for={htmlFor} class="text-sm font-medium text-ink block mb-1.5">
      {children}
    </label>
  )
}

function inputCls() {
  return 'flex h-9.5 w-full rounded-sm border border-border bg-canvas px-3 py-1 text-sm shadow-2xs transition-colors placeholder:text-muted hover:border-border-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus focus-visible:border-border-focus disabled:cursor-not-allowed disabled:opacity-50'
}

function textareaCls() {
  return 'flex min-h-[60px] w-full rounded-sm border border-border bg-canvas px-3 py-2 text-sm shadow-2xs transition-colors placeholder:text-muted hover:border-border-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus focus-visible:border-border-focus disabled:cursor-not-allowed disabled:opacity-50 resize-y'
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
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [isAlertOpen, setIsAlertOpen] = useState(false)

  const handleDragStart = (e: DragEvent, index: number) => {
    setDraggedIndex(index)
    setIsDragging(true)
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
    }
  }

  const handleDragEnter = (index: number) => {
    if (draggedIndex === null || draggedIndex === index) return

    setSelectedPhotos((prev) => {
      const list = [...prev]
      const draggedItem = list[draggedIndex]
      list.splice(draggedIndex, 1)
      list.splice(index, 0, draggedItem)
      return list.map((p, idx) => ({ ...p, position: idx }))
    })
    setIsDirty(true)
    setDraggedIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setTimeout(() => setIsDragging(false), 50)
  }

  useEffect(() => {
    const win = window as any
    if (win.HSStaticMethods?.autoInit) {
      requestAnimationFrame(() => win.HSStaticMethods.autoInit())
    }
  }, [])

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<Gallery>) => api.updateGallery(gallery.slug, updates),
    onSuccess: () => {
      pushToast('success', 'Gallery saved')
      setIsDirty(false)
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
      setIsDirty(false)
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
    setIsDirty(true)
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

  const movePhoto = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= selectedPhotos.length) return
    setSelectedPhotos((prev) => {
      const list = [...prev]
      const [movedItem] = list.splice(fromIndex, 1)
      list.splice(toIndex, 0, movedItem)
      return list.map((p, idx) => ({ ...p, position: idx }))
    })
    setIsDirty(true)
  }

  const handleBack = () => {
    if (isDirty) {
      setIsAlertOpen(true)
    } else {
      onBack()
    }
  }

  return (
    <div class="max-w-4xl space-y-8">
      <div>
        <button
          type="button"
          onClick={handleBack}
          class="text-xs font-semibold text-muted hover:text-ink flex items-center gap-1.5 mb-4 transition-colors cursor-pointer"
        >
          <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to Galleries
        </button>
        <div class="space-y-1">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-primary font-mono">
            Gallery Editor
          </h2>
          <h1 class="font-display text-3xl font-bold text-ink">
            {gallery.name}
          </h1>
        </div>
      </div>

      <div class="space-y-8">
        <Section title="Details" description="Configure gallery identification, description, and display ordering.">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-4">
              <div>
                <FieldLabel htmlFor="gallery-name">Name</FieldLabel>
                <input
                  id="gallery-name"
                  type="text"
                  value={name}
                  onInput={(e) => {
                    setName((e.currentTarget as HTMLInputElement).value)
                    setIsDirty(true)
                  }}
                  class={inputCls()}
                />
              </div>
              <div>
                <FieldLabel htmlFor="gallery-order">Order Index</FieldLabel>
                <input
                  id="gallery-order"
                  type="number"
                  value={orderNum}
                  onInput={(e) => {
                    setOrderNum(Number((e.currentTarget as HTMLInputElement).value))
                    setIsDirty(true)
                  }}
                  class={inputCls()}
                />
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="gallery-description">Description</FieldLabel>
              <textarea
                id="gallery-description"
                rows={4}
                value={description}
                onInput={(e) => {
                  setDescription((e.currentTarget as HTMLTextAreaElement).value)
                  setIsDirty(true)
                }}
                class={textareaCls()}
              />
            </div>
          </div>
          <div class="flex pt-2">
            <Button variant="primary" onClick={saveMeta} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save Details'}
            </Button>
          </div>
        </Section>

        <Section title="Gallery Photos" description="Drag and drop to reorder photos. Click a photo to set it as the gallery cover.">
          {gallery.cover && (
            <div class="p-3 bg-canvas/30 rounded-sm border border-border text-xs text-ink flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs mb-4">
              <span class="text-muted">Current Cover Reference</span>
              <div class="overflow-x-auto max-w-full">
                <code class="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-surface border border-border text-primary block whitespace-nowrap">
                  {gallery.cover}
                </code>
              </div>
            </div>
          )}
          {selectedPhotos.length === 0 ? (
            <div class="border border-dashed border-border rounded-sm p-12 text-center bg-surface/20">
              <p class="text-sm text-muted">Add photos to the gallery first to set a cover.</p>
            </div>
          ) : (
            <div class="space-y-6">
              <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3.5 p-3 border border-border rounded-sm bg-canvas/40 shadow-2xs">
                {selectedPhotos.map((p, index) => {
                  const coverRef = `${p.category}/${p.filename}`
                  const isCover = gallery.cover === coverRef
                  const thumbName = p.filename.replace(/\.[^.]+$/, '.webp')
                  return (
                    <div
                      key={coverRef}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragEnter={() => handleDragEnter(index)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      onClick={() => {
                        if (isDragging) return
                        setCoverPhoto(p)
                      }}
                      class={`relative group/photo aspect-[4/3] rounded-xs overflow-hidden border-2 cursor-grab active:cursor-grabbing transition-all select-none ${
                        draggedIndex === index
                          ? 'opacity-40 scale-95 border-dashed border-primary'
                          : isCover
                            ? 'border-primary shadow-xs'
                            : 'border-transparent hover:border-border'
                      }`}
                    >
                      <img
                        src={`/photos/thumbs/${p.category}/${thumbName}`}
                        alt={p.filename}
                        loading="lazy"
                        class="w-full h-full object-cover pointer-events-none"
                      />
                      <div class="absolute top-1 left-1 flex flex-col gap-1 opacity-0 group-hover/photo:opacity-100 focus-within:opacity-100 transition-opacity z-10">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            movePhoto(index, index - 1)
                          }}
                          disabled={index === 0}
                          aria-label={`Move ${p.filename} up`}
                          class="h-7 w-7 flex items-center justify-center bg-surface/80 rounded-xs hover:bg-surface disabled:opacity-30 border border-border text-ink transition-colors cursor-pointer"
                        >
                          <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="18 15 12 9 6 15" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            movePhoto(index, index + 1)
                          }}
                          disabled={index === selectedPhotos.length - 1}
                          aria-label={`Move ${p.filename} down`}
                          class="h-7 w-7 flex items-center justify-center bg-surface/80 rounded-xs hover:bg-surface disabled:opacity-30 border border-border text-ink transition-colors cursor-pointer"
                        >
                          <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                      </div>
                      {isCover && (
                        <span class="absolute top-1 right-1 text-[11px] font-semibold bg-primary text-primary-text px-1.5 py-0.5 rounded-xs pointer-events-none shadow-sm">
                          Cover
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              <div class="flex">
                <Button variant="primary" onClick={savePhotos} disabled={photosMutation.isPending}>
                  {photosMutation.isPending ? 'Saving...' : 'Save Photo Order'}
                </Button>
              </div>
            </div>
          )}
        </Section>

        <Section title="Source Photos" description="Select photos from your categories to include in this gallery.">
          <div class="hs-accordion-group space-y-3">
            {categories.map((cat) => {
              const selectedInCat = selectedPhotos.filter((p) => p.category === cat.slug).length
              return (
                <div key={cat.slug} class="hs-accordion border border-border rounded-sm overflow-hidden bg-surface/30 shadow-2xs" id={`hs-cat-${cat.slug}`}>
                  <button
                    type="button"
                    class="hs-accordion-toggle w-full flex items-center justify-between px-4 py-3 bg-surface/70 hover:bg-surface transition-colors disabled:opacity-50 cursor-pointer"
                    aria-expanded="false"
                    aria-controls={`hs-cat-${cat.slug}-content`}
                  >
                    <span class="text-sm font-medium text-ink flex items-center gap-2">
                      {cat.slug}
                      {selectedInCat > 0 && (
                        <span class="text-xs font-semibold bg-primary text-primary-text px-2 py-0.5 rounded-sm shadow-2xs tabular-nums">
                          {selectedInCat} selected
                        </span>
                      )}
                    </span>
                    <svg
                      class="hs-accordion-active:rotate-180 size-4 text-muted transition-transform duration-300"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  <div
                    id={`hs-cat-${cat.slug}-content`}
                    class="hs-accordion-content hidden w-full overflow-hidden transition-[height] duration-300 bg-canvas/20"
                    role="region"
                    aria-labelledby={`hs-cat-${cat.slug}`}
                  >
                    <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3.5 p-4">
                      {cat.photos.map((filename) => {
                        const selected = isPhotoSelected(cat.slug, filename)
                        const thumbName = filename.replace(/\.[^.]+$/, '.webp')
                        return (
                          <button
                            key={filename}
                            type="button"
                            onClick={() => togglePhoto(cat.slug, filename)}
                            class={`relative aspect-[4/3] rounded-xs overflow-hidden border-2 cursor-pointer transition-all ${
                              selected ? 'border-primary ring-1 ring-primary' : 'border-transparent hover:border-border'
                            }`}
                          >
                            <img
                              src={`/photos/thumbs/${cat.slug}/${thumbName}`}
                              alt={filename}
                              loading="lazy"
                              class="w-full h-full object-cover"
                            />
                            {selected && (
                              <span class="absolute top-1 right-1 size-4 bg-primary text-primary-text rounded-full flex items-center justify-center text-xs shadow-xs font-bold">
                                ✓
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div class="flex pt-2">
            <Button variant="primary" onClick={savePhotos} disabled={photosMutation.isPending}>
              {photosMutation.isPending ? 'Saving...' : `Save Photos (${selectedPhotos.length})`}
            </Button>
          </div>
        </Section>
      </div>

      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        {(<AlertDialogContent>
          {(<AlertDialogHeader>
            {(<AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>) as any}
            {(<AlertDialogDescription>
              You have unsaved changes to this gallery. Returning will lose them.
            </AlertDialogDescription>) as any}
          </AlertDialogHeader>) as any}
          {(<AlertDialogFooter>
            {(<AlertDialogCancel onClick={() => setIsAlertOpen(false)}>Cancel</AlertDialogCancel>) as any}
            {(<AlertDialogAction onClick={() => { setIsDirty(false); setIsAlertOpen(false); onBack(); }}>Discard</AlertDialogAction>) as any}
          </AlertDialogFooter>) as any}
        </AlertDialogContent>) as any}
      </AlertDialog>
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
  const [confirmDeleteGallery, setConfirmDeleteGallery] = useState<Gallery | null>(null)
  const [pendingDeletes, setPendingDeletes] = useState<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    return () => {
      Object.values(pendingDeletes).forEach(clearTimeout)
    }
  }, [pendingDeletes])

  const executeDelete = (g: Gallery) => {
    setConfirmDeleteGallery(null)
    const timer = setTimeout(() => {
      deleteMutation.mutate(g.slug)
      setPendingDeletes((prev) => {
        const next = { ...prev }
        delete next[g.slug]
        return next
      })
    }, 5000)
    setPendingDeletes((prev) => ({ ...prev, [g.slug]: timer }))
  }

  const handleUndo = (slug: string) => {
    const timer = pendingDeletes[slug]
    if (timer) {
      clearTimeout(timer)
      setPendingDeletes((prev) => {
        const next = { ...prev }
        delete next[slug]
        return next
      })
    }
  }

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
    <div class="max-w-4xl space-y-8">
      <div class="flex items-center justify-between gap-4 border-b border-border pb-6">
        <div class="space-y-1">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-primary font-mono">
            Portfolio
          </h2>
          <h1 class="font-display text-3xl font-bold text-ink">
            Galleries
          </h1>
          <p class="text-sm text-body-muted leading-relaxed">
            Curate photo collections that tell stories. Galleries pull photos from your categories without duplicating files.
          </p>
        </div>
        {!showCreate && (
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            <svg class="size-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Gallery
          </Button>
        )}
      </div>

      {showCreate && (
        <Section title="New Gallery" description="Enter details to create a new curated photo collection.">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-4">
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
            </div>
            <div>
              <FieldLabel>Description</FieldLabel>
              <textarea
                rows={3}
                value={newDescription}
                onInput={(e) => setNewDescription((e.currentTarget as HTMLTextAreaElement).value)}
                placeholder="What story does this gallery tell?"
                class={textareaCls()}
              />
            </div>
          </div>
          <div class="flex gap-3 pt-2">
            <Button
              variant="primary"
              onClick={() => createMutation.mutate()}
              disabled={!newName.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create Gallery'}
            </Button>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
        </Section>
      )}

      {galleriesQuery.isLoading ? (
        <div class="flex items-center justify-center p-12">
          <svg class="animate-spin h-6 w-6 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          <span class="ml-3 text-sm text-muted">Loading galleries...</span>
        </div>
      ) : galleries.length === 0 ? (
        <div class="border border-dashed border-border rounded-sm p-12 text-center bg-surface/20">
          <p class="text-sm text-muted">
            No galleries yet. Create one to start curating photo collections.
          </p>
        </div>
      ) : (
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {galleries.map((g) => {
            const isPendingDelete = !!pendingDeletes[g.slug]
            if (isPendingDelete) {
              return (
                <div
                  key={g.slug}
                  class="border border-dashed border-border rounded-sm p-5 bg-surface/20 flex flex-col justify-center items-center gap-3 text-center h-full min-h-[220px]"
                >
                  <div class="space-y-1">
                    <p class="text-sm font-semibold text-ink">"{g.name}" deleted</p>
                    <p class="text-xs text-muted">You have 5 seconds to undo this action.</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => handleUndo(g.slug)}>
                    Undo
                  </Button>
                </div>
              )
            }
            return (
              <div
                key={g.slug}
                /* Elevation scale: cards=shadow-2xs, hover=shadow-sm, popovers=shadow-md, overlays=shadow-2xl */
                class="group border border-border rounded-sm overflow-hidden bg-surface hover:border-border-hover hover:shadow-sm transition-all duration-200 flex flex-col h-full"
              >
                {g.cover ? (() => {
                  const [cat, file] = g.cover.split('/')
                  const thumbName = file?.replace(/\.[^.]+$/, '.webp')
                  return (
                    <div class="aspect-[16/10] bg-canvas overflow-hidden border-b border-border-light relative">
                      <img
                        src={`/photos/thumbs/${cat}/${thumbName}`}
                        alt={g.name}
                        loading="lazy"
                        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <span class="absolute bottom-2 right-2 bg-black/60 backdrop-blur-xs text-xs text-white px-2 py-0.5 rounded-xs font-mono shadow-2xs tabular-nums">
                        {g.photo_count} photo{g.photo_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )
                })() : (
                  <div class="aspect-[16/10] bg-canvas flex items-center justify-center border-b border-border-light">
                    <span class="text-xs text-muted">No cover image</span>
                  </div>
                )}
                <div class="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div class="space-y-1.5">
                    <h3 class="font-display text-xl font-semibold text-ink leading-tight">{g.name}</h3>
                    {g.description && (
                      <p class="text-sm text-muted line-clamp-2 leading-relaxed">{g.description}</p>
                    )}
                  </div>
                  <div class="flex items-center gap-2 pt-4 border-t border-border-light/40">
                    <Button variant="secondary" size="sm" onClick={() => setEditingSlug(g.slug)}>
                      <svg class="size-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDeleteGallery(g)}
                      class="text-error hover:text-error hover:bg-error/10"
                    >
                      <svg class="size-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <AlertDialog open={!!confirmDeleteGallery} onOpenChange={(open) => { if (!open) setConfirmDeleteGallery(null); }}>
        {(<AlertDialogContent>
          {(<AlertDialogHeader>
            {(<AlertDialogTitle>Delete gallery?</AlertDialogTitle>) as any}
            {(<AlertDialogDescription>
              This will permanently delete '{confirmDeleteGallery?.name}'. This action cannot be undone.
            </AlertDialogDescription>) as any}
          </AlertDialogHeader>) as any}
          {(<AlertDialogFooter>
            {(<AlertDialogCancel onClick={() => setConfirmDeleteGallery(null)}>Cancel</AlertDialogCancel>) as any}
            {(<AlertDialogAction
              onClick={() => {
                if (confirmDeleteGallery) {
                  executeDelete(confirmDeleteGallery)
                }
              }}
              className="bg-error text-error-text hover:bg-error/90"
            >
              Delete
            </AlertDialogAction>) as any}
          </AlertDialogFooter>) as any}
        </AlertDialogContent>) as any}
      </AlertDialog>
    </div>
  )
}
