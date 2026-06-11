import { useEffect, useState } from 'preact/hooks'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../../lib/admin/api'
import { useConfig } from '../../../lib/admin/store'
import { Button } from '../ui/Button'
import { Chip } from '../ui/Chip'
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
    <label class="block text-sm font-medium text-body-muted mb-1.5">
      {children}
    </label>
  )
}

function inputCls() {
  return 'w-full px-3 py-2 bg-canvas border border-border rounded-xs text-base font-body focus:outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/20'
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

  const cat = (categories ?? []).find((c) => c.slug === selectedCategory)

  useEffect(() => {
    if (cat) {
      setLocalMeta(JSON.parse(JSON.stringify(cat.meta || {})))
    }
  }, [selectedCategory, cat?.slug])

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
      <div class="max-w-3xl">
        <h2 class="font-display font-display text-3xl sm:text-4xl text-ink mb-2">
          Categories
        </h2>
        <p class="text-base text-muted mb-6">
          Manage photo categories and their _meta.yaml settings.
        </p>
        <div class="border border-border-light rounded-md p-12 text-center">
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
    <div class="max-w-4xl">
      <div class="mb-6">
        <h2 class="text-xs font-mono uppercase tracking-wider text-accent mb-2">
          photos
        </h2>
        <p class="text-base text-muted mt-2">
          Manage photo categories and their _meta.yaml settings.
        </p>
      </div>
      <div class="flex flex-wrap gap-2 mb-8">
        {categories.map((c) => {
          const coverFile = (c.meta?.cover as string) || c.photos[0]
          return (
            <button
              key={c.slug}
              type="button"
              onClick={() => {
                if (selectedCategory !== c.slug) {
                  flushSave().then(() => setSelectedCategory(c.slug))
                }
              }}
              class="group"
            >
              <Chip active={c.slug === selectedCategory}>
                {coverFile && (
                  <img
                    src={`/photos/thumbs/${c.slug}/${coverFile.replace(/\.[^.]+$/, '.webp')}`}
                    alt=""
                    loading="lazy"
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                    }}
                    class="inline-block w-7 h-5 object-cover rounded-xs mr-2 align-middle bg-surface"
                  />
                )}
                {c.slug}
              </Chip>
            </button>
          )
        })}
      </div>
      {cat && (
        <>
        <div class="space-y-6">
          <Section title={cat.slug}>
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
                class={inputCls()}
              />
            </div>
            <div>
              <FieldLabel>Cover</FieldLabel>
              <select
                value={(localMeta.cover as string) || cat.photos[0]}
                onChange={(e) =>
                  setMeta('cover', (e.currentTarget as HTMLSelectElement).value)
                }
                class={inputCls()}
              >
                {cat.photos.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Order</FieldLabel>
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
            <div class="flex items-center justify-between">
              <span class="text-sm text-ink">
                Offer Service
              </span>
              <label class="inline-flex items-center gap-3 cursor-pointer select-none">
                <span class="relative inline-block w-10 h-[22px] flex-shrink-0">
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
                  <span class="absolute inset-0 bg-border rounded-pill peer-checked:bg-primary transition-colors" />
                  <span class="absolute left-[3px] bottom-[3px] h-4 w-4 bg-canvas rounded-full transition-transform peer-checked:translate-x-[18px]" />
                </span>
              </label>
            </div>
          </Section>
          <Section title="Photos">
            <div class="space-y-4">
              {cat.photos.map((filename) => {
                const photoMeta =
                  ((localMeta.photos as Record<string, PhotoMeta>) || {})[filename] || {}
                const isCover =
                  ((localMeta.cover as string) || cat.photos[0]) === filename
                const heroPriority = photoMeta.hero_priority ?? 0
                return (
                  <div
                    key={filename}
                    class="grid grid-cols-1 md:grid-cols-2 gap-4 border border-border-light rounded-md p-4 bg-canvas"
                  >
                    <div class="flex items-center">
                      <img
                        src={`/photos/thumbs/${cat.slug}/${filename.replace(/\.[^.]+$/, '.webp')}`}
                        alt={filename}
                        loading="lazy"
                        onError={(e) => {
                          ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                        }}
                        class="w-full max-h-64 object-contain rounded-sm bg-border-light"
                      />
                    </div>
                    <div class="space-y-3">
                      <div class="flex items-center justify-between">
                        <span class="text-sm font-mono text-ink">
                          {filename}
                        </span>
                        {isCover ? (
                          <span class="text-xs font-mono uppercase tracking-wider px-2 py-1 rounded-xs bg-primary text-primary-text">
                            ★ Cover
                          </span>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => makeCover(filename)}
                          >
                            Make cover
                          </Button>
                        )}
                      </div>
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
                          class={inputCls()}
                        />
                      </div>
                      <div>
                        <FieldLabel>Hero priority</FieldLabel>
                        <div class="flex items-center gap-3">
                          <input
                            type="range"
                            min={0}
                            max={5}
                            value={heroPriority}
                            onInput={(e) =>
                              setPhotoField(
                                filename,
                                'hero_priority',
                                Number((e.currentTarget as HTMLInputElement).value),
                              )
                            }
                            class="flex-1 accent-primary"
                          />
                          <span class="text-sm text-body-muted w-8 text-center font-mono">
                            {heroPriority}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPhotoField(filename, 'hero_priority', 0)}
                          >
                            reset
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>
        </div>
          <div class="mt-8 flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              onClick={saveAll}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving…' : 'Save category'}
            </Button>
            <span class="text-xs font-mono uppercase tracking-wider text-muted">
              Writes to {cat.slug}/_meta.yaml
            </span>
          </div>
        </>
      )}
    </div>
  )
}
