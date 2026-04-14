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
  const [range, setRange] = useState(defaultRange)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [noSnapshots, setNoSnapshots] = useState(false)
  const isMobile = useIsMobile()

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
    </aside>
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
          <div key={album.spotify_id} onClick={() => onPlay(album.spotify_id)}
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
