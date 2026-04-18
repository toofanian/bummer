import { useState, useEffect, useRef, useCallback } from 'react'
import { filterAlbums } from '../filterAlbums'
import MobileAlbumCard from './MobileAlbumCard'

export default function SearchOverlay({ albums, onClose, onPlay, onPlayTrack, onFetchTracks, playback }) {
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

  const filtered = query ? filterAlbums(albums, query) : []
  const playingId = playback?.album_id || null
  const playingTrackName = playback?.track_name || null

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

  return (
    <div
      className="fixed inset-0 z-[350] bg-surface flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border">
        <input
          ref={inputRef}
          className="flex-1 bg-surface-2 text-text border border-border rounded-lg px-4 py-3 text-base focus:ring-2 focus:ring-accent/40 focus:outline-none"
          placeholder="Search your library…"
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
            Search your library
          </div>
        )}
        {query && filtered.length === 0 && (
          <div className="flex items-center justify-center h-32 text-text-dim text-sm">
            No results
          </div>
        )}
        {filtered.map(album => (
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
          />
        ))}
      </div>
    </div>
  )
}
