import { Button } from '@components/admin/ui/Button'
import { CheckIcon } from './icons'
import { thumbUrl } from './utils'

export interface PickerCategory {
  slug: string
  name: string
  photos: string[]
}

interface Props {
  device: 'mobile' | 'desktop'
  categories: PickerCategory[]
  pendingAdd: string[]
  activePhotos: string[]
  onToggle: (photoPath: string) => void
  onConfirm: () => void
  onClose: () => void
}

/**
 * Modal photo picker for adding photos to the active device layout. Renders the
 * build-time manifest grouped by category; photos already in the layout are
 * disabled. Multi-select via toggle, then "Add Selected".
 */
export function PhotoPicker({
  device,
  categories,
  pendingAdd,
  activePhotos,
  onToggle,
  onConfirm,
  onClose,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-canvas border border-border rounded-lg w-full max-w-3xl max-h-[80vh] flex flex-col shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface">
          <h3 className="text-sm font-semibold text-ink">Add photos to {device} layout</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-ink transition-colors text-lg leading-none px-1"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-3 text-xs text-muted">Selected: {pendingAdd.length}</div>
          {categories.length === 0 && (
            <p className="text-sm text-muted">No categories available. Add photos to your photos source and regenerate.</p>
          )}
          {categories.map((cat) => (
            <div key={cat.slug} className="mb-6">
              <h4 className="text-sm font-medium mb-2 text-muted">{cat.name}</h4>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {cat.photos.map((filename) => {
                  const photoPath = `${cat.slug}/${filename}`
                  const isSelected = pendingAdd.includes(photoPath)
                  const alreadyAdded = activePhotos.includes(photoPath)
                  return (
                    <div
                      key={photoPath}
                      onClick={() => !alreadyAdded && onToggle(photoPath)}
                      className={`relative aspect-square rounded-sm overflow-hidden border-2 transition-all ${
                        isSelected
                          ? 'border-primary ring-1 ring-primary'
                          : 'border-transparent hover:border-border'
                      } ${alreadyAdded ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                      title={alreadyAdded ? 'Already in this layout' : filename}
                    >
                      <img
                        src={thumbUrl(photoPath)}
                        alt={filename}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      {isSelected && (
                        <div className="absolute top-1 right-1 bg-primary text-primary-text rounded-full p-0.5">
                          <CheckIcon size={12} />
                        </div>
                      )}
                      {alreadyAdded && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <span className="text-[10px] text-white">Added</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border bg-surface">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={onConfirm} disabled={pendingAdd.length === 0}>
            Add Selected ({pendingAdd.length})
          </Button>
        </div>
      </div>
    </div>
  )
}
