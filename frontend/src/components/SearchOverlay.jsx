import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { filterAlbums } from '../filterAlbums'
import MobileAlbumCard from './MobileAlbumCard'

function groupByArtist(albums) {
  const map = {}
  for (const album of albums) {
    for (const artist of album.artists) {
      if (!map[artist]) map[artist] = []
      map[artist].push(album)
    }
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, albums]) => ({ name, albums }))
}

function filterArtistGroups(groups, query) {
  if (!query) return []
  const q = query.toLowerCase()
  return groups.filter(g => g.name.toLowerCase().includes(q))
}

function filterCollections(collections, query) {
  if (!query) return []
  const q = query.toLowerCase()
  return collections.filter(c => c.name.toLowerCase().includes(q))
}

function ArtistThumbnail({ albums, artistName }) {
  const covers = albums.slice(0, 4).map(a => a.image_url).filter(Boolean)
  if (covers.length === 0) {
    return (
      <div className="w-11 h-11 rounded bg-surface-2 flex items-center justify-center text-text-dim text-lg font-semibold flex-shrink-0">
        {artistName.charAt(0).toUpperCase()}
      </div>
    )
  }
  return (
    <div className="w-11 h-11 rounded overflow-hidden flex-shrink-0 grid grid-cols-2 grid-rows-2 gap-px bg-surface-2">
      {covers.map((url, i) => (
        <img key={i} src={url} alt="" className="w-full h-full object-cover" />
      ))}
    </div>
  )
}

/**
 * SearchOverlay
 *
 * mode:
 *   'albums'      — filter albums, show MobileAlbumCard with full selection
 *   'artists'     — filter artist names, show artist rows
 *   'collections' — filter collection names, show collection rows
 */
export default function SearchOverlay({
  mode = 'albums',
  albums,
  collections,
  onClose,
  onPlay,
  onPlayTrack,
  onFetchTracks,
  playback,
  // album selection props (albums mode)
  albumCollectionMap,
  selectedIds,
  onToggleSelect,
  onArtistClick,
  // artists mode
  onSelectArtist,
  // collections mode
  onEnterCollection,
  // positioning
  bottomOffset = 0,
}) {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState({})
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const playingId = playback?.album_id || null
  const playingTrackName = playback?.track_name || null

  // Albums mode
  const filteredAlbums = useMemo(
    () => mode === 'albums' && query ? filterAlbums(albums, query) : [],
    [mode, albums, query]
  )

  // Artists mode
  const artistGroups = useMemo(() => mode === 'artists' ? groupByArtist(albums || []) : [], [mode, albums])
  const filteredArtists = useMemo(
    () => mode === 'artists' ? filterArtistGroups(artistGroups, query) : [],
    [mode, artistGroups, query]
  )

  // Collections mode
  const filteredCollections = useMemo(
    () => mode === 'collections' ? filterCollections(collections || [], query) : [],
    [mode, collections, query]
  )

  const handleExpand = useCallback((albumId) => {
    setExpanded(prev => {
      if (prev[albumId]) {
        const next = { ...prev }
        delete next[albumId]
        return next
      }
      const entry = { loading: true, tracks: [] }
      if (onFetchTracks) {
        onFetchTracks(albumId).then(tracks => {
          setExpanded(p => ({
            ...p,
            [albumId]: { loading: false, tracks: tracks || [] },
          }))
        })
      }
      return { ...prev, [albumId]: entry }
    })
  }, [onFetchTracks])

  const hasResults = query && (
    (mode === 'albums' && filteredAlbums.length > 0) ||
    (mode === 'artists' && filteredArtists.length > 0) ||
    (mode === 'collections' && filteredCollections.length > 0)
  )

  const placeholder = mode === 'albums' ? 'Search albums…'
    : mode === 'artists' ? 'Search artists…'
    : 'Search collections…'

  const emptyHint = mode === 'albums' ? 'Search your library'
    : mode === 'artists' ? 'Search by artist name'
    : 'Search your collections'

  return (
    <div
      className="fixed left-0 right-0 z-[350] bg-surface flex flex-col"
      style={{
        top: 0,
        bottom: bottomOffset,
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border">
        <input
          ref={inputRef}
          className="flex-1 bg-surface-2 text-text border border-border rounded-lg px-4 py-3 text-base focus:ring-2 focus:ring-accent/40 focus:outline-none"
          placeholder={placeholder}
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button
          className="text-accent text-sm font-medium bg-transparent border-none cursor-pointer px-2 py-3"
          aria-label="Cancel"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!query && (
          <div className="flex items-center justify-center h-32 text-text-dim text-sm">
            {emptyHint}
          </div>
        )}
        {query && !hasResults && (
          <div className="flex items-center justify-center h-32 text-text-dim text-sm">
            No results
          </div>
        )}

        {/* Albums mode */}
        {mode === 'albums' && filteredAlbums.map(album => (
          <MobileAlbumCard
            key={album.service_id}
            album={album}
            isExpanded={!!expanded[album.service_id]}
            isPlaying={playingId === album.service_id}
            exp={expanded[album.service_id]}
            playingTrackName={playingTrackName}
            onPlay={onPlay}
            onPlayTrack={onPlayTrack}
            onExpand={handleExpand}
            isSelected={selectedIds?.has(album.service_id)}
            onToggleSelect={onToggleSelect}
            collectionCount={(albumCollectionMap?.[album.service_id] || []).length}
            onArtistClick={onArtistClick}
          />
        ))}

        {/* Artists mode */}
        {mode === 'artists' && filteredArtists.map(group => (
          <div
            key={group.name}
            data-testid={`artist-row-${group.name}`}
            className="flex items-center gap-3 px-4 py-2.5 min-h-16 border-b border-border cursor-pointer transition-colors duration-100 active:bg-selected"
            onClick={() => { onSelectArtist?.(group.name); onClose() }}
          >
            <ArtistThumbnail albums={group.albums} artistName={group.name} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-text truncate">{group.name}</div>
              <div className="text-xs text-text-dim">{group.albums.length} {group.albums.length === 1 ? 'album' : 'albums'}</div>
            </div>
            <span className="text-text-dim text-sm flex-shrink-0">›</span>
          </div>
        ))}

        {/* Collections mode */}
        {mode === 'collections' && filteredCollections.map(col => (
          <div
            key={col.id}
            data-testid={`collection-row-${col.id}`}
            className="flex items-center gap-3 px-4 py-2.5 min-h-16 border-b border-border cursor-pointer transition-colors duration-100 active:bg-selected"
            onClick={() => { onEnterCollection?.(col); onClose() }}
          >
            <div className="w-11 h-11 rounded bg-surface-2 flex items-center justify-center text-text-dim text-lg font-semibold flex-shrink-0">
              {col.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-text truncate">{col.name}</div>
              {col.album_count != null && (
                <div className="text-xs text-text-dim">{col.album_count} {col.album_count === 1 ? 'album' : 'albums'}</div>
              )}
            </div>
            <span className="text-text-dim text-sm flex-shrink-0">›</span>
          </div>
        ))}
      </div>
    </div>
  )
}
