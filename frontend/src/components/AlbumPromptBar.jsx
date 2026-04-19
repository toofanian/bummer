import { useState, useEffect } from 'react'
import AlbumPromptRow from './AlbumPromptRow'
import CollectionPicker from './CollectionPicker'
import { apiFetch } from '../api'

function mergeRecentlyPlayed(today, thisWeek) {
  const seen = new Set()
  const merged = []
  for (const album of [...(today ?? []), ...(thisWeek ?? [])]) {
    if (!seen.has(album.service_id)) {
      seen.add(album.service_id)
      merged.push(album)
    }
  }
  return merged
}

export default function AlbumPromptBar({ albumCollectionMap, collections, session, onBulkAdd, onCreate }) {
  const [recentlyAdded, setRecentlyAdded] = useState([])
  const [recentlyPlayed, setRecentlyPlayed] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    apiFetch(`/home?tz=${encodeURIComponent(tz)}`, {}, session)
      .then(r => r.json())
      .then(data => {
        setRecentlyAdded(data.recently_added ?? [])
        setRecentlyPlayed(mergeRecentlyPlayed(data.today, data.this_week))
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
  if (recentlyAdded.length === 0 && recentlyPlayed.length === 0) return null

  return (
    <div data-testid="album-prompt-bar" className="border-t border-border bg-surface">
      <AlbumPromptRow
        label="Recently Added"
        albums={recentlyAdded}
        albumCollectionMap={albumCollectionMap}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
      />
      <AlbumPromptRow
        label="Recently Played"
        albums={recentlyPlayed}
        albumCollectionMap={albumCollectionMap}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
      />

      {selectedIds.size > 0 && (
        <div className="flex justify-center py-2">
          <button
            className="px-4 py-1.5 text-sm font-medium bg-text text-bg rounded-lg"
            aria-label="Add to Collection"
            onClick={() => setPickerOpen(true)}
          >
            Add to Collection
          </button>
        </div>
      )}

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
