import { useState, useRef, useCallback, useEffect } from 'react'

const styles = {
  bar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    height: '64px',
    background: 'var(--surface)',
    borderTop: '1px solid var(--border)',
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    padding: '0 16px',
    zIndex: 200,
    gap: '8px',
  },
  // --- Left zone ---
  leftZone: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    minWidth: 0,
    overflow: 'hidden',
  },
  artPlaceholder: {
    width: '40px',
    height: '40px',
    background: 'var(--surface-2)',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color: 'var(--text-dim)',
    fontSize: '18px',
  },
  trackInfo: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    overflow: 'hidden',
  },
  trackName: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  artistName: {
    fontSize: '12px',
    color: 'var(--text-dim)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  nothingPlaying: {
    fontSize: '13px',
    color: 'var(--text-dim)',
    fontStyle: 'italic',
  },
  // --- Center zone ---
  centerZone: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-dim)',
    cursor: 'pointer',
    padding: '6px 8px',
    borderRadius: '4px',
    fontSize: '16px',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.15s, background 0.15s',
  },
  // Prominent play/pause: filled circle
  playPauseBtn: {
    background: 'var(--text)',
    border: 'none',
    color: 'var(--bg)',
    cursor: 'pointer',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    fontSize: '14px',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.1s, background 0.15s',
    flexShrink: 0,
  },
  messageText: {
    fontSize: '11px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '280px',
  },
  // --- Right zone ---
  rightZone: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    justifyContent: 'flex-end',
    minWidth: 0,
    overflow: 'hidden',
  },
  deviceName: {
    fontSize: '11px',
    color: 'var(--text-dim)',
    opacity: 0.7,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '100px',
  },
  volumeSlider: {
    width: '80px',
    cursor: 'pointer',
    accentColor: 'var(--accent)',
  },
  iconBtnActive: {
    color: 'var(--text)',
    background: 'var(--surface-2)',
  },
}

function useDebouncedCallback(fn, delay) {
  const timer = useRef(null)
  return useCallback((...args) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => fn(...args), delay)
  }, [fn, delay])
}

/**
 * PlaybackBar
 *
 * Props:
 *   state               — playback state from usePlayback: { is_playing, track, device }
 *   onPlay              — () => void
 *   onPause             — () => void
 *   onPrevious          — () => void   previous track
 *   onNext              — () => void   next track
 *   onSetVolume         — (n: number) => void   set volume 0–100 (debounced internally)
 *   paneOpen            — boolean
 *   onTogglePane        — () => void
 *   albumImageUrl       — string | null
 *   message             — { code: string, text: string } | null
 *   nowPlayingSpotifyId — string | null
 *   onFocusAlbum        — (spotifyId: string) => void
 */
export default function PlaybackBar({
  state,
  onPlay,
  onPause,
  onPrevious,
  onNext,
  onSetVolume,
  paneOpen,
  onTogglePane,
  albumImageUrl,
  message,
  nowPlayingSpotifyId,
  onFocusAlbum,
}) {
  const { is_playing, track, device } = state
  const [volume, setVolume] = useState(50)

  const artistLine = track ? track.artists.join(', ') : null

  const toggleBtnStyle = {
    ...styles.iconBtn,
    ...(paneOpen ? styles.iconBtnActive : {}),
  }

  const isError = message?.code && message.code !== 'INFO'
  const messageTextStyle = {
    ...styles.messageText,
    color: isError ? 'rgba(255,100,100,0.85)' : 'var(--text-dim)',
  }

  const debouncedSetVolume = useDebouncedCallback(
    (v) => { if (onSetVolume) onSetVolume(v) },
    300
  )

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key !== ' ') return
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      e.preventDefault()
      if (is_playing) {
        onPause()
      } else {
        onPlay()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [is_playing, onPause, onPlay])

  function handleVolumeChange(e) {
    const v = Number(e.target.value)
    setVolume(v)
    debouncedSetVolume(v)
  }

  return (
    <div
      role="region"
      aria-label="Playback bar"
      style={styles.bar}
    >
      {/* LEFT ZONE: album art + track info */}
      <div data-testid="playback-left" style={styles.leftZone}>
        <div
          className={`now-playing-card${track && nowPlayingSpotifyId ? '' : ' now-playing-card--inactive'}`}
          onClick={track && nowPlayingSpotifyId ? () => onFocusAlbum(nowPlayingSpotifyId) : undefined}
          role={track && nowPlayingSpotifyId ? 'button' : undefined}
          aria-label={track && nowPlayingSpotifyId ? 'Go to now playing album' : undefined}
          tabIndex={track && nowPlayingSpotifyId ? 0 : undefined}
          onKeyDown={track && nowPlayingSpotifyId ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFocusAlbum(nowPlayingSpotifyId) } } : undefined}
        >
          {albumImageUrl ? (
            <img
              src={albumImageUrl}
              alt="Album art"
              style={{ ...styles.artPlaceholder, objectFit: 'cover' }}
            />
          ) : (
            <div role="img" aria-label="Album art" style={styles.artPlaceholder}>♪</div>
          )}

          <div style={styles.trackInfo}>
            {track ? (
              <>
                <span style={styles.trackName}>{track.name}</span>
                <span style={styles.artistName}>{artistLine}</span>
              </>
            ) : (
              <span style={styles.nothingPlaying}>Nothing playing</span>
            )}
          </div>
        </div>
      </div>

      {/* CENTER ZONE: previous / play-pause / next + message */}
      <div data-testid="playback-center" style={styles.centerZone}>
        <div style={styles.controls}>
          <button
            aria-label="Previous track"
            style={styles.iconBtn}
            onClick={onPrevious}
          >
            ⏮
          </button>

          {is_playing ? (
            <button
              aria-label="Pause"
              data-prominent="true"
              style={styles.playPauseBtn}
              onClick={onPause}
            >
              ⏸
            </button>
          ) : (
            <button
              aria-label="Play"
              data-prominent="true"
              style={styles.playPauseBtn}
              onClick={onPlay}
            >
              ▶
            </button>
          )}

          <button
            aria-label="Next track"
            style={styles.iconBtn}
            onClick={onNext}
          >
            ⏭
          </button>
        </div>

        {message && (
          <span role="status" style={messageTextStyle}>{message.text}</span>
        )}
      </div>

      {/* RIGHT ZONE: volume + device name + pane toggle */}
      <div data-testid="playback-right" style={styles.rightZone}>
        {onSetVolume != null && (
          <input
            type="range"
            aria-label="Volume"
            min="0"
            max="100"
            value={volume}
            onChange={handleVolumeChange}
            style={styles.volumeSlider}
          />
        )}

        {device && (
          <span style={styles.deviceName}>▸ {device.name}</span>
        )}

        <button
          aria-label="Now playing"
          aria-pressed={paneOpen}
          style={toggleBtnStyle}
          onClick={onTogglePane}
        >
          ≡
        </button>
      </div>
    </div>
  )
}
