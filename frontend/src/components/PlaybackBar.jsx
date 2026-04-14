import { useState, useRef, useCallback, useEffect } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'

const styles = {
  bar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    minHeight: '64px',
    background: 'var(--surface)',
    borderTop: '1px solid var(--border)',
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    paddingTop: '0',
    paddingRight: '16px',
    paddingLeft: '16px',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
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
    padding: '4px 6px',
    borderRadius: '4px',
    fontSize: '13px',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.15s, background 0.15s',
  },
  // Prominent play/pause: pill / rounded rectangle
  playPauseBtn: {
    background: 'var(--text)',
    border: 'none',
    color: 'var(--bg)',
    cursor: 'pointer',
    height: '20px',
    padding: '0 12px',
    borderRadius: '10px',
    fontSize: '18px',
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
    maxWidth: '420px',
  },
  messageCode: {
    fontWeight: 700,
    marginRight: '5px',
    letterSpacing: '0.04em',
  },
  // --- Right zone ---
  rightZone: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  deviceName: {
    fontSize: '13px',
    color: 'var(--text-dim)',
    opacity: 0.7,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '200px',
  },
  devicePickerBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-dim)',
    opacity: 0.7,
    cursor: 'pointer',
    fontSize: '13px',
    padding: '2px 4px',
    borderRadius: '4px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '200px',
    lineHeight: 1,
  },
  devicePopover: {
    position: 'absolute',
    bottom: 'calc(100% + 8px)',
    right: 0,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '4px 0',
    minWidth: '200px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    zIndex: 300,
  },
  deviceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: '13px',
    color: 'var(--text)',
    userSelect: 'none',
  },
  deviceRowActive: {
    color: 'var(--text-dim)',
    cursor: 'default',
  },
  devicePopoverMessage: {
    padding: '8px 12px',
    fontSize: '13px',
    color: 'var(--text-dim)',
    fontStyle: 'italic',
  },
  toggleBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-dim)',
    cursor: 'pointer',
    padding: '8px 14px',
    borderRadius: '4px',
    fontSize: '22px',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.15s, background 0.15s',
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

const THUMB = 12

function VolumeSlider({ value, onChange }) {
  const containerRef = useRef(null)

  function getValueFromPointer(e) {
    const rect = containerRef.current.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    return Math.round(pct * 100)
  }

  function handlePointerDown(e) {
    e.preventDefault()
    containerRef.current.setPointerCapture(e.pointerId)
    onChange(getValueFromPointer(e))
  }

  function handlePointerMove(e) {
    if (!containerRef.current.hasPointerCapture(e.pointerId)) return
    onChange(getValueFromPointer(e))
  }

  function handleKeyDown(e) {
    let next = value
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(100, value + 5)
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, value - 5)
    if (next !== value) { e.preventDefault(); onChange(next) }
  }

  const pct = value / 100
  return (
    <div
      ref={containerRef}
      role="slider"
      aria-label="Volume"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onKeyDown={handleKeyDown}
      style={{ position: 'relative', width: '100px', height: `${THUMB}px`, cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}
    >
      <div style={{ position: 'absolute', left: 0, right: 0, height: '3px', background: 'var(--surface-2)', borderRadius: '2px' }} />
      <div style={{ position: 'absolute', left: `calc(${pct} * (100% - ${THUMB}px))`, width: `${THUMB}px`, height: `${THUMB}px`, borderRadius: '50%', background: 'var(--text)' }} />
    </div>
  )
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
  onFetchDevices,
  onTransferPlayback,
}) {
  const { is_playing, track, device } = state
  const [volume, setVolume] = useState(50)
  const isMobile = useIsMobile()
  const [devicesOpen, setDevicesOpen] = useState(false)
  const [devices, setDevices] = useState([])
  const [devicesLoading, setDevicesLoading] = useState(false)
  const devicePickerRef = useRef(null)

  const artistLine = track ? track.artists.join(', ') : null

  const toggleBtnStyle = {
    ...styles.toggleBtn,
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

  useEffect(() => {
    if (!devicesOpen) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') setDevicesOpen(false)
    }
    function handleMouseDown(e) {
      if (devicePickerRef.current && !devicePickerRef.current.contains(e.target)) {
        setDevicesOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [devicesOpen])

  async function handleOpenDevicePicker() {
    setDevicesOpen(true)
    setDevicesLoading(true)
    setDevices([])
    const list = await onFetchDevices()
    setDevices(list)
    setDevicesLoading(false)
  }

  async function handleTransfer(deviceId) {
    setDevicesOpen(false)
    await onTransferPlayback(deviceId)
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
        {!isMobile && onSetVolume != null && (
          <VolumeSlider
            value={volume}
            onChange={(v) => { setVolume(v); debouncedSetVolume(v) }}
          />
        )}

        {!isMobile && (device && onFetchDevices ? (
          <div ref={devicePickerRef} style={{ position: 'relative' }}>
            <button
              aria-label={device.name}
              style={styles.devicePickerBtn}
              onClick={handleOpenDevicePicker}
            >
              ▸ {device.name} ▾
            </button>
            {devicesOpen && (
              <div style={styles.devicePopover} role="listbox" aria-label="Select device">
                {devicesLoading ? (
                  <div style={styles.devicePopoverMessage}>...</div>
                ) : devices.length === 0 ? (
                  <div style={styles.devicePopoverMessage}>No other devices found</div>
                ) : (
                  devices.map(d => (
                    <div
                      key={d.id}
                      data-testid="device-row"
                      role="option"
                      aria-selected={d.is_active}
                      style={{
                        ...styles.deviceRow,
                        ...(d.is_active ? styles.deviceRowActive : {}),
                      }}
                      onClick={d.is_active ? undefined : () => handleTransfer(d.id)}
                    >
                      <span style={{ width: '14px', flexShrink: 0 }}>{d.is_active ? '✓' : ''}</span>
                      <span data-testid="device-option">{d.name}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginLeft: 'auto' }}>{d.type}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ) : device ? (
          <span style={styles.deviceName}>▸ {device.name}</span>
        ) : null)}

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
