import { useState, useEffect } from 'react'

/**
 * CollectionsPane
 *
 * Props:
 *   collections    — { id, name, album_count?, updated_at? }[]
 *   onEnter        — (collection) => void  navigate into a collection
 *   onDelete       — (id: string) => void
 *   onCreate       — (name: string) => void
 *   onFetchAlbums  — (collectionId: string) => Promise<album[]>
 */

function timeAgo(iso) {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  const diffWk = Math.floor(diffDay / 7)
  if (diffWk < 4) return `${diffWk}w ago`
  const diffMo = Math.floor(diffDay / 30)
  if (diffMo < 12) return `${diffMo}mo ago`
  const diffYr = Math.floor(diffDay / 365)
  return `${diffYr}y ago`
}

export default function CollectionsPane({ collections, onEnter, onDelete, onCreate, onFetchAlbums }) {
  const [newName, setNewName] = useState('')
  // artMap: collectionId -> { albums: [], loading: bool }
  const [artMap, setArtMap] = useState({})
  // confirmingId: id of the collection pending delete confirmation
  const [confirmingId, setConfirmingId] = useState(null)

  // Fetch album art strips for all collections on mount and whenever list changes
  useEffect(() => {
    if (!onFetchAlbums || !collections.length) return
    collections.forEach(col => {
      if (artMap[col.id]) return  // already fetched or in progress
      setArtMap(prev => ({ ...prev, [col.id]: { albums: [], loading: true } }))
      onFetchAlbums(col.id).then(albums => {
        setArtMap(prev => ({ ...prev, [col.id]: { albums, loading: false } }))
      })
    })
  }, [collections])  // eslint-disable-line react-hooks/exhaustive-deps

  // Close confirmation when clicking outside (registered on next tick to skip the triggering click)
  useEffect(() => {
    if (!confirmingId) return
    function handleDocClick() {
      setConfirmingId(null)
    }
    const id = setTimeout(() => {
      document.addEventListener('click', handleDocClick)
    }, 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('click', handleDocClick)
    }
  }, [confirmingId])

  function handleCreate() {
    if (!newName.trim()) return
    onCreate(newName.trim())
    setNewName('')
  }

  function handleDeleteClick(e, colId) {
    e.stopPropagation()
    if (confirmingId !== colId) {
      setConfirmingId(colId)
    }
  }

  function handleConfirmDelete(e, colId) {
    e.stopPropagation()
    onDelete(colId)
    setConfirmingId(null)
  }

  function handleCancelDelete(e) {
    e.stopPropagation()
    setConfirmingId(null)
  }

  return (
    <div className="w-full flex flex-col h-full overflow-hidden">
      {/* Sticky create-new input at top */}
      <div className="flex gap-2 px-4 py-3 border-b border-border bg-bg flex-shrink-0 sticky top-0 z-10 opacity-70 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
        <input
          placeholder="New collection name"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
        />
        <button onClick={handleCreate}>Create</button>
      </div>

      {collections.length === 0 ? (
        <p className="p-4 text-sm text-text-dim italic">No collections yet.</p>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Single-column list table */}
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2 text-xs font-semibold text-text-dim uppercase tracking-wide">Collection</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-text-dim uppercase tracking-wide w-16">Albums</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-text-dim uppercase tracking-wide w-20 hidden sm:table-cell">Updated</th>
                <th className="text-right px-4 py-2 w-32 hidden sm:table-cell"></th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {collections.map(col => {
                const artEntry = artMap[col.id]
                const artAlbums = artEntry ? artEntry.albums : []
                const isConfirming = confirmingId === col.id

                return (
                  <tr
                    key={col.id}
                    className="border-b border-border cursor-pointer hover:bg-hover transition-colors duration-150 group"
                    onClick={() => onEnter(col)}
                  >
                    {/* Name + optional description */}
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold text-text">{col.name}</div>
                      {col.description && (
                        <div className="text-xs text-text-dim mt-0.5 truncate max-w-xs">{col.description}</div>
                      )}
                    </td>
                    {/* Album count */}
                    <td className="px-4 py-3 text-right text-sm text-text-dim tabular-nums">
                      {col.album_count != null ? col.album_count : ''}
                    </td>
                    {/* Updated */}
                    <td className="px-4 py-3 text-right text-sm text-text-dim hidden sm:table-cell">
                      {timeAgo(col.updated_at)}
                    </td>
                    {/* Art thumbnails */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex gap-0.5 justify-end">
                        {artAlbums.slice(0, 5).map(album => (
                          album.image_url
                            ? <img key={album.service_id} src={album.image_url} alt={album.name} width={24} height={24} className="w-6 h-6 rounded-sm object-cover flex-shrink-0 block" />
                            : <span key={album.service_id} className="w-6 h-6 rounded-sm bg-surface-2 flex-shrink-0 block" aria-hidden="true" />
                        ))}
                      </div>
                    </td>
                    {/* Delete */}
                    <td className="px-3 py-3 text-right" onClick={e => e.stopPropagation()}>
                      {isConfirming ? (
                        <>
                          <button className="bg-delete-red border-none text-white cursor-pointer text-xs font-semibold px-1.5 py-0.5 rounded mr-0.5 whitespace-nowrap" aria-label="Confirm delete" onClick={e => handleConfirmDelete(e, col.id)}>Delete</button>
                          <button className="bg-transparent border border-border text-text-dim cursor-pointer text-xs px-1.5 py-0.5 rounded whitespace-nowrap" aria-label="Cancel" onClick={handleCancelDelete}>Cancel</button>
                        </>
                      ) : (
                        <button className="bg-transparent border-none text-text-dim cursor-pointer text-lg p-1.5 rounded opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-surface-2 transition-opacity duration-150" aria-label="Delete" onClick={e => handleDeleteClick(e, col.id)}>×</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
