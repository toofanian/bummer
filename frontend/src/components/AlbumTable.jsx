import { useState } from 'react'
import TierSelector from './TierSelector'

const COLUMNS = [
  { key: 'name',        label: 'Album'      },
  { key: 'artists',     label: 'Artist'     },
  { key: 'release_date',label: 'Year'       },
  { key: 'added_at',    label: 'Date Added' },
  { key: 'total_tracks',label: 'Tracks'     },
  { key: 'tier',        label: 'Tier'       },
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

export default function AlbumTable({ albums, metadata = {}, loading, onTierChange }) {
  const [sortKey, setSortKey] = useState('added_at')
  const [sortDir, setSortDir] = useState('desc')

  if (loading) return <p>Loading...</p>
  if (!albums.length) return <p>No albums found.</p>

  function handleHeaderClick(key) {
    if (key === 'tier') return  // tier column not sortable for now
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = sortAlbums(albums, sortKey, sortDir)

  return (
    <table>
      <thead>
        <tr>
          {COLUMNS.map(col => (
            <th key={col.key} onClick={() => handleHeaderClick(col.key)}
              style={{ cursor: col.key === 'tier' ? 'default' : 'pointer' }}>
              {col.label}
              {sortKey === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map(album => {
          const tier = metadata[album.spotify_id]?.tier ?? null
          return (
            <tr key={album.spotify_id}>
              <td>{album.name}</td>
              <td>{album.artists.join(', ')}</td>
              <td>{formatYear(album.release_date)}</td>
              <td>{formatDateAdded(album.added_at)}</td>
              <td>{album.total_tracks}</td>
              <td>
                <TierSelector
                  tier={tier}
                  onChange={newTier => onTierChange(album.spotify_id, newTier)}
                />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
