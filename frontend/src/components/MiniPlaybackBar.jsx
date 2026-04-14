import { useState, useRef } from 'react'
import DevicePicker, { SpeakerIndicatorIcon } from './DevicePicker'
import { PlayIcon, PauseIcon } from './icons'

export default function MiniPlaybackBar({ state, albumImageUrl, onPlayPause, onExpand, onFetchDevices, onDeviceSelected, onOpenDevicePicker }) {
  const { is_playing, track, device } = state
  const [pickerOpen, setPickerOpen] = useState(false)
  const [deviceBtnRect, setDeviceBtnRect] = useState(null)
  const deviceBtnRef = useRef(null)

  // Show "Connect a device" state when no track, no device, not playing, and picker callback provided
  if (!track && !device && !is_playing) {
    if (!onOpenDevicePicker) return null
    return (
      <div
        data-testid="mini-playback-bar"
        className="fixed left-0 right-0 z-[190] flex items-center gap-3 px-3 bg-surface border-t border-border h-14 cursor-pointer"
        style={{ bottom: `calc(50px + env(safe-area-inset-bottom, 0px))` }}
        onClick={onOpenDevicePicker}
      >
        <div className="w-10 h-10 rounded bg-surface-2 flex items-center justify-center flex-shrink-0 text-text-dim">♪</div>
        <div className="flex-1 min-w-0 flex flex-col">
          <span className="text-sm text-text-dim italic">Connect a device</span>
        </div>
      </div>
    )
  }

  if (!track) return null

  return (
    <div
      data-testid="mini-playback-bar"
      className="fixed left-0 right-0 z-[190] flex items-center gap-3 px-3 bg-surface border-t border-border h-14 cursor-pointer"
      style={{ bottom: `calc(50px + env(safe-area-inset-bottom, 0px))` }}
      onClick={onExpand}
    >
      {albumImageUrl ? (
        <img src={albumImageUrl} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded bg-surface-2 flex items-center justify-center flex-shrink-0 text-text-dim">♪</div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <span className="text-sm font-semibold text-text truncate">{track.name}</span>
        <span className="text-xs text-text-dim truncate">{track.artists.join(', ')}</span>
      </div>

      {device && onFetchDevices && (
        <>
          <button
            ref={deviceBtnRef}
            data-testid="mini-device-indicator"
            aria-label="Select playback device"
            className="bg-transparent border-none cursor-pointer p-1 rounded flex items-center justify-center"
            style={{ color: device.type !== 'Computer' ? 'var(--accent)' : 'var(--text-dim)' }}
            onClick={e => {
              e.stopPropagation()
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
        aria-label={is_playing ? 'Pause' : 'Play'}
        className="w-9 h-9 flex items-center justify-center bg-transparent border-none text-text p-0 rounded-full transition-colors duration-150 hover:text-text-dim"
        onClick={e => { e.stopPropagation(); onPlayPause() }}
      >
        {is_playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
      </button>
    </div>
  )
}
