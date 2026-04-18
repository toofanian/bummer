// FullScreenNowPlaying.jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { SpeakerIndicatorIcon } from './DevicePicker'
import { PlayIcon, PauseIcon, PreviousIcon, NextIcon, VolumeIcon } from './icons'
import { formatTime, useDebouncedCallback } from '../utils/playback'

function ChevronDown() {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
}

function SeekableProgressBar({ progressMs, durationMs, onSeek }) {
  const barRef = useRef(null)
  const pct = durationMs > 0 ? Math.min(100, ((progressMs || 0) / durationMs) * 100) : 0

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
    <div className="w-full max-w-[342px] mt-4">
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
        className="h-1 bg-surface-2 rounded-full overflow-hidden"
        style={{ cursor: onSeek ? 'pointer' : 'default' }}
      >
        <div
          className="h-full bg-text rounded-full transition-[width] duration-300 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs text-text-dim tabular-nums">{formatTime(progressMs)}</span>
        <span className="text-xs text-text-dim tabular-nums">{formatTime(durationMs)}</span>
      </div>
    </div>
  )
}

export default function FullScreenNowPlaying({
  state,
  open,
  onClose,
  onPlay,
  onPause,
  onPrevious,
  onNext,
  onSetVolume,
  onFetchTracks,
  onPlayTrack,
  albumSpotifyId,
  albumImageUrl,
  onFetchDevices,
  onTransferPlayback,
  onOpenDevicePicker,
  onSeek,
}) {
  const { is_playing, track, device } = state
  const [tracks, setTracks] = useState([])
  const [tracksLoading, setTracksLoading] = useState(false)
  const [volume, setVolume] = useState(50)

  const debouncedSetVolume = useDebouncedCallback(
    (v) => { if (onSetVolume) onSetVolume(v) },
    300
  )

  useEffect(() => {
    if (!albumSpotifyId) { setTracks([]); return }
    let cancelled = false
    setTracksLoading(true)
    const promise = onFetchTracks(albumSpotifyId)
    if (!promise || typeof promise.then !== 'function') {
      setTracksLoading(false)
      return () => { cancelled = true }
    }
    promise.then(result => {
      if (!cancelled) { setTracks(result); setTracksLoading(false) }
    })
    return () => { cancelled = true }
  }, [albumSpotifyId]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentTrackName = track?.name ?? null

  return (
    <div
      role="dialog"
      aria-label="Now playing"
      aria-hidden={!open ? 'true' : undefined}
      className={`fixed inset-0 z-[300] bg-bg flex flex-col transition-transform duration-300 ease-out ${
        open ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      {/* Dismiss button */}
      <div className="flex justify-center pt-2 pb-1">
        <button
          aria-label="Close now playing"
          onClick={onClose}
          className="bg-transparent border-none text-text-dim p-2 transition-colors duration-150 hover:text-text"
        >
          <ChevronDown />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto flex flex-col items-center px-6">
        {/* Album art */}
        {albumImageUrl ? (
          <img
            src={albumImageUrl}
            alt="Album art"
            className="w-full max-w-[342px] aspect-square object-cover rounded-lg mt-2"
          />
        ) : (
          <div className="w-full max-w-[342px] aspect-square rounded-lg bg-surface-2 flex items-center justify-center text-text-dim text-4xl mt-2">&#9835;</div>
        )}

        {/* Track info */}
        <div className="w-full max-w-[342px] mt-6 text-center">
          <div className="text-lg font-semibold text-text truncate">{track?.name ?? 'Nothing playing'}</div>
          <div className="text-sm text-text-dim truncate mt-1">{track?.artists?.join(', ') ?? ''}</div>
        </div>

        {/* Interactive progress bar */}
        {track && track.duration_ms != null && (
          <SeekableProgressBar
            progressMs={track.progress_ms}
            durationMs={track.duration_ms}
            onSeek={onSeek}
          />
        )}

        {/* Playback controls */}
        <div className="flex items-center gap-6 mt-6">
          <button
            aria-label="Previous track"
            onClick={onPrevious}
            className="w-11 h-11 flex items-center justify-center bg-transparent border-none text-text-dim rounded-full transition-colors duration-150 hover:text-text"
          >
            <PreviousIcon size={24} />
          </button>
          <button
            aria-label={is_playing ? 'Pause' : 'Play'}
            onClick={is_playing ? onPause : onPlay}
            className="w-14 h-14 flex items-center justify-center bg-text text-bg border-none rounded-full transition-[transform,opacity] duration-150 hover:opacity-90"
          >
            {is_playing ? <PauseIcon size={28} /> : <PlayIcon size={28} />}
          </button>
          <button
            aria-label="Next track"
            onClick={onNext}
            className="w-11 h-11 flex items-center justify-center bg-transparent border-none text-text-dim rounded-full transition-colors duration-150 hover:text-text"
          >
            <NextIcon size={24} />
          </button>
        </div>

        {/* Volume */}
        <div className="w-full max-w-[342px] mt-6 flex items-center gap-3">
          <VolumeIcon />
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={e => { const v = Number(e.target.value); setVolume(v); debouncedSetVolume(v) }}
            className="flex-1 accent-text"
            aria-label="Volume"
          />
        </div>

        {/* Device selector */}
        {device && device.type !== 'Computer' && onOpenDevicePicker && (
          <div className="mt-3 relative">
            <button
              className="text-xs bg-transparent border-none flex items-center gap-1.5 mx-auto"
              style={{ color: 'var(--accent)' }}
              onClick={onOpenDevicePicker}
            >
              <SpeakerIndicatorIcon />
              <span>Listening on <strong>{device.name}</strong></span>
            </button>
          </div>
        )}

        {/* Track list */}
        {track && (
          <div className="w-full max-w-[342px] mt-6 mb-8 border-t border-border pt-4">
            <div className="text-xs font-bold tracking-wider uppercase text-text-dim mb-2">Tracks</div>
            {tracksLoading ? (
              <div className="text-sm text-text-dim py-2">Loading tracks...</div>
            ) : tracks.map(t => {
              const isActive = t.name === currentTrackName
              return (
                <div
                  key={t.track_number}
                  className={`flex items-center gap-3 py-2 px-2 rounded cursor-pointer transition-colors duration-100 ${
                    isActive ? 'bg-now-playing' : 'hover:bg-surface-2'
                  }`}
                  onClick={() => onPlayTrack?.(`spotify:track:${t.service_id}`)}
                >
                  <span className="text-xs text-text-dim w-5 text-right flex-shrink-0">{t.track_number}</span>
                  <span className={`flex-1 text-sm truncate ${isActive ? 'text-text font-semibold' : 'text-text-dim'}`}>{t.name}</span>
                  <span className="text-xs text-text-dim flex-shrink-0">{t.duration}</span>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}
