import { useState, useEffect } from 'react'
import AlbumPromptRow from './AlbumPromptRow'
import CollectionPicker from './CollectionPicker'
import { apiFetch } from '../api'

export default function AlbumPromptBar({ albumCollectionMap, collections, session, onBulkAdd, onCreate }) {
  const [recentlyAdded, setRecentlyAdded] = useState([])
  const [recentlyPlayed, setRecentlyPlayed] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    apiFetch('/home', {}, session)
      .then(r => r.json())
      .then(data => {
        setRecentlyAdded(data.recently_added ?? [])
        setRecentlyPlayed(data.recently_played ?? [])
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [session])

  function handleToggleSelect(serviceId) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(serviceId)) {
        next.delete(serviceId)
      } else {
        next.add(serviceId)
      }
      return next
    })
  }

  async function handleBulkAdd(collectionId) {
    const ids = [...selectedIds]
    await onBulkAdd(collectionId, ids)
    setSelectedIds(new Set())
    setPickerOpen(false)
  }

  if (!loaded) return null

  return (
    <div data-testid="album-prompt-bar" className="relative border-t border-border bg-surface">
      {selectedIds.size > 0 && (
        <div className="absolute left-1/2 -translate-x-1/2 -top-14 z-10">
          <button
            className="px-4 py-1.5 text-sm font-medium bg-text text-bg rounded-full shadow-lg"
            aria-label="Add to Collection"
            onClick={() => setPickerOpen(true)}
          >
            Add to Collection
          </button>
        </div>
      )}

      <AlbumPromptRow
        albums={recentlyAdded}
        albumCollectionMap={albumCollectionMap}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
      />
      <AlbumPromptRow
        albums={recentlyPlayed}
        albumCollectionMap={albumCollectionMap}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
      />

      {pickerOpen && (
        <CollectionPicker
          albumIds={[...selectedIds]}
          collections={collections}
          albumCollectionMap={albumCollectionMap}
          onBulkAdd={handleBulkAdd}
          onCreate={onCreate}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
