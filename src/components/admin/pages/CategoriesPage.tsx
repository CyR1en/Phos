import { useEffect, useState } from 'preact/hooks'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../../lib/admin/api'
import { useConfig } from '../../../lib/admin/store'
import { Button } from '../ui/Button'
import { Section } from '../ui/Section'

type PhotoMeta = { title?: string; description?: string; hero_priority?: number }

function cleanMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined || v === '') continue
    if (typeof v === 'object' && v !== null && Object.keys(v).length === 0) continue
    out[k] = v
  }
  return out
}

function FieldLabel({ children }: { children: string }) {
  return (
    <label class="text-sm font-medium text-ink block mb-1.5">
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

export function CategoriesPage() {
  const {
    categories,
    selectedCategory,
    setSelectedCategory,
    flushSave,
    pushToast,
  } = useConfig()
  const queryClient = useQueryClient()
  const [localMeta, setLocalMeta] = useState<Record<string, unknown>>({})
  const [selectedPhotoFilename, setSelectedPhotoFilename] = useState<string | null>(null)

  const cat = (categories ?? []).find((c) => c.slug === selectedCategory)

  useEffect(() => {
    if (cat) {
      setLocalMeta(JSON.parse(JSON.stringify(cat.meta || {})))
    }
  }, [selectedCategory, cat?.slug])

  useEffect(() => {
    if (cat && cat.photos.length > 0) {
      if (!cat.photos.includes(selectedPhotoFilename || '')) {
        setSelectedPhotoFilename(cat.photos[0])
      }
    } else {
      setSelectedPhotoFilename(null)
    }
  }, [cat?.slug])

  const saveMutation = useMutation({
    mutationFn: ({ slug, meta }: { slug: string; meta: Record<string, unknown> }) =>
      api.putCategory(slug, cleanMeta(meta)),
    onSuccess: () => {
      pushToast('success', 'Category saved')
      queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
    onError: (e: unknown) => {
      pushToast('error', e instanceof ApiError ? e.message : 'Save failed')
    },
  })

  if (!categories || categories.length === 0) {
    return (
      <div class="max-w-3xl space-y-6">
        <div class="space-y-1">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-primary font-mono">
            Photos
          </h2>
          <h1 class="font-display text-3xl font-bold text-ink">
            Categories
          </h1>
          <p class="text-sm text-body-muted">
            Manage photo categories and their settings.
          </p>
        </div>
        <div class="border border-dashed border-border rounded-sm p-12 text-center bg-surface/30">
          <p class="text-muted">
            No categories found. Add photo folders to <code class="font-mono text-ink">photos/</code> and republish.
          </p>
        </div>
      </div>
    )
  }

  const setMeta = (key: string, value: unknown) => {
    setLocalMeta((m) => ({ ...m, [key]: value }))
  }

  const setPhotoField = (filename: string, key: keyof PhotoMeta, value: unknown) => {
    setLocalMeta((m) => {
      const photos = { ...((m.photos as Record<string, PhotoMeta>) || {}) }
      photos[filename] = { ...(photos[filename] || {}), [key]: value }
      if (value === undefined || value === '') {
        delete photos[filename][key]
        if (Object.keys(photos[filename]).length === 0) delete photos[filename]
      }
      return { ...m, photos }
    })
  }

  const makeCover = (filename: string) => setMeta('cover', filename)

  const saveAll = async () => {
    if (!cat) return
    await flushSave()
    saveMutation.mutate({ slug: cat.slug, meta: localMeta })
  }

  return (
    <div class="max-w-4xl space-y-8">
      <div class="space-y-1">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-primary font-mono">
          Photos
        </h2>
        <h1 class="font-display text-3xl font-bold text-ink">
          Categories
        </h1>
        <p class="text-sm text-body-muted">
          Manage photo categories and their _meta.yaml settings.
        </p>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 mb-8">
        {categories.map((c) => {
          const coverFile = (c.meta?.cover as string) || c.photos[0]
          const isActive = c.slug === selectedCategory
          const thumbName = coverFile ? coverFile.replace(/\.[^.]+$/, '.webp') : ''
          return (
            <button
              key={c.slug}
              type="button"
              onClick={() => {
                if (selectedCategory !== c.slug) {
                  flushSave().then(() => setSelectedCategory(c.slug))
                }
              }}
              class={`flex flex-col items-stretch p-2.5 rounded-sm border text-left transition-all duration-150 cursor-pointer ${
                isActive
                  ? 'bg-surface border-primary ring-1 ring-primary text-ink shadow-xs'
                  : 'bg-surface/50 border-border text-muted hover:border-border-hover hover:text-ink hover:bg-surface'
              }`}
            >
              <div class="aspect-[4/3] rounded-xs overflow-hidden bg-canvas mb-2 border border-border-light relative">
                {coverFile ? (
                  <img
                    src={`/photos/thumbs/${c.slug}/${thumbName}`}
                    alt=""
                    loading="lazy"
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                    }}
                    class="w-full h-full object-cover"
                  />
                ) : (
                  <div class="w-full h-full flex items-center justify-center text-xs text-muted bg-canvas">
                    No image
                  </div>
                )}
                <div class="absolute bottom-1 right-1 bg-black/60 backdrop-blur-xs text-[10px] text-white px-1.5 py-0.5 rounded-xs font-mono">
                  {c.photos.length}
                </div>
              </div>
              <div class="truncate text-xs font-medium text-ink">
                {c.meta?.name || c.slug}
              </div>
              <div class="text-[10px] text-muted truncate font-mono mt-0.5">
                {c.slug}
              </div>
            </button>
          )
        })}
      </div>

      {cat && (
        <>
          <div class="space-y-8">
            <Section title={cat.slug} description="General metadata settings for this photo category.">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="space-y-4">
                  <div>
                    <FieldLabel>Name</FieldLabel>
                    <input
                      type="text"
                      value={(localMeta.name as string) || ''}
                      onInput={(e) =>
                        setMeta('name', (e.currentTarget as HTMLInputElement).value)
                      }
                      class={inputCls()}
                    />
                  </div>
                  <div>
                    <FieldLabel>Cover Photo</FieldLabel>
                    <div class="relative">
                      <select
                        value={(localMeta.cover as string) || cat.photos[0]}
                        onChange={(e) =>
                          setMeta('cover', (e.currentTarget as HTMLSelectElement).value)
                        }
                        class={`${inputCls()} appearance-none pr-8`}
                      >
                        {cat.photos.map((p) => (
                          <option key={p} value={p}>
                            {p}
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
                <div class="space-y-4">
                  <div>
                    <FieldLabel>Order Index</FieldLabel>
                    <input
                      type="number"
                      value={
                        localMeta.order === undefined || localMeta.order === null
                          ? ''
                          : String(localMeta.order)
                      }
                      onInput={(e) => {
                        const v = (e.currentTarget as HTMLInputElement).value
                        setMeta('order', v === '' ? undefined : Number(v))
                      }}
                      class={inputCls()}
                    />
                  </div>
                  <div class="flex items-center justify-between py-2 border border-border rounded-sm p-4 bg-canvas/30 shadow-2xs">
                    <div>
                      <span class="text-sm font-medium text-ink block">Offer Service</span>
                      <span class="text-xs text-muted">Show as a service card on home page</span>
                    </div>
                    <label class="inline-flex items-center gap-3 cursor-pointer select-none">
                      <span class="relative inline-block w-9 h-5 flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={localMeta.offer_service !== false}
                          onChange={(e) =>
                            setMeta(
                              'offer_service',
                              (e.currentTarget as HTMLInputElement).checked,
                            )
                          }
                          class="sr-only peer"
                        />
                        <span class="absolute inset-0 bg-border rounded-full peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-border-focus peer-focus-visible:ring-offset-2 transition-all duration-200" />
                        <span class="absolute left-[2px] top-[2px] h-4 w-4 bg-canvas rounded-full shadow-xs transition-transform duration-200 peer-checked:translate-x-[16px]" />
                      </span>
                    </label>
                  </div>
                </div>
              </div>
              <div>
                <FieldLabel>Description</FieldLabel>
                <textarea
                  rows={2}
                  value={(localMeta.description as string) || ''}
                  onInput={(e) =>
                    setMeta(
                      'description',
                      (e.currentTarget as HTMLTextAreaElement).value,
                    )
                  }
                  class={textareaCls()}
                />
              </div>
            </Section>

            <Section title="Photos" description="Configure titles, descriptions, and homepage slideshow priorities for individual photos.">
              <div class="grid grid-cols-1 md:grid-cols-12 gap-6">
                {/* Left pane: compact grid of thumbnails */}
                <div class="md:col-span-5 space-y-3">
                  <p class="text-xs font-semibold uppercase tracking-wider text-muted font-mono">
                    Select photo
                  </p>
                  <div class="grid grid-cols-4 gap-2 overflow-y-auto max-h-[500px] p-2.5 border border-border rounded-sm bg-canvas/50">
                    {cat.photos.map((filename) => {
                      const isSelected = selectedPhotoFilename === filename
                      const isCover = ((localMeta.cover as string) || cat.photos[0]) === filename
                      const thumbName = filename.replace(/\.[^.]+$/, '.webp')
                      return (
                        <button
                          key={filename}
                          type="button"
                          onClick={() => setSelectedPhotoFilename(filename)}
                          class={`relative aspect-square rounded-xs overflow-hidden border-2 cursor-pointer transition-all ${
                            isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-transparent hover:border-border'
                          }`}
                        >
                          <img
                            src={`/photos/thumbs/${cat.slug}/${thumbName}`}
                            alt={filename}
                            loading="lazy"
                            class="w-full h-full object-cover"
                          />
                          {isCover && (
                            <span class="absolute top-0.5 right-0.5 size-4 bg-primary text-primary-text rounded-full flex items-center justify-center text-[10px] shadow-xs">
                              ★
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Right pane: detail editor for the selected photo */}
                <div class="md:col-span-7">
                  {selectedPhotoFilename ? (() => {
                    const filename = selectedPhotoFilename
                    const photoMeta =
                      ((localMeta.photos as Record<string, PhotoMeta>) || {})[filename] || {}
                    const isCover =
                      ((localMeta.cover as string) || cat.photos[0]) === filename
                    const heroPriority = photoMeta.hero_priority ?? 0
                    return (
                      <div class="border border-border rounded-sm p-5 bg-surface/30 shadow-2xs space-y-5">
                        <div class="flex items-center justify-between border-b border-border-light pb-3 gap-4">
                          <span class="text-xs font-mono font-medium text-ink truncate block flex-1" title={filename}>
                            {filename}
                          </span>
                          {isCover ? (
                            <span class="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-sm bg-primary text-primary-text flex-shrink-0 shadow-2xs">
                              ★ Cover Photo
                            </span>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => makeCover(filename)}
                              class="flex-shrink-0"
                            >
                              Set as Cover
                            </Button>
                          )}
                        </div>

                        <div class="space-y-5">
                          <div class="w-full flex items-center justify-center bg-canvas/30 rounded-sm p-3 border border-border">
                            <img
                              src={`/photos/thumbs/${cat.slug}/${filename.replace(/\.[^.]+$/, '.webp')}`}
                              alt={filename}
                              loading="lazy"
                              onError={(e) => {
                                ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                              }}
                              class="max-h-64 object-contain rounded-xs bg-border-light shadow-sm"
                            />
                          </div>

                          <div class="space-y-4">
                            <div>
                              <FieldLabel>Title</FieldLabel>
                              <input
                                type="text"
                                value={photoMeta.title || ''}
                                onInput={(e) =>
                                  setPhotoField(
                                    filename,
                                    'title',
                                    (e.currentTarget as HTMLInputElement).value || undefined,
                                  )
                                }
                                class={inputCls()}
                              />
                            </div>
                            <div>
                              <FieldLabel>Description</FieldLabel>
                              <textarea
                                rows={2}
                                value={photoMeta.description || ''}
                                onInput={(e) =>
                                  setPhotoField(
                                    filename,
                                    'description',
                                    (e.currentTarget as HTMLTextAreaElement).value || undefined,
                                  )
                                }
                                class={textareaCls()}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })() : (
                    <div class="border border-dashed border-border rounded-sm p-12 text-center bg-surface/20">
                      <p class="text-sm text-muted">Select a photo from the grid to edit its details.</p>
                    </div>
                  )}
                </div>
              </div>
            </Section>
          </div>
          <div class="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
            <div class="flex items-center gap-2">
              <Button
                variant="primary"
                onClick={saveAll}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Saving…' : 'Save Category'}
              </Button>
              <span class="text-xs font-mono text-muted uppercase tracking-wider">
                Writes to {cat.slug}/_meta.yaml
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
