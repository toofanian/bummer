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

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export default function CollectionsPane({ collections, onEnter, onDelete, onCreate, onFetchAlbums }) {
  const [newName, setNewName] = useState('')
  // artMap: collectionId -> { albums: [], loading: bool }
  const [artMap, setArtMap] = useState({})

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

  function handleCreate() {
    if (!newName.trim()) return
    onCreate(newName.trim())
    setNewName('')
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
        <ul className="collection-list">
          {collections.map(col => {
            const artEntry = artMap[col.id]
            const artAlbums = artEntry ? artEntry.albums : []

            return (
              <li
                key={col.id}
                className="collection-row"
                onClick={() => onEnter(col)}
                role="listitem"
              >
                {/* 1. Collection name */}
                <span className="collection-name">{col.name}</span>

                {/* 2. Metadata block: album count + formatted date */}
                {(col.album_count != null || col.updated_at) && (
                  <span className="collection-meta">
                    {col.album_count != null && (
                      <span className="collection-album-count">{col.album_count} albums</span>
                    )}
                    {col.album_count != null && col.updated_at && (
                      <span className="collection-meta-sep"> · </span>
                    )}
                    {col.updated_at && (
                      <span className="collection-updated-at">{formatDate(col.updated_at)}</span>
                    )}
                  </span>
                )}

                {/* 3. Art strip — fills remaining space */}
                {artAlbums.length > 0 && (
                  <div className="collection-art-strip">
                    {artAlbums.slice(0, 20).map(album => (
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
                )}

                {/* 4. Delete button — right edge, hover only */}
                <button
                  className="collection-delete-btn"
                  aria-label="Delete"
                  onClick={e => {
                    e.stopPropagation()
                    onDelete(col.id)
                  }}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
