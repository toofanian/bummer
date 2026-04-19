import { useState, useEffect } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'
import AlbumArtStrip from './AlbumArtStrip'
import AlbumPromptBar from './AlbumPromptBar'

export default function CollectionsPane({ collections, onEnter, onDelete, onCreate, onRename, onFetchAlbums, albumCollectionMap, collectionsForPicker, session, onBulkAdd, onCreateCollection }) {
  const [artMap, setArtMap] = useState({})
  const [confirmingId, setConfirmingId] = useState(null)
  const [menuOpenId, setMenuOpenId] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
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
    if (!confirmingId && !menuOpenId) return
    function handleDocClick() {
      setConfirmingId(null)
      setMenuOpenId(null)
    }
    const id = setTimeout(() => {
      document.addEventListener('click', handleDocClick)
    }, 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('click', handleDocClick)
    }
  }, [confirmingId, menuOpenId])

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

  function submitRename(col) {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== col.name) {
      onRename(col.id, trimmed)
    }
    setRenamingId(null)
  }

  return (
    <div className="w-full flex flex-col h-full overflow-hidden">
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
                data-testid="collection-row"
                className="border-b border-border cursor-pointer hover:bg-hover transition-colors duration-150 group"
                onClick={() => onEnter(col)}
              >
                {isMobile ? (
                  <>
                    <div className="flex items-center justify-between px-4 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {renamingId === col.id ? (
                            <input
                              className="text-sm font-medium text-text bg-transparent border-b border-accent outline-none w-full"
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') submitRename(col)
                                if (e.key === 'Escape') { setRenamingId(null) }
                              }}
                              onBlur={() => submitRename(col)}
                              autoFocus
                              onClick={e => e.stopPropagation()}
                            />
                          ) : (
                            <span className="text-sm font-medium text-text">{col.name}</span>
                          )}
                          {col.album_count != null && (
                            <span className="text-xs text-text-dim">{col.album_count}</span>
                          )}
                        </div>
                        {col.description && (
                          <div className="text-xs text-text-dim mt-0.5 truncate">{col.description}</div>
                        )}
                      </div>
                      <div onClick={e => e.stopPropagation()} className="relative">
                        {renamingId === col.id ? null : confirmingId === col.id ? (
                          <>
                            <button className="bg-delete-red border-none text-white cursor-pointer text-xs font-semibold px-1.5 py-0.5 rounded mr-0.5 whitespace-nowrap" aria-label="Confirm delete" onClick={e => handleConfirmDelete(e, col.id)}>Delete</button>
                            <button className="bg-transparent border border-border text-text-dim cursor-pointer text-xs px-1.5 py-0.5 rounded whitespace-nowrap" aria-label="Cancel" onClick={handleCancelDelete}>Cancel</button>
                          </>
                        ) : menuOpenId === col.id ? (
                          <div className="flex gap-1">
                            <button className="bg-transparent border border-border text-text text-xs px-2 py-1 rounded cursor-pointer hover:bg-surface-2" onClick={() => { setMenuOpenId(null); setRenamingId(col.id); setRenameValue(col.name) }}>Rename</button>
                            <button className="bg-transparent border border-border text-delete-red text-xs px-2 py-1 rounded cursor-pointer hover:bg-surface-2" onClick={e => { setMenuOpenId(null); handleDeleteClick(e, col.id) }}>Delete</button>
                          </div>
                        ) : (
                          <button className="bg-transparent border-none text-text-dim cursor-pointer text-lg p-1.5 rounded opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-surface-2 transition-opacity duration-150" aria-label="More options" onClick={() => setMenuOpenId(col.id)}>⋯</button>
                        )}
                      </div>
                    </div>
                    <div style={{ height: 62 }}>
                      <AlbumArtStrip albums={artAlbums} size={62} />
                    </div>
                  </>
                ) : (
                  <div className="flex items-stretch" style={{ height: 62 }}>
                    <div className="w-48 flex-shrink-0 flex items-center px-4">
                      <div className="min-w-0">
                        {renamingId === col.id ? (
                          <input
                            className="text-sm font-medium text-text bg-transparent border-b border-accent outline-none w-full"
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') submitRename(col)
                              if (e.key === 'Escape') { setRenamingId(null) }
                            }}
                            onBlur={() => submitRename(col)}
                            autoFocus
                            onClick={e => e.stopPropagation()}
                          />
                        ) : (
                          <div className="text-sm font-medium text-text truncate">{col.name}</div>
                        )}
                        {col.description && (
                          <div className="text-xs text-text-dim mt-0.5 truncate">{col.description}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 flex items-center">
                      <AlbumArtStrip albums={artAlbums} size={62} />
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 px-3">
                      {col.album_count != null && (
                        <span className="text-xs text-text-dim tabular-nums">{col.album_count}</span>
                      )}
                      <div onClick={e => e.stopPropagation()} className="relative">
                        {renamingId === col.id ? null : confirmingId === col.id ? (
                          <>
                            <button className="bg-delete-red border-none text-white cursor-pointer text-xs font-semibold px-1.5 py-0.5 rounded mr-0.5 whitespace-nowrap" aria-label="Confirm delete" onClick={e => handleConfirmDelete(e, col.id)}>Delete</button>
                            <button className="bg-transparent border border-border text-text-dim cursor-pointer text-xs px-1.5 py-0.5 rounded whitespace-nowrap" aria-label="Cancel" onClick={handleCancelDelete}>Cancel</button>
                          </>
                        ) : menuOpenId === col.id ? (
                          <div className="flex gap-1">
                            <button className="bg-transparent border border-border text-text text-xs px-2 py-1 rounded cursor-pointer hover:bg-surface-2" onClick={() => { setMenuOpenId(null); setRenamingId(col.id); setRenameValue(col.name) }}>Rename</button>
                            <button className="bg-transparent border border-border text-delete-red text-xs px-2 py-1 rounded cursor-pointer hover:bg-surface-2" onClick={e => { setMenuOpenId(null); handleDeleteClick(e, col.id) }}>Delete</button>
                          </div>
                        ) : (
                          <button className="bg-transparent border-none text-text-dim cursor-pointer text-lg p-1.5 rounded opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-surface-2 transition-opacity duration-150" aria-label="More options" onClick={() => setMenuOpenId(col.id)}>⋯</button>
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
      <AlbumPromptBar
        albumCollectionMap={albumCollectionMap || {}}
        collections={collectionsForPicker || []}
        session={session}
        onBulkAdd={onBulkAdd || (() => {})}
        onCreate={onCreateCollection || (() => {})}
      />
    </div>
  )
}
