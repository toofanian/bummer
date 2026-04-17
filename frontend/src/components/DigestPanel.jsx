import { useEffect, useState } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'
import { apiFetch } from '../api'

function formatDate(d) {
  return d.toISOString().split('T')[0]
}

function defaultRange() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 7)
  return { start: formatDate(start), end: formatDate(end) }
}

export default function DigestPanel({ open, onClose, onPlay, session }) {
  const [activeTab, setActiveTab] = useState('digest')
  const [range, setRange] = useState(defaultRange)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [noSnapshots, setNoSnapshots] = useState(false)
  const isMobile = useIsMobile()

  // Reset to digest tab when panel closes so changelog remounts fresh on reopen
  useEffect(() => {
    if (!open) setActiveTab('digest')
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setNoSnapshots(false)
    setData(null)
    apiFetch(`/digest?start=${range.start}&end=${range.end}`, {}, session)
      .then(res => {
        if (cancelled) return null
        if (res.status === 404) { setNoSnapshots(true); setLoading(false); return null }
        if (!res.ok) throw new Error('Failed to load digest')
        return res.json()
      })
      .then(json => { if (cancelled) return; if (json) setData(json); setLoading(false) })
      .catch(err => { if (cancelled) return; setError(err.message); setLoading(false) })
    return () => { cancelled = true }
  }, [open, range.start, range.end])

  // Mobile: full-screen overlay (like FullScreenNowPlaying)
  // Desktop: side panel 320px (like NowPlayingPane)

  // Build className and inline style based on isMobile
  const paneClassName = isMobile
    ? `fixed inset-0 z-[300] bg-bg flex flex-col transition-transform duration-300 ease-out ${open ? 'translate-y-0' : 'translate-y-full'}`
    : `fixed top-0 right-0 w-[320px] bg-surface border-l border-border flex flex-col z-[150] transition-transform duration-[250ms] ease ${open ? 'translate-x-0' : 'translate-x-[320px]'}`

  const paneInlineStyle = isMobile
    ? { paddingTop: 'env(safe-area-inset-top, 0px)' }
    : { bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }

  return (
    <aside role="complementary" aria-label="Library digest" aria-hidden={open ? undefined : 'true'}
      className={paneClassName} style={paneInlineStyle}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-border flex-shrink-0">
        <span className="text-xs font-bold tracking-wider uppercase text-text-dim">Library Digest</span>
        <button aria-label="Close digest" onClick={onClose}
          className="bg-transparent border-none text-text-dim cursor-pointer py-1 px-1.5 rounded text-base leading-none transition-colors duration-150 hover:text-text">
          &#x2715;
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border flex-shrink-0" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === 'digest'}
          onClick={() => setActiveTab('digest')}
          className={`flex-1 py-2 text-xs font-bold tracking-wider uppercase transition-colors duration-150 ${activeTab === 'digest' ? 'text-text border-b-2 border-accent' : 'text-text-dim hover:text-text'}`}
        >
          Digest
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'changelog'}
          onClick={() => setActiveTab('changelog')}
          className={`flex-1 py-2 text-xs font-bold tracking-wider uppercase transition-colors duration-150 ${activeTab === 'changelog' ? 'text-text border-b-2 border-accent' : 'text-text-dim hover:text-text'}`}
        >
          Changelog
        </button>
      </div>

      {activeTab === 'digest' && (<>
        {/* Date range picker */}
        <div className="px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex gap-2 items-center text-xs text-text-dim">
            <input type="date" value={range.start}
              onChange={e => setRange(r => ({ ...r, start: e.target.value }))}
              className="bg-bg text-text border border-border rounded py-1 px-1.5 text-xs" />
            <span>to</span>
            <input type="date" value={range.end}
              onChange={e => setRange(r => ({ ...r, end: e.target.value }))}
              className="bg-bg text-text border border-border rounded py-1 px-1.5 text-xs" />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-2">
          {loading && <div className="px-4 py-6 text-text-dim text-sm">Loading digest...</div>}
          {error && <div className="px-4 py-6 text-[#f88] text-sm">Error: {error}</div>}
          {noSnapshots && <div className="px-4 py-6 text-text-dim text-sm italic">Digests will appear after your library has been tracked for at least a day.</div>}
          {data && (
            <>
              <DigestSection title="Added" albums={data.added} emptyText="No albums added this period" onPlay={onPlay} />
              <DigestSection title="Removed" albums={data.removed} emptyText="No albums removed this period" onPlay={onPlay} muted />
              <DigestSection title="Listened" albums={data.listened} emptyText="No albums played this period" onPlay={onPlay} showPlayCount />
            </>
          )}
        </div>
      </>)}

      {activeTab === 'changelog' && (
        <div className="flex-1 overflow-y-auto py-2">
          <ChangelogTab onPlay={onPlay} session={session} />
        </div>
      )}
    </aside>
  )
}

function ChangelogTab({ onPlay, session }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
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
    <>
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
    </>
  )
}

function DigestSection({ title, albums, emptyText, onPlay, muted, showPlayCount }) {
  return (
    <div className="py-2">
      <div className="px-4 py-1 pb-2 text-xs font-bold tracking-wider uppercase text-text-dim">
        {title} ({albums.length})
      </div>
      {albums.length === 0 ? (
        <div className="px-4 py-1 pb-3 text-xs text-text-dim italic">{emptyText}</div>
      ) : (
        albums.map(album => (
          <div key={album.service_id} onClick={() => onPlay(album.service_id)}
            className="flex items-center gap-2.5 px-4 py-1.5 cursor-pointer transition-colors duration-150 hover:bg-surface-2"
            style={muted ? { opacity: 0.5 } : undefined}>
            {album.image_url && (
              <img src={album.image_url} alt=""
                className="w-9 h-9 rounded-[3px] flex-shrink-0 object-cover" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-text truncate">{album.name ?? 'Unknown album'}</div>
              <div className="text-xs text-text-dim truncate">{album.artists?.join(', ') ?? 'Unknown artist'}</div>
            </div>
            {showPlayCount && album.play_count != null && (
              <span className="text-xs font-semibold text-text-dim bg-border rounded-full py-0.5 px-[7px] flex-shrink-0">
                {album.play_count}
              </span>
            )}
          </div>
        ))
      )}
    </div>
  )
}
