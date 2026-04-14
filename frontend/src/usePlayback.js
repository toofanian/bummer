import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from './api'

const POLL_INTERVAL_MS = 3000

/**
 * Compare poll data ignoring progress_ms (which changes every poll during playback).
 * Uses JSON.stringify on the rest of the fields so nested objects like `track` are
 * compared by value, not by reference.
 */
function pollDataEqual(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  const { progress_ms: _pa, ...restA } = a
  const { progress_ms: _pb, ...restB } = b
  return JSON.stringify(restA) === JSON.stringify(restB)
}

export function usePlayback(session = null) {
  const [state, setState] = useState({ is_playing: false, track: null, device: null })
  const lastPollDataRef = useRef(null)
  const sessionRef = useRef(session)
  sessionRef.current = session

  useEffect(() => {
    if (!session) return

    let mounted = true

    async function poll() {
      try {
        const res = await apiFetch('/playback/state', {}, sessionRef.current)
        if (res.ok && mounted) {
          const data = await res.json()
          // Only update state if the polled data actually changed (ignoring progress_ms)
          if (!pollDataEqual(data, lastPollDataRef.current)) {
            lastPollDataRef.current = data
            setState(prev => ({ ...prev, ...data }))
          }
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
    const res = await apiFetch('/playback/play', {
      method: 'PUT',
      body: JSON.stringify({ context_uri: contextUri }),
    }, sessionRef.current)

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
    // Refresh state after Spotify processes the context switch
    setTimeout(async () => {
      try {
        const stateRes = await apiFetch('/playback/state', {}, sessionRef.current)
        if (stateRes.ok) {
          const data = await stateRes.json()
          lastPollDataRef.current = data
          setState(prev => ({ ...prev, ...data }))
        }
      } catch {}
    }, 500)
    return null
  }, [])

  const playTrack = useCallback(async (trackUri) => {
    const res = await apiFetch('/playback/play', {
      method: 'PUT',
      body: JSON.stringify({ track_uri: trackUri }),
    }, sessionRef.current)

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
    // Refresh state after Spotify processes the context switch
    setTimeout(async () => {
      try {
        const stateRes = await apiFetch('/playback/state', {}, sessionRef.current)
        if (stateRes.ok) {
          const data = await stateRes.json()
          lastPollDataRef.current = data
          setState(prev => ({ ...prev, ...data }))
        }
      } catch {}
    }, 500)
    return null
  }, [])

  const pause = useCallback(async () => {
    setState(prev => ({ ...prev, is_playing: false }))
    await apiFetch('/playback/pause', { method: 'PUT' }, sessionRef.current)
  }, [])

  const previousTrack = useCallback(async () => {
    await apiFetch('/playback/previous', { method: 'POST' }, sessionRef.current)
  }, [])

  const nextTrack = useCallback(async () => {
    await apiFetch('/playback/next', { method: 'POST' }, sessionRef.current)
  }, [])

  const setVolume = useCallback(async (volumePercent) => {
    await apiFetch('/playback/volume', {
      method: 'PUT',
      body: JSON.stringify({ volume_percent: volumePercent }),
    }, sessionRef.current)
  }, [])

  const fetchDevices = useCallback(async () => {
    const res = await apiFetch('/playback/devices', {}, sessionRef.current)
    if (!res.ok) return []
    return res.json()
  }, [])

  const fetchQueue = useCallback(async () => {
    const res = await apiFetch('/playback/queue', {}, sessionRef.current)
    if (!res.ok) return { currently_playing: null, queue: [] }
    return res.json()
  }, [])

  const transferPlayback = useCallback(async (deviceId) => {
    await apiFetch('/playback/transfer', {
      method: 'PUT',
      body: JSON.stringify({ device_id: deviceId }),
    }, sessionRef.current)
    // Refresh state so device name in PlaybackBar updates immediately
    const res = await apiFetch('/playback/state', {}, sessionRef.current)
    if (res.ok) {
      const data = await res.json()
      lastPollDataRef.current = data
      setState(prev => ({ ...prev, ...data }))
    }
  }, [])

  const seek = useCallback(async (positionMs) => {
    await apiFetch('/playback/seek', {
      method: 'PUT',
      body: JSON.stringify({ position_ms: positionMs }),
    }, sessionRef.current)
  }, [])

  return { state, play, playTrack, pause, previousTrack, nextTrack, setVolume, fetchDevices, fetchQueue, seek, transferPlayback }
}
