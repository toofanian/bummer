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
    <div className="collections-pane">
      {/* Sticky create-new input at top */}
      <div className="create-row">
        <input
          placeholder="New collection name"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
        />
        <button onClick={handleCreate}>Create</button>
      </div>

      {collections.length === 0 ? (
        <p className="collections-empty">No collections yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="collections-table">
            <thead>
              <tr>
                <th>Collection</th>
                <th>Albums</th>
                <th>Updated</th>
                <th>Art</th>
                <th></th>
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
                    className="collection-row"
                    onClick={() => onEnter(col)}
                  >
                    {/* 1. Collection name */}
                    <td className="collection-name">{col.name}</td>

                    {/* 2. Album count */}
                    <td className="collection-album-count">
                      {col.album_count != null ? col.album_count : ''}
                    </td>

                    {/* 3. Updated date */}
                    <td className="collection-updated-at">
                      {timeAgo(col.updated_at)}
                    </td>

                    {/* 4. Art strip — always rendered so delete stays right-aligned */}
                    <td className="collection-art-cell">
                      <div className="collection-art-strip">
                        {artAlbums.slice(0, 5).map(album => (
                          album.image_url
                            ? <img
                                key={album.spotify_id}
                                src={album.image_url}
                                alt={album.name}
                                width={28}
                                height={28}
                                className="collection-art-thumb"
                              />
                            : <span
                                key={album.spotify_id}
                                className="collection-art-thumb collection-art-no-art"
                                aria-hidden="true"
                              />
                        ))}
                      </div>
                    </td>

                    {/* 5. Delete — fixed right column */}
                    <td
                      className="collection-delete-cell"
                      onClick={e => e.stopPropagation()}
                    >
                      {isConfirming ? (
                        <>
                          <button
                            className="collection-confirm-delete"
                            aria-label="Confirm delete"
                            onClick={e => handleConfirmDelete(e, col.id)}
                          >
                            Delete
                          </button>
                          <button
                            className="collection-cancel-delete"
                            aria-label="Cancel"
                            onClick={handleCancelDelete}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          className="collection-delete-btn"
                          aria-label="Delete"
                          onClick={e => handleDeleteClick(e, col.id)}
                        >
                          ×
                        </button>
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
