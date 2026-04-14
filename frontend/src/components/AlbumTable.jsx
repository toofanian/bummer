import { useState } from 'react'
import CollectionsBubble from './CollectionsBubble'
import { useIsMobile } from '../hooks/useIsMobile'

const COLUMNS = [
  { key: 'name',        label: 'Album'      },
  { key: 'artists',     label: 'Artist'     },
  { key: 'release_date',label: 'Year'       },
  { key: 'added_at',    label: 'Date Added' },
]

function formatYear(dateStr) {
  return dateStr ? dateStr.slice(0, 4) : '—'
}

function formatDateAdded(isoStr) {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

function sortAlbums(albums, key, direction) {
  return [...albums].sort((a, b) => {
    let aVal = key === 'artists' ? a.artists.join(', ') : a[key]
    let bVal = key === 'artists' ? b.artists.join(', ') : b[key]
    aVal = aVal ?? ''
    bVal = bVal ?? ''
    if (aVal < bVal) return direction === 'asc' ? -1 : 1
    if (aVal > bVal) return direction === 'asc' ? 1 : -1
    return 0
  })
}

// Returns a flat ordered list of { type: 'album'|'track', id: string } for keyboard navigation.
// Track entries are only included for expanded albums that have finished loading.
function buildNavList(sorted, expanded) {
  const list = []
  for (const album of sorted) {
    list.push({ type: 'album', id: `row-album-${album.spotify_id}` })
    const exp = expanded[album.spotify_id]
    if (exp && !exp.loading) {
      for (const t of exp.tracks) {
        list.push({ type: 'track', id: `row-track-${t.spotify_id}` })
      }
    }
  }
  return list
}

function TrackList({ tracks, loading, onPlayTrack, playingTrackId, playingTrackName, navigateRow, onCollapseToAlbum }) {
  if (loading) return <tr><td colSpan={7} style={{ padding: '8px 60px', color: 'var(--text-dim)' }}>Loading tracks…</td></tr>
  return [
    <tr key="track-header" className="track-header-row">
      <td></td>
      <td style={{ color: 'var(--text-dim)', fontSize: 12, textAlign: 'center' }}>#</td>
      <td>Name</td>
      <td>Artists</td>
      <td></td>
      <td style={{ color: 'var(--text-dim)' }}>Duration</td>
      <td></td>
    </tr>,
    ...tracks.map(t => {
      const isPlaying = playingTrackId === t.spotify_id
      const isTrackPlaying = playingTrackName && t.name === playingTrackName

      function handleTrackKeyDown(e) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          navigateRow && navigateRow(`row-track-${t.spotify_id}`, 'down')
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          navigateRow && navigateRow(`row-track-${t.spotify_id}`, 'up')
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          onCollapseToAlbum && onCollapseToAlbum()
        } else if (e.key === 'Enter') {
          e.preventDefault()
          onPlayTrack && onPlayTrack(`spotify:track:${t.spotify_id}`)
        } else if (e.key === 'Escape') {
          e.currentTarget.blur()
        }
      }

      return (
        <tr
          key={t.track_number}
          id={`row-track-${t.spotify_id}`}
          className={`track-row${isTrackPlaying ? ' now-playing' : ''}`}
          tabIndex={0}
          onKeyDown={handleTrackKeyDown}
          onDoubleClick={() => onPlayTrack && onPlayTrack(`spotify:track:${t.spotify_id}`)}
        >
          <td></td>
          <td style={{ color: 'var(--text-dim)', fontSize: 12, textAlign: 'center' }}>
            {isPlaying ? (
              <span className="now-playing-indicator">
                <span className="eq-bar"></span>
                <span className="eq-bar"></span>
                <span className="eq-bar"></span>
                <span className="eq-bar"></span>
              </span>
            ) : t.track_number}
          </td>
          <td>{t.name}</td>
          <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{t.artists?.join(', ')}</td>
          <td></td>
          <td style={{ color: 'var(--text-dim)' }}>{t.duration}</td>
          <td></td>
        </tr>
      )
    }),
  ]
}

