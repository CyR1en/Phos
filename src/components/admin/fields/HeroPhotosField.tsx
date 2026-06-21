import { useState, useEffect } from 'preact/hooks'
import { useConfig } from '../../../lib/admin/store'
import { api } from '../../../lib/admin/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '../../ui/dialog'
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
import { Plus, X, GripVertical } from 'lucide-react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import manifest from '@content/categories.json'

interface Props {
  path: string
  label: string
}

function isPortraitPhoto(photoPath: string): boolean {
  const parts = photoPath.split('/')
  if (parts.length !== 2) return false
  const [catSlug, filename] = parts
  const category = manifest.categories.find((c: any) => c.slug === catSlug)
  if (!category) return false
  const photo = category.photos.find((p: any) => p.filename === filename)
  if (!photo) return false
  return (photo.height || 0) > (photo.width || 0)
}

function SortablePhotoItem({ id, photo, onRemove }: { id: string, photo: string, onRemove: (p: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  const parts = photo.split('/')
  const catSlug = parts[0]
  const filename = parts[1]
  const thumbUrl = catSlug && filename ? `/photos/thumbs/${catSlug}/${filename.replace(/\.[^.]+$/, '.webp')}` : ''

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className="relative group w-36 h-36 border border-[var(--color-border)] rounded-md overflow-hidden bg-[var(--color-surface)] cursor-grab"
      {...(attributes as any)}
      {...(listeners as any)}
    >
      {thumbUrl ? (
        <img src={thumbUrl} alt={filename} className="w-full h-full object-cover select-none pointer-events-none" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs text-[var(--color-muted)] select-none pointer-events-none">No image</div>
      )}
      
      <button 
        type="button" 
        onClick={(e) => {
          e.stopPropagation()
          onRemove(photo)
        }} 
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors z-10"
      >
        <X size={12} />
      </button>

      <div className="absolute top-2 left-2 bg-black/40 text-white p-1 rounded-sm opacity-60 group-hover:opacity-100 transition-opacity pointer-events-none">
        <GripVertical size={16} />
      </div>
    </div>
  )
}

export function HeroPhotosField({ path, label }: Props) {
  const { getValue, setValue } = useConfig()
  const photos = (getValue(path) as string[]) || []
  const [categories, setCategories] = useState<any[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([])
  const [pendingPortraitPhoto, setPendingPortraitPhoto] = useState<string | null>(null)
  const [isAlertOpen, setIsAlertOpen] = useState(false)

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
        if (isPortraitPhoto(photoPath)) {
          setPendingPortraitPhoto(photoPath)
          setIsAlertOpen(true)
        } else {
          setSelectedPhotos([...selectedPhotos, photoPath])
        }
      }
    }
  }

  const handleConfirmPortrait = () => {
    if (pendingPortraitPhoto && selectedPhotos.length < 5) {
      setSelectedPhotos([...selectedPhotos, pendingPortraitPhoto])
    }
    setPendingPortraitPhoto(null)
    setIsAlertOpen(false)
  }

  const handleCancelPortrait = () => {
    setPendingPortraitPhoto(null)
    setIsAlertOpen(false)
  }

  const handleSaveSelection = () => {
    setValue(path, selectedPhotos)
    setIsOpen(false)
  }

  return (
    <div className="mb-6">
      <label className="block text-sm font-medium mb-2">{label} (Max 5)</label>
      
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        {(<SortableContext items={photos} strategy={rectSortingStrategy}>
          {(<div className="flex flex-wrap gap-3 mb-4">
            {photos.map(photo => (
              <SortablePhotoItem key={photo} id={photo} photo={photo} onRemove={handleRemove} />
            ))}
          </div>) as any}
        </SortableContext>) as any}
      </DndContext>

      {photos.length === 0 && <div className="text-sm text-[var(--color-muted)] mb-2">No photos selected.</div>}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          {(<button type="button" className="mt-2 flex items-center gap-2 text-sm bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] px-3 py-1.5 rounded-md transition-colors" disabled={photos.length >= 5}>
            <Plus size={16} /> Add Photo
          </button>) as any}
        </DialogTrigger>
        {(<DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          {(<DialogHeader>
            {(<DialogTitle>Select Hero Photos</DialogTitle>) as any}
          </DialogHeader>) as any}
          <div className="flex-1 overflow-y-auto py-4">
            <div className="mb-4 text-sm text-[var(--color-muted)]">
              Selected: {selectedPhotos.length} / 5
            </div>
            {categories.map(cat => (
              <div key={cat.slug} className="mb-6">
                <h4 className="text-sm font-medium mb-2 text-[var(--color-muted)]">{cat.meta?.name || cat.slug}</h4>
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
          {(<DialogFooter>
            {(<DialogClose asChild>
              {(<button type="button" className="px-4 py-2 text-sm border border-[var(--color-border)] rounded-md hover:bg-[var(--color-surface)]">Cancel</button>) as any}
            </DialogClose>) as any}
            {(<button type="button" onClick={handleSaveSelection} className="px-4 py-2 text-sm bg-[var(--color-primary)] text-[var(--color-primary-text)] rounded-md hover:bg-[var(--color-primary-hover)]">Save Selection</button>) as any}
          </DialogFooter>) as any}
        </DialogContent>) as any}
      </Dialog>

      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        {(<AlertDialogContent>
          {(<AlertDialogHeader>
            {(<AlertDialogTitle>Portrait Photo Warning</AlertDialogTitle>) as any}
            {(<AlertDialogDescription>
              It's not recommended to set a portrait photo as a hero picture. Are you sure you want to add it?
            </AlertDialogDescription>) as any}
          </AlertDialogHeader>) as any}
          {(<AlertDialogFooter>
            {(<AlertDialogCancel onClick={handleCancelPortrait}>Cancel</AlertDialogCancel>) as any}
            {(<AlertDialogAction onClick={handleConfirmPortrait}>Add Photo</AlertDialogAction>) as any}
          </AlertDialogFooter>) as any}
        </AlertDialogContent>) as any}
      </AlertDialog>
    </div>
  )
}
