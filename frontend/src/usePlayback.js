import { useState, useEffect, useCallback } from 'react'

const API = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'
const POLL_INTERVAL_MS = 3000

export function usePlayback() {
  const [state, setState] = useState({ is_playing: false, track: null, device: null })

  useEffect(() => {
    let mounted = true

    async function poll() {
      try {
        const res = await fetch(`${API}/playback/state`)
        if (res.ok && mounted) {
          const data = await res.json()
          setState(prev => ({ ...prev, ...data }))
        }
      } catch {}
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  const play = useCallback(async (contextUri = null) => {
    const res = await fetch(`${API}/playback/play`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context_uri: contextUri }),
    })

    if (res.status === 409) {
      const data = await res.json()
      if (data.detail === 'restricted_device') {
        return 'restricted_device'
      }
      setState(prev => ({ ...prev, playError: 'no_device' }))
      setTimeout(() => {
        setState(prev => ({ ...prev, playError: null }))
      }, 1000)
      return 'no_device'
    }

    setState(prev => ({ ...prev, is_playing: true }))
    return null
  }, [])

  const playTrack = useCallback(async (trackUri) => {
    const res = await fetch(`${API}/playback/play`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track_uri: trackUri }),
    })

    if (res.status === 409) {
      const data = await res.json()
      if (data.detail === 'restricted_device') {
        return 'restricted_device'
      }
      setState(prev => ({ ...prev, playError: 'no_device' }))
      setTimeout(() => {
        setState(prev => ({ ...prev, playError: null }))
      }, 1000)
      return 'no_device'
    }

    setState(prev => ({ ...prev, is_playing: true }))
    return null
  }, [])

  const pause = useCallback(async () => {
    setState(prev => ({ ...prev, is_playing: false }))
    await fetch(`${API}/playback/pause`, { method: 'PUT' })
  }, [])

  const previousTrack = useCallback(async () => {
    await fetch(`${API}/playback/previous`, { method: 'POST' })
  }, [])

  const nextTrack = useCallback(async () => {
    await fetch(`${API}/playback/next`, { method: 'POST' })
  }, [])

  const setVolume = useCallback(async (volumePercent) => {
    await fetch(`${API}/playback/volume`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volume_percent: volumePercent }),
    })
  }, [])

  const fetchDevices = useCallback(async () => {
    const res = await fetch(`${API}/playback/devices`)
    if (!res.ok) return []
    return res.json()
  }, [])

  const transferPlayback = useCallback(async (deviceId) => {
    await fetch(`${API}/playback/transfer`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId }),
    })
    // Refresh state so device name in PlaybackBar updates immediately
    const res = await fetch(`${API}/playback/state`)
    if (res.ok) {
      const data = await res.json()
      setState(prev => ({ ...prev, ...data }))
    }
  }, [])

  return { state, play, playTrack, pause, previousTrack, nextTrack, setVolume, fetchDevices, transferPlayback }
}
