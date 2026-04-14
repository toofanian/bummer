import { renderHook, act } from '@testing-library/react'
import { usePlayback } from './usePlayback'

const PLAYBACK_STATE = {
  is_playing: true,
  track: {
    name: 'Track One',
    album: 'Some Album',
    artists: ['Artist A'],
    progress_ms: 45000,
    duration_ms: 240000,
  },
  device: { name: 'My Mac', type: 'Computer' },
}

const IDLE_STATE = { is_playing: false, track: null, device: null }

let fetchMock

beforeEach(() => {
  fetchMock = vi.fn().mockImplementation((url) => {
    if (url.includes('/playback/state')) {
      return Promise.resolve({ ok: true, json: async () => PLAYBACK_STATE })
    }
    return Promise.resolve({ ok: true, status: 204 })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('usePlayback', () => {
  it('starts with idle state before first fetch resolves', () => {
    const { result } = renderHook(() => usePlayback())

    expect(result.current.state.is_playing).toBe(false)
    expect(result.current.state.track).toBeNull()
    expect(result.current.state.device).toBeNull()
  })

  it('fetches playback state on mount', async () => {
    const { result } = renderHook(() => usePlayback())

    // Flush the initial fetch + state update
    await act(async () => {})

    expect(result.current.state.is_playing).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/playback/state')
  })

  it('polls at interval after mount', async () => {
    vi.useFakeTimers()
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => IDLE_STATE })
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => usePlayback())
    await act(async () => {})  // flush initial poll
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('play() calls PUT /playback/play with context_uri', async () => {
    const { result } = renderHook(() => usePlayback())

    await act(async () => {
      await result.current.play('spotify:album:abc123')
    })

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/playback/play', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context_uri: 'spotify:album:abc123' }),
    })
  })

  it('play() optimistically sets is_playing to true', async () => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePlayback())

    await act(async () => {
      await result.current.play('spotify:album:abc123')
    })

    expect(result.current.state.is_playing).toBe(true)
  })

  it('pause() calls PUT /playback/pause', async () => {
    const { result } = renderHook(() => usePlayback())

    await act(async () => {
      await result.current.pause()
    })

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/playback/pause', {
      method: 'PUT',
    })
  })

  it('pause() optimistically sets is_playing to false', async () => {
    const { result } = renderHook(() => usePlayback())

    await act(async () => { await result.current.play('spotify:album:abc123') })
    await act(async () => { await result.current.pause() })

    expect(result.current.state.is_playing).toBe(false)
  })

  it('does not crash when fetch throws', async () => {
    fetchMock = vi.fn().mockRejectedValue(new Error('Network error'))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePlayback())

    // Wait a tick to let the rejected promise settle
    await act(async () => {})

    expect(result.current.state.is_playing).toBe(false)
  })

  it('play() returns "no_device" and sets playError when backend returns 409', async () => {
    fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/playback/state')) {
        return Promise.resolve({ ok: true, json: async () => IDLE_STATE })
      }
      return Promise.resolve({ ok: false, status: 409 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePlayback())

    let returnValue
    await act(async () => {
      returnValue = await result.current.play('spotify:album:abc123')
    })

    expect(returnValue).toBe('no_device')
    expect(result.current.state.playError).toBe('no_device')
  })

  it('play() does not set is_playing to true when backend returns 409', async () => {
    fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/playback/state')) {
        return Promise.resolve({ ok: true, json: async () => IDLE_STATE })
      }
      return Promise.resolve({ ok: false, status: 409 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePlayback())
    await act(async () => { await result.current.play('spotify:album:abc123') })

    expect(result.current.state.is_playing).toBe(false)
  })

  it('play() clears playError to null after 1000ms on 409', async () => {
    vi.useFakeTimers()
    fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/playback/state')) {
        return Promise.resolve({ ok: true, json: async () => IDLE_STATE })
      }
      return Promise.resolve({ ok: false, status: 409 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePlayback())
    await act(async () => { await result.current.play('spotify:album:abc123') })

    expect(result.current.state.playError).toBe('no_device')

    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })

    expect(result.current.state.playError).toBeNull()
  })

  it('playTrack() calls PUT /playback/play with track_uri', async () => {
    const { result } = renderHook(() => usePlayback())

    await act(async () => {
      await result.current.playTrack('spotify:track:xyz789')
    })

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/playback/play', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track_uri: 'spotify:track:xyz789' }),
    })
  })

  it('playTrack() returns "no_device" when backend returns 409', async () => {
    fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/playback/state')) {
        return Promise.resolve({ ok: true, json: async () => IDLE_STATE })
      }
      return Promise.resolve({ ok: false, status: 409 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePlayback())

    let returnValue
    await act(async () => {
      returnValue = await result.current.playTrack('spotify:track:xyz789')
    })

    expect(returnValue).toBe('no_device')
  })

  it('playTrack() returns null on 204 success', async () => {
    fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/playback/state')) {
        return Promise.resolve({ ok: true, json: async () => IDLE_STATE })
      }
      return Promise.resolve({ ok: true, status: 204 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePlayback())

    let returnValue
    await act(async () => {
      returnValue = await result.current.playTrack('spotify:track:xyz789')
    })

    expect(returnValue).toBeNull()
  })

  it('play() returns null on 204 success', async () => {
    fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/playback/state')) {
        return Promise.resolve({ ok: true, json: async () => IDLE_STATE })
      }
      return Promise.resolve({ ok: true, status: 204 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePlayback())

    let returnValue
    await act(async () => {
      returnValue = await result.current.play('spotify:album:abc123')
    })

    expect(returnValue).toBeNull()
  })

  it('previousTrack() calls POST /playback/previous', async () => {
    const { result } = renderHook(() => usePlayback())

    await act(async () => {
      await result.current.previousTrack()
    })

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/playback/previous', {
      method: 'POST',
    })
  })

  it('nextTrack() calls POST /playback/next', async () => {
    const { result } = renderHook(() => usePlayback())

    await act(async () => {
      await result.current.nextTrack()
    })

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/playback/next', {
      method: 'POST',
    })
  })

  it('setVolume() calls PUT /playback/volume with volume_percent', async () => {
    const { result } = renderHook(() => usePlayback())

    await act(async () => {
      await result.current.setVolume(75)
    })

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/playback/volume', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volume_percent: 75 }),
    })
  })
})
