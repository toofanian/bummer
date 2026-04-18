import { useEffect, useState } from 'react'
import { apiFetch } from '../api'
import { useIsMobile } from '../hooks/useIsMobile'

function ChangelogSection({ onPlay, session }) {
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

function HistorySection({ onPlay, session }) {
  const [days, setDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    apiFetch('/digest/history', {}, session)
      .then(res => {
        if (cancelled) return null
        if (!res.ok) throw new Error('Failed to load history')
        return res.json()
      })
      .then(json => {
        if (cancelled || !json) return
        setDays(json.days)
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
    apiFetch(`/digest/history?before=${nextCursor}`, {}, session)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load more')
        return res.json()
      })
      .then(json => {
        setDays(prev => [...prev, ...json.days])
        setHasMore(json.has_more)
        setNextCursor(json.next_cursor)
        setLoadingMore(false)
      })
      .catch(() => setLoadingMore(false))
  }

  function formatTime(isoString) {
    const d = new Date(isoString)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  if (loading) return <div className="px-4 py-6 text-text-dim text-sm">Loading history...</div>
  if (error) return <div className="px-4 py-6 text-[#f88] text-sm">Error: {error}</div>
  if (days.length === 0) return <div className="px-4 py-6 text-text-dim text-sm italic">No listening history yet.</div>

  return (
    <div>
      {days.map(day => (
        <div key={day.date} className="py-2">
          <div className="px-4 py-1 text-xs font-bold tracking-wider text-text-dim">{day.date}</div>
          {day.plays.map((play, i) => (
            <div key={play.album.service_id + i} onClick={() => onPlay(play.album.service_id)}
              className="flex items-center gap-2.5 px-4 py-1.5 cursor-pointer transition-colors duration-150 hover:bg-surface-2">
              {play.album.image_url && <img src={play.album.image_url} alt="" className="w-9 h-9 rounded-[3px] flex-shrink-0 object-cover" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text truncate">{play.album.name ?? 'Unknown album'}</div>
                <div className="text-xs text-text-dim truncate">{play.album.artists?.join(', ') ?? 'Unknown artist'}</div>
              </div>
              <span className="text-xs text-text-dim flex-shrink-0">{formatTime(play.played_at)}</span>
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

function StatsSection({ onPlay, session }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    apiFetch('/digest/stats', {}, session)
      .then(res => {
        if (cancelled) return null
        if (!res.ok) throw new Error('Failed to load stats')
        return res.json()
      })
      .then(json => {
        if (cancelled || !json) return
        setStats(json)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  if (loading) return <div className="px-4 py-6 text-text-dim text-sm">Loading stats...</div>
  if (error) return <div className="px-4 py-6 text-[#f88] text-sm">Error: {error}</div>
  if (!stats) return null

  return (
    <div>
      <div className="px-4 pt-2 pb-1 text-xs font-bold tracking-wider uppercase text-text-dim">Top Albums</div>
      {stats.top_albums.map((item, i) => (
        <div key={item.album.service_id} onClick={() => onPlay(item.album.service_id)}
          className="flex items-center gap-2.5 px-4 py-1.5 cursor-pointer transition-colors duration-150 hover:bg-surface-2">
          <span className="text-xs font-semibold text-text-dim w-5 text-right flex-shrink-0">{i + 1}</span>
          {item.album.image_url && <img src={item.album.image_url} alt="" className="w-9 h-9 rounded-[3px] flex-shrink-0 object-cover" />}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-text truncate">{item.album.name ?? 'Unknown album'}</div>
            <div className="text-xs text-text-dim truncate">{item.album.artists?.join(', ') ?? 'Unknown artist'}</div>
          </div>
          <span className="text-xs font-semibold text-text-dim bg-border rounded-full py-0.5 px-[7px] flex-shrink-0">{item.play_count}</span>
        </div>
      ))}

      <div className="px-4 pt-4 pb-1 text-xs font-bold tracking-wider uppercase text-text-dim">Top Artists</div>
      {stats.top_artists.map((item, i) => (
        <div key={item.artist}
          className="flex items-center gap-2.5 px-4 py-1.5">
          <span className="text-xs font-semibold text-text-dim w-5 text-right flex-shrink-0">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-text truncate">{item.artist}</div>
          </div>
          <span className="text-xs font-semibold text-text-dim bg-border rounded-full py-0.5 px-[7px] flex-shrink-0">{item.play_count}</span>
        </div>
      ))}
    </div>
  )
}

export default function ChangelogView({ onPlay, session }) {
  const isMobile = useIsMobile()
  const [activeTab, setActiveTab] = useState('changelog')

  if (!isMobile) {
    return (
      <div className="flex h-full">
        <div className="flex-1 overflow-y-auto border-r border-border">
          <div className="px-4 pt-3 pb-2 text-xs font-bold tracking-wider uppercase text-text-dim">Library Changes</div>
          <ChangelogSection onPlay={onPlay} session={session} />
        </div>
        <div className="flex-1 overflow-y-auto border-r border-border">
          <div className="px-4 pt-3 pb-2 text-xs font-bold tracking-wider uppercase text-text-dim">Listening History</div>
          <HistorySection onPlay={onPlay} session={session} />
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 pt-3 pb-2 text-xs font-bold tracking-wider uppercase text-text-dim">Monthly Stats</div>
          <StatsSection onPlay={onPlay} session={session} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-border flex-shrink-0" role="tablist">
        {['changelog', 'history', 'stats'].map(tab => (
          <button key={tab} role="tab" aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-xs font-bold tracking-wider uppercase transition-colors duration-150 ${
              activeTab === tab ? 'text-text border-b-2 border-accent' : 'text-text-dim hover:text-text'
            }`}>
            {tab === 'changelog' ? 'Changes' : tab === 'history' ? 'History' : 'Stats'}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'changelog' && (
          <>
            <div className="px-4 pt-3 pb-2 text-xs font-bold tracking-wider uppercase text-text-dim">Library Changes</div>
            <ChangelogSection onPlay={onPlay} session={session} />
          </>
        )}
        {activeTab === 'history' && (
          <>
            <div className="px-4 pt-3 pb-2 text-xs font-bold tracking-wider uppercase text-text-dim">Listening History</div>
            <HistorySection onPlay={onPlay} session={session} />
          </>
        )}
        {activeTab === 'stats' && (
          <>
            <div className="px-4 pt-3 pb-2 text-xs font-bold tracking-wider uppercase text-text-dim">Monthly Stats</div>
            <StatsSection onPlay={onPlay} session={session} />
          </>
        )}
      </div>
    </div>
  )
}
