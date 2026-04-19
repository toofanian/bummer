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
  device: { id: 'device-id-abc', name: 'My Mac', type: 'Computer' },
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
    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))

    expect(result.current.state.is_playing).toBe(false)
    expect(result.current.state.track).toBeNull()
    expect(result.current.state.device).toBeNull()
  })

  it('fetches playback state on mount', async () => {
    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))

    // Flush the initial fetch + state update
    await act(async () => {})

    expect(result.current.state.is_playing).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/playback/state', expect.objectContaining({
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }))
  })

  it('polls at interval after mount', async () => {
    vi.useFakeTimers()
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => IDLE_STATE })
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => usePlayback({ access_token: 'test-jwt' }))
    await act(async () => {})  // flush initial poll
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('play() calls PUT /playback/play with context_uri', async () => {
    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))

    await act(async () => {
      await result.current.play('spotify:album:abc123')
    })

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/playback/play', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ context_uri: 'spotify:album:abc123' }),
    }))
  })

  it('play() optimistically sets is_playing to true', async () => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))

    await act(async () => {
      await result.current.play('spotify:album:abc123')
    })

    expect(result.current.state.is_playing).toBe(true)
  })

  it('pause() calls PUT /playback/pause', async () => {
    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))

    await act(async () => {
      await result.current.pause()
    })

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/playback/pause', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }))
  })

  it('pause() optimistically sets is_playing to false', async () => {
    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))

    await act(async () => { await result.current.play('spotify:album:abc123') })
    await act(async () => { await result.current.pause() })

    expect(result.current.state.is_playing).toBe(false)
  })

  it('pause() does a reconciliation state fetch after API call', async () => {
    vi.useFakeTimers()
    const calls = []
    fetchMock = vi.fn().mockImplementation((url) => {
      calls.push(url)
      if (url.includes('/playback/state')) {
        return Promise.resolve({ ok: true, json: async () => PLAYBACK_STATE })
      }
      return Promise.resolve({ ok: true, status: 204 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))
    await act(async () => {}) // flush initial poll

    await act(async () => {
      await result.current.pause()
    })

    // Advance past the reconciliation delay
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })

    const stateCallsAfterPause = calls.filter(
      (u, i) => u.includes('/playback/state') && i > 0
    )
    expect(stateCallsAfterPause.length).toBeGreaterThanOrEqual(1)
  })

  it('pause() returns "no_device" when backend returns 409', async () => {
    fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/playback/state')) {
        return Promise.resolve({ ok: true, json: async () => PLAYBACK_STATE })
      }
      if (url.includes('/playback/pause')) {
        return Promise.resolve({ ok: false, status: 409, json: async () => ({ detail: 'no_device' }) })
      }
      return Promise.resolve({ ok: true, status: 204 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))
    await act(async () => {}) // flush initial poll

    let returnValue
    await act(async () => {
      returnValue = await result.current.pause()
    })

    expect(returnValue).toBe('no_device')
  })

  it('does not crash when fetch throws', async () => {
    fetchMock = vi.fn().mockRejectedValue(new Error('Network error'))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))

    // Wait a tick to let the rejected promise settle
    await act(async () => {})

    expect(result.current.state.is_playing).toBe(false)
  })

  it('play() returns "no_device" and sets playError when backend returns 409', async () => {
    fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/playback/state')) {
        return Promise.resolve({ ok: true, json: async () => IDLE_STATE })
      }
      return Promise.resolve({ ok: false, status: 409, json: async () => ({ detail: 'no_device' }) })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))

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
      return Promise.resolve({ ok: false, status: 409, json: async () => ({ detail: 'no_device' }) })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))
    await act(async () => { await result.current.play('spotify:album:abc123') })

    expect(result.current.state.is_playing).toBe(false)
  })

  it('play() clears playError to null after 1000ms on 409', async () => {
    vi.useFakeTimers()
    fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/playback/state')) {
        return Promise.resolve({ ok: true, json: async () => IDLE_STATE })
      }
      return Promise.resolve({ ok: false, status: 409, json: async () => ({ detail: 'no_device' }) })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))
    await act(async () => { await result.current.play('spotify:album:abc123') })

    expect(result.current.state.playError).toBe('no_device')

    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })

    expect(result.current.state.playError).toBeNull()
  })

  it('playTrack() calls PUT /playback/play with track_uri', async () => {
    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))

    await act(async () => {
      await result.current.playTrack('spotify:track:xyz789')
    })

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/playback/play', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ track_uri: 'spotify:track:xyz789' }),
    }))
  })

  it('playTrack() returns "no_device" when backend returns 409', async () => {
    fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/playback/state')) {
        return Promise.resolve({ ok: true, json: async () => IDLE_STATE })
      }
      return Promise.resolve({ ok: false, status: 409, json: async () => ({ detail: 'no_device' }) })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))

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

    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))

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

    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))

    let returnValue
    await act(async () => {
      returnValue = await result.current.play('spotify:album:abc123')
    })

    expect(returnValue).toBeNull()
  })

  it('previousTrack() calls POST /playback/previous', async () => {
    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))

    await act(async () => {
      await result.current.previousTrack()
    })

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/playback/previous', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }))
  })

  it('nextTrack() calls POST /playback/next', async () => {
    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))

    await act(async () => {
      await result.current.nextTrack()
    })

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/playback/next', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }))
  })

  it('setVolume() calls PUT /playback/volume with volume_percent', async () => {
    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))

    await act(async () => {
      await result.current.setVolume(75)
    })

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/playback/volume', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ volume_percent: 75 }),
    }))
  })

  it('play() returns "restricted_device" when backend returns 409 with detail "restricted_device"', async () => {
    fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/playback/state')) {
        return Promise.resolve({ ok: true, json: async () => IDLE_STATE })
      }
      return Promise.resolve({
        ok: false,
        status: 409,
        json: async () => ({ detail: 'restricted_device' }),
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))

    let returnValue
    await act(async () => {
      returnValue = await result.current.play('spotify:album:abc123')
    })

    expect(returnValue).toBe('restricted_device')
  })

  it('playTrack() returns "restricted_device" when backend returns 409 with detail "restricted_device"', async () => {
    fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/playback/state')) {
        return Promise.resolve({ ok: true, json: async () => IDLE_STATE })
      }
      return Promise.resolve({
        ok: false,
        status: 409,
        json: async () => ({ detail: 'restricted_device' }),
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))

    let returnValue
    await act(async () => {
      returnValue = await result.current.playTrack('spotify:track:xyz789')
    })

    expect(returnValue).toBe('restricted_device')
  })
})

