import { useEffect, useState } from 'react'

const PANE_WIDTH = 300

const styles = {
  pane: (open) => ({
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: '64px',           // sit above PlaybackBar
    width: `${PANE_WIDTH}px`,
    background: 'var(--surface)',
    borderLeft: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 150,
    transform: open ? 'translateX(0)' : `translateX(${PANE_WIDTH}px)`,
    transition: 'transform 0.25s ease',
    overflowY: 'auto',
  }),
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px 10px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color: 'var(--text-dim)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-dim)',
    cursor: 'pointer',
    padding: '4px 6px',
    borderRadius: '4px',
    fontSize: '16px',
    lineHeight: 1,
  },
  albumSection: {
    padding: '24px 16px 16px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  recordWrap: {
    display: 'flex',
    justifyContent: 'center',
  },
  albumName: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text)',
    marginBottom: '2px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    textAlign: 'center',
    width: '100%',
  },
  artistName: {
    fontSize: '12px',
    color: 'var(--text-dim)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    textAlign: 'center',
    width: '100%',
  },
  deviceLine: {
    fontSize: '11px',
    color: 'var(--text-dim)',
    marginTop: '2px',
    textAlign: 'center',
  },
  idleMsg: {
    padding: '16px',
    fontSize: '13px',
    color: 'var(--text-dim)',
    fontStyle: 'italic',
  },
  trackListSection: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 0',
  },
  trackRow: (clickable) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '7px 16px',
    cursor: clickable ? 'pointer' : 'default',
  }),
  trackNumber: {
    fontSize: '12px',
    color: 'var(--text-dim)',
    minWidth: '18px',
    textAlign: 'right',
    flexShrink: 0,
  },
  trackName: (isActive) => ({
    fontSize: '13px',
    flex: 1,
    color: isActive ? 'var(--text)' : 'var(--text-dim)',
    fontWeight: isActive ? 600 : 400,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }),
  trackDuration: {
    fontSize: '12px',
    color: 'var(--text-dim)',
    flexShrink: 0,
  },
  loadingMsg: {
    padding: '16px',
    fontSize: '13px',
    color: 'var(--text-dim)',
  },
  unavailableMsg: {
    padding: '16px',
    fontSize: '13px',
    color: 'var(--text-dim)',
    fontStyle: 'italic',
  },
}

const SPIN_STYLE = `
  @keyframes spin-record {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
`

function VinylRecord({ isPlaying, albumImageUrl }) {
  return (
    <>
      <style>{SPIN_STYLE}</style>
      <svg
        role="img"
        aria-label="Vinyl record"
        width="180"
        height="180"
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
    </>
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
export default function NowPlayingPane({ state, open, onClose, onFetchTracks, albumSpotifyId, albumImageUrl, onPlayTrack }) {
  const [tracks, setTracks] = useState([])
  const [tracksLoading, setTracksLoading] = useState(false)

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

const { track, device } = state
  const currentTrackName = track?.name ?? null

  return (
    <aside
      role="complementary"
      aria-label="Now playing"
      aria-hidden={open ? undefined : 'true'}
      style={styles.pane(open)}
    >
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>Now Playing</span>
        <button
          aria-label="Close now playing"
          style={styles.closeBtn}
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {/* Album / artist section */}
      {track ? (
        <div style={styles.albumSection}>
          <div style={styles.recordWrap}>
            <VinylRecord isPlaying={state.is_playing} albumImageUrl={albumImageUrl} />
          </div>
          <div style={styles.albumName}>{track.album}</div>
          <div style={styles.artistName}>{track.artists.join(', ')}</div>
          {device && (
            <div style={styles.deviceLine}>Playing on {device.name}</div>
          )}
        </div>
      ) : (
        <div style={styles.idleMsg}>Nothing playing</div>
      )}

      {/* Track list */}
      {track && (
        <div style={styles.trackListSection}>
          {albumSpotifyId === null ? (
            <div style={styles.unavailableMsg}>Track list unavailable</div>
          ) : tracksLoading ? (
            <div style={styles.loadingMsg}>Loading tracks…</div>
          ) : (
            tracks.map(t => {
              const isActive = t.name === currentTrackName
              const clickable = !!onPlayTrack
              return (
                <div
                  key={t.track_number}
                  data-active={isActive ? 'true' : undefined}
                  style={styles.trackRow(clickable)}
                  className="now-playing-track-row"
                  onClick={onPlayTrack ? () => onPlayTrack(`spotify:track:${t.spotify_id}`) : undefined}
                >
                  <span style={styles.trackNumber}>{t.track_number}</span>
                  <span style={styles.trackName(isActive)}>{t.name}</span>
                  <span style={styles.trackDuration}>{t.duration}</span>
                </div>
              )
            })
          )}
        </div>
      )}
    </aside>
  )
}
