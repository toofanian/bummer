import { useState, useEffect } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'
import AlbumArtStrip from './AlbumArtStrip'

export default function CollectionsPane({ collections, onEnter, onDelete, onCreate, onFetchAlbums }) {
  const [newName, setNewName] = useState('')
  const [artMap, setArtMap] = useState({})
  const [confirmingId, setConfirmingId] = useState(null)
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!onFetchAlbums || !collections.length) return
    collections.forEach(col => {
      if (artMap[col.id]) return
      setArtMap(prev => ({ ...prev, [col.id]: { albums: [], loading: true } }))
      onFetchAlbums(col.id).then(albums => {
        setArtMap(prev => ({ ...prev, [col.id]: { albums, loading: false } }))
      })
    })
  }, [collections])  // eslint-disable-line react-hooks/exhaustive-deps

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
          {collections.map(col => {
            const artEntry = artMap[col.id]
            const artAlbums = artEntry ? artEntry.albums : []
            const isConfirming = confirmingId === col.id

            return (
              <div
                key={col.id}
                className="border-b border-border cursor-pointer hover:bg-hover transition-colors duration-150 group"
                onClick={() => onEnter(col)}
              >
                {isMobile ? (
                  <>
                    <div className="flex items-center justify-between px-4 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-text">{col.name}</span>
                          {col.album_count != null && (
                            <span className="text-xs text-text-dim">{col.album_count}</span>
                          )}
                        </div>
                        {col.description && (
                          <div className="text-xs text-text-dim mt-0.5 truncate">{col.description}</div>
                        )}
                      </div>
                      <div onClick={e => e.stopPropagation()}>
                        {isConfirming ? (
                          <>
                            <button className="bg-delete-red border-none text-white cursor-pointer text-xs font-semibold px-1.5 py-0.5 rounded mr-0.5 whitespace-nowrap" aria-label="Confirm delete" onClick={e => handleConfirmDelete(e, col.id)}>Delete</button>
                            <button className="bg-transparent border border-border text-text-dim cursor-pointer text-xs px-1.5 py-0.5 rounded whitespace-nowrap" aria-label="Cancel" onClick={handleCancelDelete}>Cancel</button>
                          </>
                        ) : (
                          <button className="bg-transparent border-none text-text-dim cursor-pointer text-lg p-1.5 rounded opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-surface-2 transition-opacity duration-150" aria-label="Delete" onClick={e => handleDeleteClick(e, col.id)}>×</button>
                        )}
                      </div>
                    </div>
                    {artAlbums.length > 0 && (
                      <AlbumArtStrip albums={artAlbums} size={40} />
                    )}
                  </>
                ) : (
                  <div className="flex items-stretch">
                    <div className="w-48 flex-shrink-0 flex items-center px-4">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-text truncate">{col.name}</div>
                        {col.description && (
                          <div className="text-xs text-text-dim mt-0.5 truncate">{col.description}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 flex items-center">
                      <AlbumArtStrip albums={artAlbums} size={40} />
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 px-3">
                      {col.album_count != null && (
                        <span className="text-xs text-text-dim tabular-nums">{col.album_count}</span>
                      )}
                      <div onClick={e => e.stopPropagation()}>
                        {isConfirming ? (
                          <>
                            <button className="bg-delete-red border-none text-white cursor-pointer text-xs font-semibold px-1.5 py-0.5 rounded mr-0.5 whitespace-nowrap" aria-label="Confirm delete" onClick={e => handleConfirmDelete(e, col.id)}>Delete</button>
                            <button className="bg-transparent border border-border text-text-dim cursor-pointer text-xs px-1.5 py-0.5 rounded whitespace-nowrap" aria-label="Cancel" onClick={handleCancelDelete}>Cancel</button>
                          </>
                        ) : (
                          <button className="bg-transparent border-none text-text-dim cursor-pointer text-lg p-1.5 rounded opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-surface-2 transition-opacity duration-150" aria-label="Delete" onClick={e => handleDeleteClick(e, col.id)}>×</button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
