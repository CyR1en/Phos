import { useState } from 'preact/hooks'
import { ObjectField } from '../fields/ObjectField'
import { TextField } from '../fields/TextField'
import { Section } from '../ui/Section'
import { useConfig } from '../../../lib/admin/store'
import { ShowcaseSection } from './ShowcaseSection'

const FRIENDLY_NAMES: Record<string, string> = {
  subheading: 'Hero Subheading & Description',
  services: 'Services Section',
  immersiveGallery: 'Immersive Scroll Gallery',
  showcase: 'Showcase Grid (Categories & Galleries)',
  testimonials: 'Testimonials Section',
  cta: 'Call To Action (CTA) Section',
}

const DEFAULT_LAYOUT = ['subheading', 'services', 'immersiveGallery', 'showcase', 'testimonials', 'cta']

function DragHandleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="text-muted/60">
      <circle cx="9" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="15" cy="5" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="15" cy="19" r="1.5" />
    </svg>
  )
}

export function HomePage() {
  const { config, setValue } = useConfig()
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const layout = config?.home?.layout || DEFAULT_LAYOUT

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: any, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDrop = (e: any, targetIndex: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null)
      setDragOverIndex(null)
      return
    }

    const items = [...layout]
    const [draggedItem] = items.splice(draggedIndex, 1)
    items.splice(targetIndex, 0, draggedItem)

    setValue('home.layout', items)
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  return (
    <div class="max-w-3xl">
      <div class="mb-8">
          <p class="text-xs font-mono uppercase tracking-wider text-accent mb-2">home</p>
          <h1 class="font-display text-3xl font-bold text-ink">Home Page</h1>
          <p class="text-base text-muted mt-2">{config?.home?.page_description}</p>
      </div>
      <div class="space-y-8">
        <Section title="Open Graph">
          <TextField path="home.og_title" label="Title" />
          <TextField path="home.og_description" label="Description" />
        </Section>

        <Section title="Section Order" description="Drag and drop the items below to reorder sections on the home page.">
          <div class="space-y-2">
            {layout.map((item, index) => {
              const friendlyName = FRIENDLY_NAMES[item] || item
              const isOver = dragOverIndex === index && draggedIndex !== index
              const isDragging = draggedIndex === index

              return (
                <div
                  key={item}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  class={`flex items-center justify-between p-4 border rounded-sm bg-surface shadow-2xs transition-all duration-150 select-none cursor-move ${
                    isDragging ? 'opacity-40 border-dashed border-border-light' : 'border-border hover:border-accent'
                  } ${
                    isOver ? 'border-accent bg-accent/5 translate-y-1' : ''
                  }`}
                >
                  <span class="font-medium text-ink text-sm">{friendlyName}</span>
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-muted/50 font-mono">#{index + 1}</span>
                    <DragHandleIcon />
                  </div>
                </div>
              )
            })}
          </div>
        </Section>

        <ShowcaseSection />
        <ObjectField path="home" />
      </div>
    </div>
  )
}
