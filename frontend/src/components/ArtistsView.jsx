import { useState, useMemo, useEffect } from 'react'
import AlbumTable from './AlbumTable'
import AlbumArtStrip from './AlbumArtStrip'
import { useIsMobile } from '../hooks/useIsMobile'
import { useLazyRender } from '../hooks/useLazyRender'

function groupByArtist(albums) {
  const map = {}
  for (const album of albums) {
    for (const artist of album.artists) {
      const artistName = typeof artist === 'string' ? artist : artist.name
      if (!map[artistName]) map[artistName] = []
      map[artistName].push(album)
    }
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, albums]) => ({ name, albums }))
}

function filterArtistGroups(groups, search) {
  if (!search) return groups
  const q = search.toLowerCase()
  return groups.filter(group =>
    group.name.toLowerCase().includes(q) ||
    group.albums.some(a => a.name.toLowerCase().includes(q))
  )
}

function ArtistProfileImage({ name, imageUrl, size = 40 }) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="rounded-full bg-surface-2 flex items-center justify-center text-text-dim font-semibold flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
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

export default function ArtistsView({
  albums,
  search,
  onFetchTracks,
  onPlay,
  onPlayTrack,
  playingId,
  playingTrackName,
  albumCollectionMap,
  selectedIds,
  onToggleSelect,
  targetArtist = null,
  onClearTargetArtist,
  listenCounts = {},
  artistImages = {},
}) {
  const [selectedArtist, setSelectedArtist] = useState(null)
  const isMobile = useIsMobile()

  // Navigate to target artist when provided externally (e.g. clicking artist in AlbumTable)
  useEffect(() => {
    if (targetArtist) {
      setSelectedArtist(targetArtist)
      onClearTargetArtist?.()
    }
  }, [targetArtist, onClearTargetArtist])

  const allGroups = useMemo(() => groupByArtist(albums), [albums])
  const filteredGroups = useMemo(() => filterArtistGroups(allGroups, search), [allGroups, search])
  const { visible: lazyGroups, hasMore, sentinelRef } = useLazyRender(filteredGroups)

  // Artist detail view
  if (selectedArtist) {
    const artistAlbums = albums.filter(a =>
      a.artists.some(artist =>
        (typeof artist === 'string' ? artist : artist.name) === selectedArtist
      )
    )
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-surface flex-shrink-0">
          <button
            className="text-sm text-text-dim transition-colors duration-150 hover:text-text bg-transparent border-none cursor-pointer"
            onClick={() => setSelectedArtist(null)}
          >
            ← Back
          </button>
          <h2 className="text-base font-semibold">{selectedArtist}</h2>
          <span className="text-sm text-text-dim">{artistAlbums.length} {artistAlbums.length === 1 ? 'album' : 'albums'}</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <AlbumTable
            albums={artistAlbums}
            loading={false}
            onFetchTracks={onFetchTracks}
            onPlay={onPlay}
            onPlayTrack={onPlayTrack}
            playingId={playingId}
            playingTrackName={playingTrackName}
            albumCollectionMap={albumCollectionMap}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
            listenCounts={listenCounts}
          />
        </div>
      </div>
    )
  }

  // Artist list view
  if (filteredGroups.length === 0) {
    return <p className="p-4 text-sm text-text-dim italic">No artists found.</p>
  }

  return (
    <div className="flex flex-col">
      {lazyGroups.map(group => (
        <div
          key={group.name}
          data-testid={`artist-row-${group.name}`}
          className="border-b border-border cursor-pointer transition-colors duration-100 hover:bg-hover"
          style={{ minHeight: 62 }}
          onClick={() => setSelectedArtist(group.name)}
        >
          {isMobile ? (
            <>
              <div className="flex items-center px-4 py-2">
                <ArtistProfileImage name={group.name} imageUrl={artistImages[group.name]} />
                <div className="min-w-0 flex-1 ml-3">
                  <div className="flex items-center gap-2">
                    <span data-testid="artist-name" className="text-sm font-semibold text-text">{group.name}</span>
                    <span className="text-xs text-text-dim">{group.albums.length} {group.albums.length === 1 ? 'album' : 'albums'}</span>
                  </div>
                </div>
              </div>
              <AlbumArtStrip albums={group.albums} size={62} />
            </>
          ) : (
            <div className="flex items-stretch">
              <div className="w-64 flex-shrink-0 flex items-center px-4 gap-3">
                <ArtistProfileImage name={group.name} imageUrl={artistImages[group.name]} />
                <div className="min-w-0">
                  <div data-testid="artist-name" className="text-sm font-semibold text-text truncate">{group.name}</div>
                  <div className="text-xs text-text-dim mt-0.5">{group.albums.length} {group.albums.length === 1 ? 'album' : 'albums'}</div>
                </div>
              </div>
              <div className="flex-1 min-w-0 flex items-center">
                <AlbumArtStrip albums={group.albums} size={62} />
              </div>
            </div>
          )}
        </div>
      ))}
      {hasMore && <div ref={sentinelRef} data-testid="load-more-sentinel" className="h-1" />}
    </div>
  )
}
