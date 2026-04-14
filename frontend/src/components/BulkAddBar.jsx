import { useState } from 'react'

export default function BulkAddBar({ selectedCount, collections, onAddToCollection, onClear }) {
  const [pickerOpen, setPickerOpen] = useState(false)

  function handleCollectionClick(collectionId) {
    onAddToCollection(collectionId)
    setPickerOpen(false)
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-border"
      style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
    >
      {pickerOpen && (
        <div className="px-4 py-2 border-b border-border bg-surface">
          {collections.map((c) => (
            <button
              key={c.id}
              className="block w-full text-left px-3 py-2 text-sm text-primary hover:bg-surface-hover rounded"
              onClick={() => handleCollectionClick(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm text-primary font-medium">{selectedCount} selected</span>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1.5 text-sm font-medium bg-accent text-on-accent rounded-lg"
            aria-label="Add to Collection"
            onClick={() => setPickerOpen((prev) => !prev)}
          >
            Add to Collection
          </button>
          <button
            className="px-2 py-1.5 text-sm text-secondary hover:text-primary"
            aria-label="Clear selection"
            onClick={onClear}
          >
            &times;
          </button>
        </div>
      </div>
    </div>
  )
}