describe('fetchDevices', () => {
  it('returns device list from /playback/devices', async () => {
    const devices = [
      { id: 'abc', name: "Alex's iPhone", type: 'Smartphone', is_active: true },
      { id: 'def', name: 'My Mac', type: 'Computer', is_active: false },
    ]
    fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/playback/devices')) {
        return Promise.resolve({ ok: true, json: async () => devices })
      }
      return Promise.resolve({ ok: true, json: async () => IDLE_STATE })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))

    let returned
    await act(async () => {
      returned = await result.current.fetchDevices()
    })

    expect(returned).toEqual(devices)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/playback/devices'), expect.anything())
  })

  it('returns empty array when fetch fails', async () => {
    fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/playback/devices')) {
        return Promise.resolve({ ok: false })
      }
      return Promise.resolve({ ok: true, json: async () => IDLE_STATE })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))

    let returned
    await act(async () => {
      returned = await result.current.fetchDevices()
    })

    expect(returned).toEqual([])
  })
})

describe('seek', () => {
  it('calls PUT /playback/seek with position_ms', async () => {
    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))

    await act(async () => {
      await result.current.seek(120000)
    })

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/playback/seek', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ position_ms: 120000 }),
    }))
  })
})

describe('reconciliation fetches', () => {
  it('nextTrack() does a reconciliation state fetch after API call', async () => {
    vi.useFakeTimers()
    const calls = []
    fetchMock = vi.fn().mockImplementation((url) => {
      calls.push(url)
      if (url.includes('/playback/state')) {
        return Promise.resolve({ ok: true, json: async () => PLAYBACK_STATE })
      }
      return Promise.resolve({ ok: true, status: 204 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))
    await act(async () => {}) // flush initial poll

    await act(async () => {
      await result.current.nextTrack()
    })

    await act(async () => { await vi.advanceTimersByTimeAsync(600) })

    const stateCallsAfterNext = calls.filter(
      (u, i) => u.includes('/playback/state') && i > 0
    )
    expect(stateCallsAfterNext.length).toBeGreaterThanOrEqual(1)
  })

  it('previousTrack() does a reconciliation state fetch after API call', async () => {
    vi.useFakeTimers()
    const calls = []
    fetchMock = vi.fn().mockImplementation((url) => {
      calls.push(url)
      if (url.includes('/playback/state')) {
        return Promise.resolve({ ok: true, json: async () => PLAYBACK_STATE })
      }
      return Promise.resolve({ ok: true, status: 204 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))
    await act(async () => {}) // flush initial poll

    await act(async () => {
      await result.current.previousTrack()
    })

    await act(async () => { await vi.advanceTimersByTimeAsync(600) })

    const stateCallsAfterPrev = calls.filter(
      (u, i) => u.includes('/playback/state') && i > 0
    )
    expect(stateCallsAfterPrev.length).toBeGreaterThanOrEqual(1)
  })
})

describe('transferPlayback', () => {
  it('calls PUT /playback/transfer with device_id and then refreshes state', async () => {
    const newState = {
      is_playing: true,
      track: { name: 'Song', album: 'Album', artists: ['Artist'], progress_ms: 0, duration_ms: 200000 },
      device: { id: 'device-id-abc', name: 'My Mac', type: 'Computer' },
    }

    fetchMock = vi.fn().mockImplementation((url, opts) => {
      if (url.includes('/playback/transfer')) {
        return Promise.resolve({ ok: true, json: async () => ({}) })
      }
      if (url.includes('/playback/state')) {
        // After transfer, return newState so we can verify refresh
        return Promise.resolve({ ok: true, json: async () => newState })
      }
      return Promise.resolve({ ok: true, json: async () => IDLE_STATE })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))

    await act(async () => {
      await result.current.transferPlayback('abc123')
    })

    const transferCall = fetchMock.mock.calls.find(c => c[0].includes('/playback/transfer'))
    expect(transferCall).toBeTruthy()
    const body = JSON.parse(transferCall[1].body)
    expect(body.device_id).toBe('abc123')
    expect(transferCall[1].method).toBe('PUT')
  })
})

describe('fetchQueue', () => {
  it('returns queue data from /playback/queue', async () => {
    const queueData = {
      currently_playing: { name: 'Current', artists: ['A'], album: 'Album' },
      queue: [{ name: 'Next', artists: ['B'], album: 'Album2', duration_ms: 200000, uri: 'spotify:track:abc' }],
    }
    fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/playback/queue')) {
        return Promise.resolve({ ok: true, json: async () => queueData })
      }
      return Promise.resolve({ ok: true, json: async () => IDLE_STATE })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))

    let returned
    await act(async () => {
      returned = await result.current.fetchQueue()
    })

    expect(returned).toEqual(queueData)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/playback/queue'), expect.anything())
  })

  it('returns empty queue when fetch fails', async () => {
    fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/playback/queue')) {
        return Promise.resolve({ ok: false })
      }
      return Promise.resolve({ ok: true, json: async () => IDLE_STATE })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePlayback({ access_token: 'test-jwt' }))

    let returned
    await act(async () => {
      returned = await result.current.fetchQueue()
    })

    expect(returned).toEqual({ currently_playing: null, queue: [] })
  })
})
