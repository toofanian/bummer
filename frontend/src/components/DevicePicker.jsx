import { useState, useEffect, useCallback } from 'react'

// --- Device type SVG icons ---
function LaptopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M2 20h20" />
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <path d="M12 18h0" />
    </svg>
  )
}

function SpeakerDeviceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <circle cx="12" cy="14" r="4" />
      <path d="M12 6h0" />
    </svg>
  )
}

function deviceTypeIcon(type) {
  switch (type) {
    case 'Computer': return <LaptopIcon />
    case 'Smartphone': return <PhoneIcon />
    default: return <SpeakerDeviceIcon />
  }
}

// --- Exported device/monitor icon for PlaybackBar indicator ---
export function SpeakerIndicatorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </svg>
  )
}

export default function DevicePicker({
  onClose,
  onFetchDevices,
  onDeviceSelected,
  restrictedDevice,
}) {
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchAndShow = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const list = await onFetchDevices()
      setDevices(list)
    } catch {
      setError(true)
    }
    setLoading(false)
  }, [onFetchDevices])

  useEffect(() => {
    fetchAndShow()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function handleDeviceClick(deviceId) {
    onDeviceSelected(deviceId)
  }

  return (
    <>
      {/* Backdrop — clicking outside closes the picker.
          stopPropagation prevents React synthetic events from bubbling
          up to a parent click handler (e.g. MiniPlaybackBar's onExpand,
          which would otherwise open FullScreenNowPlaying when you
          dismiss the picker on mobile). */}
      <div
        data-testid="device-picker-backdrop"
        aria-hidden="true"
        style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
      />
      <div
        role="listbox"
        aria-label="Select device"
        className="bg-surface border border-border rounded-lg min-w-[240px] shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
        style={{ position: 'fixed', bottom: '68px', right: '16px', zIndex: 9999 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <span className="text-sm font-semibold text-text">Connect to a device</span>
          <button
            aria-label="Close device picker"
            className="bg-transparent border-none cursor-pointer text-text-dim hover:text-text p-0 leading-none text-base flex items-center justify-center"
            onClick={onClose}
          >
            ×
          </button>
        </div>

      {/* Restricted device error */}
      {restrictedDevice && (
        <div className="px-3 py-2 text-sm text-red-400">
          This device restricts remote playback — try another
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div data-testid="device-picker-loading" className="py-3 px-3 text-sm text-text-dim">...</div>
      ) : error ? (
        <div className="py-3 px-3">
          <div className="text-sm text-text-dim">Couldn't load devices.</div>
          <button
            className="text-sm text-text bg-transparent border-none cursor-pointer mt-1 hover:underline"
            onClick={fetchAndShow}
          >
            Try again
          </button>
        </div>
      ) : devices.length === 0 ? (
        <div className="py-3 px-3 text-sm text-text-dim">No devices found. Open Spotify on any device.</div>
      ) : (
        devices.map(d => (
          <div
            key={d.id}
            data-testid={`device-row-${d.id}`}
            role="option"
            aria-selected={d.is_active}
            className={`flex items-center gap-2.5 py-2 px-3 text-sm select-none ${
              d.is_active
                ? 'text-accent cursor-default'
                : 'text-text cursor-pointer hover:bg-surface-2'
            }`}
            onClick={d.is_active ? undefined : () => handleDeviceClick(d.id)}
          >
            <span className="flex-shrink-0 flex items-center" style={{ color: d.is_active ? 'var(--accent)' : 'var(--text-dim)' }}>
              {deviceTypeIcon(d.type)}
            </span>
            {d.is_active && (
              <span
                data-testid="active-dot"
                className="w-2 h-2 rounded-full bg-accent flex-shrink-0"
              />
            )}
            <span className="flex-1 truncate">{d.name}</span>
          </div>
        ))
      )}
    </div>
    </>
  )
}
