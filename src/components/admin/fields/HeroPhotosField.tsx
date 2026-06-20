import { useState, useEffect } from 'preact/hooks'
import { useConfig } from '../../../lib/admin/store'
import { api } from '../../../lib/admin/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '../../ui/dialog'
import { Plus, X, GripVertical } from 'lucide-react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface Props {
  path: string
  label: string
}

function SortablePhotoItem({ id, photo, onRemove }: { id: string, photo: string, onRemove: (p: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 p-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md mb-2">
      <div {...attributes} {...listeners} className="cursor-grab text-[var(--color-muted)] hover:text-[var(--color-ink)]">
        <GripVertical size={18} />
      </div>
      <div className="flex-1 text-sm truncate">{photo}</div>
      <button type="button" onClick={() => onRemove(photo)} className="text-[var(--color-error)] hover:text-[var(--color-error-bg)] p-1">
        <X size={16} />
      </button>
    </div>
  )
}

export function HeroPhotosField({ path, label }: Props) {
  const { getValue, setValue } = useConfig()
  const photos = (getValue(path) as string[]) || []
  const [categories, setCategories] = useState<any[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([])

  useEffect(() => {
    if (isOpen) {
      api.getCategories()
        .then(data => setCategories(data.categories || []))
        .catch(err => console.error('Failed to fetch categories:', err))
      setSelectedPhotos([...photos])
    }
  }, [isOpen, photos])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: any) => {
    const { active, over } = event
    if (active.id !== over.id) {
      const oldIndex = photos.indexOf(active.id)
      const newIndex = photos.indexOf(over.id)
      setValue(path, arrayMove(photos, oldIndex, newIndex))
    }
  }

  const handleRemove = (photo: string) => {
    setValue(path, photos.filter(p => p !== photo))
  }

  const togglePhotoSelection = (photoPath: string) => {
    if (selectedPhotos.includes(photoPath)) {
      setSelectedPhotos(selectedPhotos.filter(p => p !== photoPath))
    } else {
      if (selectedPhotos.length < 5) {
        setSelectedPhotos([...selectedPhotos, photoPath])
      }
    }
  }

  const handleSaveSelection = () => {
    setValue(path, selectedPhotos)
    setIsOpen(false)
  }

  return (
    <div className="mb-6">
      <label className="block text-sm font-medium mb-2">{label} (Max 5)</label>
      
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={photos} strategy={verticalListSortingStrategy}>
          {photos.map(photo => (
            <SortablePhotoItem key={photo} id={photo} photo={photo} onRemove={handleRemove} />
          ))}
        </SortableContext>
      </DndContext>

      {photos.length === 0 && <div className="text-sm text-[var(--color-muted)] mb-2">No photos selected.</div>}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <button type="button" className="mt-2 flex items-center gap-2 text-sm bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] px-3 py-1.5 rounded-md transition-colors" disabled={photos.length >= 5}>
            <Plus size={16} /> Add Photo
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Select Hero Photos</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            <div className="mb-4 text-sm text-[var(--color-muted)]">
              Selected: {selectedPhotos.length} / 5
            </div>
            {categories.map(cat => (
              <div key={cat.slug} className="mb-6">
                <h3 className="font-medium mb-3">{cat.meta?.name || cat.slug}</h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                  {cat.photos.map((photo: string) => {
                    const photoPath = `${cat.slug}/${photo}`
                    const isSelected = selectedPhotos.includes(photoPath)
                    const isDisabled = !isSelected && selectedPhotos.length >= 5
                    return (
                      <div 
                        key={photoPath} 
                        onClick={() => !isDisabled && togglePhotoSelection(photoPath)}
                        className={`relative aspect-square rounded-md overflow-hidden cursor-pointer border-2 transition-all ${isSelected ? 'border-[var(--color-focus-ring)]' : 'border-transparent hover:border-[var(--color-border)]'} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <img src={`/photos/thumbs/${cat.slug}/${photo.replace(/\.[^.]+$/, ".webp")}`} alt={photo} className="w-full h-full object-cover" loading="lazy" />
                        {isSelected && (
                          <div className="absolute top-1 right-1 bg-[var(--color-focus-ring)] text-white rounded-full p-0.5">
                            <X size={12} className="rotate-45" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <button type="button" className="px-4 py-2 text-sm border border-[var(--color-border)] rounded-md hover:bg-[var(--color-surface)]">Cancel</button>
            </DialogClose>
            <button type="button" onClick={handleSaveSelection} className="px-4 py-2 text-sm bg-[var(--color-primary)] text-[var(--color-primary-text)] rounded-md hover:bg-[var(--color-primary-hover)]">Save Selection</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