export default function AlbumTable({
  albums,
  loading,
  onFetchTracks,
  onPlay,
  onPlayTrack,
  playingId,
  playingTrackId,
  playingTrackName = null,
  collections,
  albumCollectionMap,
  onToggleCollection,
  onCreateCollection,
}) {
  const [sortKey, setSortKey] = useState('added_at')
  const [sortDir, setSortDir] = useState('desc')
  const [expanded, setExpanded] = useState({})
  const isMobile = useIsMobile()

  if (loading) return <p>Loading...</p>
  if (!albums.length) return <p>No albums found.</p>

  function handleHeaderClick(key) {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  async function handleExpand(spotifyId) {
    if (expanded[spotifyId]) {
      setExpanded(prev => { const next = { ...prev }; delete next[spotifyId]; return next })
      return
    }
    setExpanded(prev => ({ ...prev, [spotifyId]: { tracks: [], loading: true } }))
    const tracks = await onFetchTracks(spotifyId)
    setExpanded(prev => ({ ...prev, [spotifyId]: { tracks, loading: false } }))
  }

  const sorted = sortAlbums(albums, sortKey, sortDir)

  function navigateRow(currentId, direction) {
    const navList = buildNavList(sorted, expanded)
    const idx = navList.findIndex(entry => entry.id === currentId)
    if (idx === -1) return
    const nextIdx = direction === 'down' ? idx + 1 : idx - 1
    if (nextIdx < 0 || nextIdx >= navList.length) return
    document.getElementById(navList[nextIdx].id)?.focus()
  }

  if (isMobile) {
    return (
      <div className="album-card-list">
        {sorted.map(album => {
          const isExpanded = !!expanded[album.spotify_id]
          const isPlaying = playingId === album.spotify_id
          const exp = expanded[album.spotify_id]

          return (
            <div key={album.spotify_id}>
              <div
                data-testid={`album-card-${album.spotify_id}`}
                className={`album-card${isPlaying ? ' now-playing' : ''}`}
                onClick={() => onPlay && onPlay(album.spotify_id)}
              >
                {album.image_url
                  ? <img src={album.image_url} alt={album.name} width={44} height={44} />
                  : <div className="album-card-placeholder" />
                }
                <div className="album-card-info">
                  <span className="album-card-name">{album.name}</span>
                  <span className="album-card-artist">{album.artists.join(', ')}</span>
                </div>
                <span className="album-card-year">{formatYear(album.release_date)}</span>
                <button
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                  className="album-card-expand-btn"
                  onClick={e => { e.stopPropagation(); handleExpand(album.spotify_id) }}
                >
                  <span className={`expand-chevron${isExpanded ? ' expanded' : ''}`}>›</span>
                </button>
              </div>

              {isExpanded && (
                <div className="album-card-tracks">
                  {exp.loading ? (
                    <div className="album-card-track-row">
                      <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading tracks…</span>
                    </div>
                  ) : (
                    exp.tracks.map(t => {
                      const isActive = playingTrackName && t.name === playingTrackName
                      return (
                        <div
                          key={t.track_number}
                          className={`album-card-track-row${isActive ? ' now-playing' : ''}`}
                          onClick={() => onPlayTrack && onPlayTrack(`spotify:track:${t.spotify_id}`)}
                        >
                          <span className="album-card-track-number">{t.track_number}</span>
                          <span className={`album-card-track-name${isActive ? ' active' : ''}`}>{t.name}</span>
                          <span className="album-card-track-duration">{t.duration}</span>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <table className="album-table">
      <thead>
        <tr>
          <th></th>
          <th></th>
          {COLUMNS.map(col => (
            <th key={col.key} onClick={() => handleHeaderClick(col.key)}>
              {col.label}{sortKey === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
            </th>
          ))}
          <th style={{ cursor: 'default' }}>Collections</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(album => {
          const isExpanded = !!expanded[album.spotify_id]
          const isPlaying = playingId === album.spotify_id
          const albumCollectionIds = (albumCollectionMap && albumCollectionMap[album.spotify_id]) || []

          function handleAlbumKeyDown(e) {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              navigateRow(`row-album-${album.spotify_id}`, 'down')
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              navigateRow(`row-album-${album.spotify_id}`, 'up')
            } else if (e.key === 'ArrowRight') {
              e.preventDefault()
              if (!isExpanded && onFetchTracks) handleExpand(album.spotify_id)
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault()
              if (isExpanded) handleExpand(album.spotify_id)
            } else if (e.key === 'Enter') {
              e.preventDefault()
              onPlay && onPlay(album.spotify_id)
            } else if (e.key === 'Escape') {
              e.currentTarget.blur()
            }
          }

          return [
            <tr
              key={album.spotify_id}
              id={`row-album-${album.spotify_id}`}
              className={`album-row${isPlaying ? ' now-playing' : ''}`}
              tabIndex={0}
              onKeyDown={handleAlbumKeyDown}
              onDoubleClick={() => onPlay && onPlay(album.spotify_id)}
            >
              <td>
                <button
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                  onClick={() => handleExpand(album.spotify_id)}
                  className="expand-btn"
                  style={{ fontSize: 20 }}
                >
                  <span className={`expand-chevron${isExpanded ? ' expanded' : ''}`}>›</span>
                </button>
              </td>
              <td>
                {album.image_url
                  ? <img src={album.image_url} alt={album.name} width={40} height={40} style={{ display: 'block' }} />
                  : <img src={null} alt="No cover" width={40} height={40} style={{ display: 'block', background: '#333' }} />
                }
              </td>
              <td>{album.name}</td>
              <td>{album.artists.join(', ')}</td>
              <td>{formatYear(album.release_date)}</td>
              <td>{formatDateAdded(album.added_at)}</td>
              <td>
                {collections !== undefined && (
                  <CollectionsBubble
                    albumCollectionIds={albumCollectionIds}
                    collections={collections || []}
                    onToggle={(colId, add) => onToggleCollection?.(album.spotify_id, colId, add)}
                    onCreate={name => onCreateCollection?.(name)}
                  />
                )}
              </td>
            </tr>,
            isExpanded && (
              <TrackList
                key={`${album.spotify_id}-tracks`}
                tracks={expanded[album.spotify_id].tracks}
                loading={expanded[album.spotify_id].loading}
                onPlayTrack={onPlayTrack}
                playingTrackId={playingTrackId}
                playingTrackName={playingTrackName}
                navigateRow={navigateRow}
                onCollapseToAlbum={() => {
                  handleExpand(album.spotify_id)
                  setTimeout(() => document.getElementById(`row-album-${album.spotify_id}`)?.focus(), 0)
                }}
              />
            ),
          ]
        })}
      </tbody>
    </table>
  )
}
