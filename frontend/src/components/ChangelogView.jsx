import { useEffect, useState } from 'react'
import { apiFetch } from '../api'

export default function ChangelogView({ onPlay, session }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    apiFetch('/digest/changelog', {}, session)
      .then(res => {
        if (cancelled) return null
        if (!res.ok) throw new Error('Failed to load changelog')
        return res.json()
      })
      .then(json => {
        if (cancelled || !json) return
        setEntries(json.entries)
        setHasMore(json.has_more)
        setNextCursor(json.next_cursor)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  function handleLoadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    apiFetch(`/digest/changelog?before=${nextCursor}`, {}, session)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load more')
        return res.json()
      })
      .then(json => {
        setEntries(prev => [...prev, ...json.entries])
        setHasMore(json.has_more)
        setNextCursor(json.next_cursor)
        setLoadingMore(false)
      })
      .catch(() => setLoadingMore(false))
  }

  if (loading) return <div className="px-4 py-6 text-text-dim text-sm">Loading changelog...</div>
  if (error) return <div className="px-4 py-6 text-[#f88] text-sm">Error: {error}</div>
  if (entries.length === 0) return <div className="px-4 py-6 text-text-dim text-sm italic">No changes recorded yet.</div>

  return (
    <div>
      {entries.map((entry, i) => (
        <div key={entry.date + i} className="py-2">
          <div className="px-4 py-1 text-xs font-bold tracking-wider text-text-dim">{entry.date}</div>
          {entry.added.map(album => (
            <div key={album.service_id} onClick={() => onPlay(album.service_id)}
              className="flex items-center gap-2.5 px-4 py-1.5 cursor-pointer transition-colors duration-150 hover:bg-surface-2">
              <span className="text-green-400 text-xs font-bold flex-shrink-0">+</span>
              {album.image_url && <img src={album.image_url} alt="" className="w-9 h-9 rounded-[3px] flex-shrink-0 object-cover" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text truncate">{album.name ?? 'Unknown album'}</div>
                <div className="text-xs text-text-dim truncate">{album.artists?.join(', ') ?? 'Unknown artist'}</div>
              </div>
            </div>
          ))}
          {entry.removed.map(album => (
            <div key={album.service_id} onClick={() => onPlay(album.service_id)}
              className="flex items-center gap-2.5 px-4 py-1.5 cursor-pointer transition-colors duration-150 hover:bg-surface-2"
              style={{ opacity: 0.5 }}>
              <span className="text-red-400 text-xs font-bold flex-shrink-0">&minus;</span>
              {album.image_url && <img src={album.image_url} alt="" className="w-9 h-9 rounded-[3px] flex-shrink-0 object-cover" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text truncate">{album.name ?? 'Unknown album'}</div>
                <div className="text-xs text-text-dim truncate">{album.artists?.join(', ') ?? 'Unknown artist'}</div>
              </div>
            </div>
          ))}
        </div>
      ))}
      {hasMore && (
        <button onClick={handleLoadMore} disabled={loadingMore}
          className="w-full py-3 text-xs text-text-dim hover:text-text transition-colors duration-150 disabled:opacity-50">
          {loadingMore ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  )
}
