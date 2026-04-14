import { useEffect, useState, useRef } from 'react'
import { formatTime } from '../utils/playback'

function VinylRecord({ isPlaying, albumImageUrl, size = 180 }) {
  return (
    <svg
      role="img"
      aria-label="Vinyl record"
      width={size}
      height={size}
      viewBox="0 0 200 200"
      style={{
        animation: 'spin-record 3s linear infinite',
        animationPlayState: isPlaying ? 'running' : 'paused',
        display: 'block',
      }}
    >
      <defs>
        <clipPath id="label-clip">
          <circle cx="100" cy="100" r="34" />
        </clipPath>
      </defs>
      {/* Outer record body */}
      <circle cx="100" cy="100" r="99" fill="#111" />
      {/* Groove rings */}
      {[88, 78, 68, 58, 50, 43].map(r => (
        <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="#1e1e1e" strokeWidth="1.5" />
      ))}
      {/* Center label — album art or plain disc */}
      {albumImageUrl ? (
        <image
          href={albumImageUrl}
          x="66" y="66" width="68" height="68"
          clipPath="url(#label-clip)"
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <>
          <circle cx="100" cy="100" r="34" fill="#2a2a2a" />
          <circle cx="100" cy="100" r="28" fill="none" stroke="#333" strokeWidth="1" />
        </>
      )}
      {/* Spindle hole */}
      <circle cx="100" cy="100" r="5" fill="#0a0a0a" />
    </svg>
  )
}

/**
 * NowPlayingPane
 *
 * Props:
 *   state           — playback state: { is_playing, track, device }
 *   open            — boolean  whether the pane is visible
 *   onClose         — () => void
 *   onFetchTracks   — (spotifyId: string) => Promise<Track[]>
 *   albumSpotifyId  — string | null  spotify_id of the currently playing album
 *   albumImageUrl   — string | undefined  album art URL for the vinyl label
 */
export default function NowPlayingPane({ state, open, onClose, onFetchTracks, albumSpotifyId, albumImageUrl, onPlayTrack, onFetchQueue }) {
  const [tracks, setTracks] = useState([])
  const [tracksLoading, setTracksLoading] = useState(false)
  const [queue, setQueue] = useState([])
  const queueIntervalRef = useRef(null)

  useEffect(() => {
    if (!albumSpotifyId) {
      setTracks([])
      return
    }

    let cancelled = false
    setTracksLoading(true)
    const promise = onFetchTracks(albumSpotifyId)
    // Guard against an onFetchTracks that doesn't return a promise (e.g. bare vi.fn())
    if (!promise || typeof promise.then !== 'function') {
      setTracksLoading(false)
      return () => { cancelled = true }
    }
    promise.then(result => {
      if (!cancelled) {
        setTracks(result)
        setTracksLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [albumSpotifyId])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !state.track || !onFetchQueue) {
      setQueue([])
      return
    }

    let cancelled = false

    async function fetchQueue() {
      try {
        const data = await onFetchQueue()
        if (!cancelled) setQueue(data?.queue ?? [])
      } catch {
        if (!cancelled) setQueue([])
      }
    }

    fetchQueue()
    queueIntervalRef.current = setInterval(fetchQueue, 30000)

    return () => {
      cancelled = true
      clearInterval(queueIntervalRef.current)
    }
  }, [open, !!state.track, onFetchQueue]) // eslint-disable-line react-hooks/exhaustive-deps

  const { track, device } = state
  const currentTrackName = track?.name ?? null

  const paneClasses = [
    'fixed top-0 right-0 w-[320px] bg-surface border-l border-border flex flex-col z-[150] overflow-y-auto transition-transform duration-[250ms] ease',
    open ? 'translate-x-0' : 'translate-x-[320px]',
  ].join(' ')

  return (
    <aside
      role="complementary"
      aria-label="Now playing"
      aria-hidden={open ? undefined : 'true'}
      className={paneClasses}
      style={{ bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-border flex-shrink-0">
        <span className="text-xs font-bold tracking-wider uppercase text-text-dim">Now Playing</span>
        <button
          aria-label="Close now playing"
          className="bg-transparent border-none text-text-dim cursor-pointer py-1 px-1.5 rounded text-base leading-none transition-colors duration-150 hover:text-text"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {/* Album / artist section */}
      {track ? (
        <div className="px-4 pt-6 pb-4 border-b border-border flex-shrink-0 flex flex-col items-center gap-3">
          <div className="flex justify-center">
            <VinylRecord isPlaying={state.is_playing} albumImageUrl={albumImageUrl} size={180} />
          </div>
          <div className="text-sm font-semibold text-text mb-0.5 truncate text-center w-full">{track.album}</div>
          <div className="text-xs text-text-dim truncate text-center w-full">{track.artists.join(', ')}</div>
          {device && (
            <div className="text-xs text-text-dim mt-0.5 text-center">Playing on {device.name}</div>
          )}
        </div>
      ) : (
        <div className="p-4 text-sm text-text-dim italic">Nothing playing</div>
      )}

      {/* Track list */}
      {track && (
        <div className="flex-1 overflow-y-auto py-2">
          {albumSpotifyId === null ? (
            <div className="p-4 text-sm text-text-dim italic">Track list unavailable</div>
          ) : tracksLoading ? (
            <div className="p-4 text-sm text-text-dim">Loading tracks…</div>
          ) : (
            tracks.map(t => {
              const isActive = t.name === currentTrackName
              const clickable = !!onPlayTrack
              return (
                <div
                  key={t.track_number}
                  data-active={isActive ? 'true' : undefined}
                  className="now-playing-track-row flex items-center gap-2.5 py-[7px] px-4 transition-colors duration-150"
                  style={{ cursor: clickable ? 'pointer' : 'default' }}
                  onClick={onPlayTrack ? () => onPlayTrack(`spotify:track:${t.spotify_id}`) : undefined}
                >
                  <span className="text-xs text-text-dim min-w-[18px] text-right flex-shrink-0">{t.track_number}</span>
                  <span className={`text-sm flex-1 truncate ${isActive ? 'text-text font-semibold' : 'text-text-dim font-normal'}`}>{t.name}</span>
                  <span className="text-xs text-text-dim flex-shrink-0">{t.duration}</span>
                </div>
              )
            })
          )}

          {/* Up Next queue */}
          {queue.length > 0 && (
            <div className="border-t border-border mt-2 pt-2">
              <div className="px-4 py-1 text-xs font-bold tracking-wider uppercase text-text-dim">Up Next</div>
              {queue.map((item, i) => (
                <div key={i} className="flex items-center gap-2.5 py-[7px] px-4">
                  <span className="text-sm flex-1 truncate text-text-dim">{item.name}</span>
                  <span className="text-xs text-text-dim flex-shrink-0">{item.artists.join(', ')}</span>
                  <span className="text-xs text-text-dim flex-shrink-0">{formatTime(item.duration_ms)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
