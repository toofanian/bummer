import { useState, useRef, useEffect, useCallback } from 'react'
import DevicePicker, { SpeakerIndicatorIcon } from './DevicePicker'
import { PlayIcon, PauseIcon, PreviousIcon, NextIcon, VolumeIcon } from './icons'
import { formatTime, useDebouncedCallback } from '../utils/playback'

function QueueIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="3" y1="5" x2="15" y2="5" />
      <line x1="3" y1="9" x2="15" y2="9" />
      <line x1="3" y1="13" x2="11" y2="13" />
    </svg>
  )
}

const THUMB = 12

function ProgressBar({ progressMs, durationMs, onSeek }) {
  const barRef = useRef(null)
  const pct = durationMs > 0 ? Math.min(1, (progressMs || 0) / durationMs) : 0

  const getPositionFromPointer = useCallback((e) => {
    const rect = barRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    return Math.round(ratio * durationMs)
  }, [durationMs])

  function handlePointerDown(e) {
    if (!onSeek || !durationMs) return
    e.preventDefault()
    barRef.current.setPointerCapture?.(e.pointerId)
    onSeek(getPositionFromPointer(e))
  }

  function handlePointerMove(e) {
    if (!onSeek || !barRef.current.hasPointerCapture?.(e.pointerId)) return
    onSeek(getPositionFromPointer(e))
  }

  return (
    <div className="flex items-center gap-1.5 w-full max-w-[600px]">
      <span className="text-xs text-text-dim min-w-8 tabular-nums text-right">{formatTime(progressMs)}</span>
      <div
        ref={barRef}
        role="slider"
        aria-label="Track progress"
        aria-valuemin={0}
        aria-valuemax={durationMs || 0}
        aria-valuenow={progressMs || 0}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        className="flex-1 h-1.5 rounded-sm relative overflow-hidden"
        style={{ cursor: onSeek ? 'pointer' : 'default', background: 'rgba(255,255,255,0.2)' }}
      >
        <div
          className="absolute left-0 top-0 bottom-0 rounded-sm transition-[width] duration-300 ease-linear"
          style={{ background: 'rgba(255,255,255,0.85)', width: `${pct * 100}%` }}
        />
      </div>
      <span className="text-xs text-text-dim min-w-8 tabular-nums">{formatTime(durationMs)}</span>
    </div>
  )
}

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
    <div className="flex items-center gap-1.5">
      <VolumeIcon />
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
        <div style={{ position: 'absolute', left: 0, right: 0, height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px' }} />
        <div style={{ position: 'absolute', left: 0, width: `calc(${pct} * 100%)`, height: '4px', background: 'rgba(255,255,255,0.85)', borderRadius: '2px' }} />
        <div style={{ position: 'absolute', left: `calc(${pct} * (100% - ${THUMB}px))`, width: `${THUMB}px`, height: `${THUMB}px`, borderRadius: '50%', background: '#ffffff' }} />
      </div>
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
 *   onFetchDevices      — () => Promise<Device[]>
 *   onDeviceSelected    — (deviceId: string) => void
 *   onOpenDevicePicker  — () => void   called when "Connect a device" is clicked
 */
export default function PlaybackBar({
  state,
  onPlay,
  onPause,
  onPrevious,
  onNext,
  onSetVolume,
  onSeek,
  paneOpen,
  onTogglePane,
  albumImageUrl,
  message,
  nowPlayingSpotifyId,
  onFocusAlbum,
  onFetchDevices,
  onDeviceSelected,
  onOpenDevicePicker,
}) {
  const { is_playing, track, device } = state
  const [volume, setVolume] = useState(50)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [deviceBtnRect, setDeviceBtnRect] = useState(null)
  const deviceBtnRef = useRef(null)

  const artistLine = track ? track.artists.join(', ') : null

  const isError = message?.code && message.code !== 'INFO'

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

  return (
    <div
      role="region"
      aria-label="Playback bar"
      className="fixed bottom-0 left-0 right-0 min-h-16 bg-surface border-t border-border grid grid-cols-[1fr_auto_1fr] items-center px-4 pb-[env(safe-area-inset-bottom,0px)] z-[200] gap-2 overflow-hidden"
    >
      {/* LEFT ZONE: album art + track info */}
      <div data-testid="playback-left" className="flex items-center gap-2.5 min-w-0 overflow-hidden">
        <div
          className={`flex items-center gap-2.5 min-w-0 border border-border rounded-lg p-1.5 transition-colors duration-150 ${track && nowPlayingSpotifyId ? 'cursor-pointer hover:bg-hover' : ''}`}
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
              className="w-10 h-10 bg-surface-2 rounded flex items-center justify-center flex-shrink-0 text-text-dim text-lg object-cover"
            />
          ) : (
            <div role="img" aria-label="Album art" className="w-10 h-10 bg-surface-2 rounded flex items-center justify-center flex-shrink-0 text-text-dim text-lg">♪</div>
          )}

          <div className="flex flex-col min-w-0 overflow-hidden">
            {track ? (
              <>
                <span className="text-sm font-semibold text-text truncate">{track.name}</span>
                <span className="text-xs text-text-dim truncate">{artistLine}</span>
              </>
            ) : (!device && !is_playing && onOpenDevicePicker) ? (
              <button
                className="bg-transparent border-none cursor-pointer p-0 text-left"
                onClick={onOpenDevicePicker}
              >
                <span className="text-sm text-text-dim italic">Connect a device</span>
              </button>
            ) : (
              <span className="text-sm text-text-dim italic">Nothing playing</span>
            )}
          </div>
        </div>
      </div>

      {/* CENTER ZONE: transport controls + progress bar */}
      <div data-testid="playback-center" className="flex flex-col items-center gap-0.5 flex-shrink-0 md:min-w-[500px]">
        <div className="flex items-center gap-2">
          <button
            aria-label="Previous track"
            className="bg-transparent border-none text-text-dim cursor-pointer p-1.5 rounded-full text-sm leading-none flex items-center justify-center transition-colors duration-150"
            onClick={onPrevious}
          >
            <PreviousIcon />
          </button>

          {is_playing ? (
            <button
              aria-label="Pause"
              data-prominent="true"
              className="bg-text border-none text-bg cursor-pointer w-8 h-8 p-0 rounded-full text-base leading-none flex items-center justify-center transition-[transform,background] duration-150 flex-shrink-0"
              onClick={onPause}
            >
              <PauseIcon />
            </button>
          ) : (
            <button
              aria-label="Play"
              data-prominent="true"
              className="bg-text border-none text-bg cursor-pointer w-8 h-8 p-0 rounded-full text-base leading-none flex items-center justify-center transition-[transform,background] duration-150 flex-shrink-0"
              onClick={onPlay}
            >
              <PlayIcon />
            </button>
          )}

          <button
            aria-label="Next track"
            className="bg-transparent border-none text-text-dim cursor-pointer p-1.5 rounded-full text-sm leading-none flex items-center justify-center transition-colors duration-150"
            onClick={onNext}
          >
            <NextIcon />
          </button>
        </div>

        {track && track.duration_ms != null && (
          <ProgressBar progressMs={track.progress_ms} durationMs={track.duration_ms} onSeek={onSeek} />
        )}

        {message && (
          <span
            role="status"
            className="text-xs truncate max-w-[420px]"
            style={{ color: isError ? 'rgba(255,100,100,0.85)' : 'var(--text-dim)' }}
          >{message.text}</span>
        )}
      </div>

      {/* RIGHT ZONE: volume + device name + pane toggle */}
      <div data-testid="playback-right" className="flex items-center gap-2 justify-end min-w-0">
        {onSetVolume != null && (
          <VolumeSlider
            value={volume}
            onChange={(v) => { setVolume(v); debouncedSetVolume(v) }}
          />
        )}

        {onFetchDevices && (
          <>
            <button
              ref={deviceBtnRef}
              data-testid="device-indicator"
              aria-label="Select playback device"
              className="bg-transparent border-none cursor-pointer p-1 rounded flex items-center justify-center"
              style={{ color: device?.type && device.type !== 'Computer' ? 'var(--accent)' : 'var(--text-dim)' }}
              onClick={() => {
                if (!pickerOpen && deviceBtnRef.current) {
                  setDeviceBtnRect(deviceBtnRef.current.getBoundingClientRect())
                }
                setPickerOpen(o => !o)
              }}
            >
              <SpeakerIndicatorIcon />
            </button>
            {pickerOpen && (
              <DevicePicker
                onClose={() => setPickerOpen(false)}
                onFetchDevices={onFetchDevices}
                onDeviceSelected={onDeviceSelected}
                triggerRect={deviceBtnRect}
              />
            )}
          </>
        )}

        <button
          aria-label="Now playing"
          aria-pressed={paneOpen}
          className={`bg-transparent border-none text-text-dim cursor-pointer p-1.5 rounded text-[22px] leading-none flex items-center justify-center transition-colors duration-150${paneOpen ? ' text-text bg-surface-2' : ''}`}
          onClick={onTogglePane}
        >
          <QueueIcon />
        </button>
      </div>
    </div>
  )
}
