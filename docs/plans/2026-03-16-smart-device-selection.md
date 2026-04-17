# Smart Device Selection Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the text-based device display with a Spotify-faithful speaker icon, add smart device selection (default/suppress devices), extract a shared DevicePicker component, and fix the click-outside bug.

**Architecture:** New `useDevicePreferences` hook manages localStorage-persisted device preferences. New `DevicePicker` component replaces inline picker logic in both PlaybackBar and FullScreenNowPlaying. `handlePlay` in App.jsx uses `resolveDevice()` to check the default device before initiating playback, showing a modal picker when needed.

**Tech Stack:** React (Vite), Vitest + React Testing Library, existing CSS variable design system, localStorage for persistence.

**Spec:** [docs/specs/2026-03-16-smart-device-selection-design.md](../specs/2026-03-16-smart-device-selection-design.md)

---

## Chunk 1: useDevicePreferences Hook

### Task 1: useDevicePreferences — localStorage persistence and basic API

**Files:**
- Create: `frontend/src/useDevicePreferences.js`
- Create: `frontend/src/useDevicePreferences.test.js`

- [ ] **Step 1: Write failing tests for basic read/write**

Create `frontend/src/useDevicePreferences.test.js`:

```javascript
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useDevicePreferences } from './useDevicePreferences'

const STORAGE_KEY = 'crate_device_prefs'

beforeEach(() => {
  localStorage.clear()
})

describe('useDevicePreferences', () => {
  it('returns defaults when localStorage is empty', () => {
    const { result } = renderHook(() => useDevicePreferences())
    expect(result.current.defaultDeviceId).toBeNull()
    expect(result.current.suppressedDeviceIds).toEqual([])
    expect(result.current.knownDevices).toEqual([])
  })

  it('reads existing prefs from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      defaultDeviceId: 'abc',
      suppressedDeviceIds: ['def'],
      knownDevices: [{ id: 'abc', name: 'Phone', type: 'Smartphone' }],
    }))
    const { result } = renderHook(() => useDevicePreferences())
    expect(result.current.defaultDeviceId).toBe('abc')
    expect(result.current.suppressedDeviceIds).toEqual(['def'])
    expect(result.current.knownDevices).toHaveLength(1)
  })

  it('setDefault persists to localStorage', () => {
    const { result } = renderHook(() => useDevicePreferences())
    act(() => result.current.setDefault('abc'))
    expect(result.current.defaultDeviceId).toBe('abc')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).defaultDeviceId).toBe('abc')
  })

  it('clearDefault removes defaultDeviceId', () => {
    const { result } = renderHook(() => useDevicePreferences())
    act(() => result.current.setDefault('abc'))
    act(() => result.current.clearDefault())
    expect(result.current.defaultDeviceId).toBeNull()
  })

  it('toggleSuppressed adds device to suppressed list', () => {
    const { result } = renderHook(() => useDevicePreferences())
    act(() => result.current.toggleSuppressed('def'))
    expect(result.current.suppressedDeviceIds).toEqual(['def'])
    expect(result.current.isSuppressed('def')).toBe(true)
  })

  it('toggleSuppressed removes device if already suppressed', () => {
    const { result } = renderHook(() => useDevicePreferences())
    act(() => result.current.toggleSuppressed('def'))
    act(() => result.current.toggleSuppressed('def'))
    expect(result.current.suppressedDeviceIds).toEqual([])
    expect(result.current.isSuppressed('def')).toBe(false)
  })

  it('suppressing the default device clears the default', () => {
    const { result } = renderHook(() => useDevicePreferences())
    act(() => result.current.setDefault('abc'))
    act(() => result.current.toggleSuppressed('abc'))
    expect(result.current.defaultDeviceId).toBeNull()
    expect(result.current.isSuppressed('abc')).toBe(true)
  })

  it('setting a suppressed device as default unsuppresses it', () => {
    const { result } = renderHook(() => useDevicePreferences())
    act(() => result.current.toggleSuppressed('abc'))
    act(() => result.current.setDefault('abc'))
    expect(result.current.defaultDeviceId).toBe('abc')
    expect(result.current.isSuppressed('abc')).toBe(false)
  })

  it('updateKnownDevices merges new devices', () => {
    const { result } = renderHook(() => useDevicePreferences())
    act(() => result.current.updateKnownDevices([
      { id: 'abc', name: 'Phone', type: 'Smartphone' },
    ]))
    expect(result.current.knownDevices).toEqual([
      { id: 'abc', name: 'Phone', type: 'Smartphone' },
    ])
    // Add another device — original stays
    act(() => result.current.updateKnownDevices([
      { id: 'abc', name: 'Phone Updated', type: 'Smartphone' },
      { id: 'def', name: 'Mac', type: 'Computer' },
    ]))
    expect(result.current.knownDevices).toHaveLength(2)
    // Name should update for existing id
    expect(result.current.knownDevices.find(d => d.id === 'abc').name).toBe('Phone Updated')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate/frontend" && npm test -- --run useDevicePreferences.test`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement useDevicePreferences**

Create `frontend/src/useDevicePreferences.js`:

```javascript
import { useState, useCallback } from 'react'

const STORAGE_KEY = 'crate_device_prefs'

function readPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writePrefs(prefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

export function useDevicePreferences() {
  const [prefs, setPrefs] = useState(() => {
    const stored = readPrefs()
    return {
      defaultDeviceId: stored?.defaultDeviceId ?? null,
      suppressedDeviceIds: stored?.suppressedDeviceIds ?? [],
      knownDevices: stored?.knownDevices ?? [],
    }
  })

  const persist = useCallback((next) => {
    setPrefs(next)
    writePrefs(next)
  }, [])

  const setDefault = useCallback((deviceId) => {
    setPrefs(prev => {
      const next = {
        ...prev,
        defaultDeviceId: deviceId,
        // Unsuppress if it was suppressed
        suppressedDeviceIds: prev.suppressedDeviceIds.filter(id => id !== deviceId),
      }
      writePrefs(next)
      return next
    })
  }, [])

  const clearDefault = useCallback(() => {
    setPrefs(prev => {
      const next = { ...prev, defaultDeviceId: null }
      writePrefs(next)
      return next
    })
  }, [])

  const toggleSuppressed = useCallback((deviceId) => {
    setPrefs(prev => {
      const isSuppressed = prev.suppressedDeviceIds.includes(deviceId)
      const next = {
        ...prev,
        suppressedDeviceIds: isSuppressed
          ? prev.suppressedDeviceIds.filter(id => id !== deviceId)
          : [...prev.suppressedDeviceIds, deviceId],
        // If suppressing the default, clear the default
        defaultDeviceId: (!isSuppressed && prev.defaultDeviceId === deviceId)
          ? null
          : prev.defaultDeviceId,
      }
      writePrefs(next)
      return next
    })
  }, [])

  const isSuppressed = useCallback((deviceId) => {
    return prefs.suppressedDeviceIds.includes(deviceId)
  }, [prefs.suppressedDeviceIds])

  const updateKnownDevices = useCallback((devices) => {
    setPrefs(prev => {
      const knownMap = new Map(prev.knownDevices.map(d => [d.id, d]))
      for (const d of devices) {
        knownMap.set(d.id, { id: d.id, name: d.name, type: d.type })
      }
      const next = { ...prev, knownDevices: Array.from(knownMap.values()) }
      writePrefs(next)
      return next
    })
  }, [])

  return {
    defaultDeviceId: prefs.defaultDeviceId,
    suppressedDeviceIds: prefs.suppressedDeviceIds,
    knownDevices: prefs.knownDevices,
    setDefault,
    clearDefault,
    toggleSuppressed,
    isSuppressed,
    updateKnownDevices,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate/frontend" && npm test -- --run useDevicePreferences.test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate" checkout -b feat/smart-device-selection
git -C "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate" add frontend/src/useDevicePreferences.js frontend/src/useDevicePreferences.test.js
git -C "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate" commit -m "feat: add useDevicePreferences hook with localStorage persistence

- Read/write crate_device_prefs from localStorage
- setDefault/clearDefault with suppression conflict resolution
- toggleSuppressed with default conflict resolution
- updateKnownDevices merges by device ID

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: useDevicePreferences — resolveDevice logic

**Files:**
- Modify: `frontend/src/useDevicePreferences.test.js` (append tests)
- Modify: `frontend/src/useDevicePreferences.js` (add resolveDevice)

- [ ] **Step 1: Write failing tests for resolveDevice**

Append to `frontend/src/useDevicePreferences.test.js`:

```javascript
describe('resolveDevice', () => {
  it('returns no deviceId and no picker when no default is set', async () => {
    const { result } = renderHook(() => useDevicePreferences())
    const mockFetch = vi.fn()
    let resolution
    await act(async () => {
      resolution = await result.current.resolveDevice(mockFetch)
    })
    expect(resolution).toEqual({ deviceId: null, showPicker: false })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns deviceId when default device is in live list', async () => {
    const { result } = renderHook(() => useDevicePreferences())
    act(() => result.current.setDefault('abc'))
    const mockFetch = vi.fn().mockResolvedValue([
      { id: 'abc', name: 'Phone', type: 'Smartphone', is_active: false },
    ])
    let resolution
    await act(async () => {
      resolution = await result.current.resolveDevice(mockFetch)
    })
    expect(resolution).toEqual({ deviceId: 'abc', showPicker: false })
  })

  it('shows picker when default device is not in live list', async () => {
    const { result } = renderHook(() => useDevicePreferences())
    act(() => result.current.setDefault('abc'))
    const mockFetch = vi.fn().mockResolvedValue([
      { id: 'xyz', name: 'Other', type: 'Computer', is_active: true },
    ])
    let resolution
    await act(async () => {
      resolution = await result.current.resolveDevice(mockFetch)
    })
    expect(resolution).toEqual({ deviceId: null, showPicker: true })
  })

  it('falls back to name+type match when default ID is stale', async () => {
    const { result } = renderHook(() => useDevicePreferences())
    act(() => result.current.setDefault('old-id'))
    act(() => result.current.updateKnownDevices([
      { id: 'old-id', name: 'Phone', type: 'Smartphone' },
    ]))
    const mockFetch = vi.fn().mockResolvedValue([
      { id: 'new-id', name: 'Phone', type: 'Smartphone', is_active: false },
    ])
    let resolution
    await act(async () => {
      resolution = await result.current.resolveDevice(mockFetch)
    })
    expect(resolution).toEqual({ deviceId: 'new-id', showPicker: false })
    // Should update the stored default ID
    expect(result.current.defaultDeviceId).toBe('new-id')
  })

  it('shows picker when default device is suppressed', async () => {
    // This shouldn't normally happen (suppressing clears default),
    // but test the defensive case with pre-seeded localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      defaultDeviceId: 'abc',
      suppressedDeviceIds: ['abc'],
      knownDevices: [],
    }))
    const { result } = renderHook(() => useDevicePreferences())
    const mockFetch = vi.fn().mockResolvedValue([
      { id: 'abc', name: 'Phone', type: 'Smartphone', is_active: false },
    ])
    let resolution
    await act(async () => {
      resolution = await result.current.resolveDevice(mockFetch)
    })
    expect(resolution).toEqual({ deviceId: null, showPicker: true })
  })

  it('shows picker when all devices are suppressed', async () => {
    const { result } = renderHook(() => useDevicePreferences())
    act(() => result.current.toggleSuppressed('abc'))
    act(() => result.current.toggleSuppressed('def'))
    const mockFetch = vi.fn().mockResolvedValue([
      { id: 'abc', name: 'Phone', type: 'Smartphone', is_active: false },
      { id: 'def', name: 'Mac', type: 'Computer', is_active: false },
    ])
    let resolution
    await act(async () => {
      resolution = await result.current.resolveDevice(mockFetch)
    })
    expect(resolution).toEqual({ deviceId: null, showPicker: true })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate/frontend" && npm test -- --run useDevicePreferences.test`

Expected: FAIL — `resolveDevice` is not a function.

- [ ] **Step 3: Implement resolveDevice**

Add to `useDevicePreferences.js`, inside the hook, before the return statement:

```javascript
const resolveDevice = useCallback(async (fetchDevices) => {
  // Read current prefs directly from state ref to avoid stale closures
  const currentPrefs = readPrefs() || { defaultDeviceId: null, suppressedDeviceIds: [], knownDevices: [] }
  const { defaultDeviceId: defId, suppressedDeviceIds: suppressed, knownDevices: known } = currentPrefs

  if (!defId) return { deviceId: null, showPicker: false }

  const liveDevices = await fetchDevices()

  // Check if suppressed
  if (suppressed.includes(defId)) return { deviceId: null, showPicker: true }

  // Direct ID match
  const directMatch = liveDevices.find(d => d.id === defId)
  if (directMatch) return { deviceId: defId, showPicker: false }

  // Stale ID fallback: match by name + type from knownDevices
  const knownDevice = known.find(d => d.id === defId)
  if (knownDevice) {
    const nameMatch = liveDevices.find(
      d => d.name === knownDevice.name && d.type === knownDevice.type
    )
    if (nameMatch && !suppressed.includes(nameMatch.id)) {
      // Update the stored default ID silently
      setPrefs(prev => {
        const next = { ...prev, defaultDeviceId: nameMatch.id }
        writePrefs(next)
        return next
      })
      return { deviceId: nameMatch.id, showPicker: false }
    }
  }

  return { deviceId: null, showPicker: true }
}, [])
```

Add `resolveDevice` to the return object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate/frontend" && npm test -- --run useDevicePreferences.test`

Expected: PASS.

- [ ] **Step 5: Run full frontend test suite**

Run: `cd "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate/frontend" && npm test -- --run`

Expected: All existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git -C "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate" add frontend/src/useDevicePreferences.js frontend/src/useDevicePreferences.test.js
git -C "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate" commit -m "feat: add resolveDevice to useDevicePreferences

- Checks default device availability against live device list
- Falls back to name+type matching for stale Spotify device IDs
- Returns showPicker flag when default unavailable or suppressed

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 2: DevicePicker Shared Component

### Task 3: DevicePicker — main picker view with device list, icons, and backdrop dismiss

**Files:**
- Create: `frontend/src/components/DevicePicker.jsx`
- Create: `frontend/src/components/DevicePicker.test.jsx`

- [ ] **Step 1: Write failing tests for DevicePicker main view**

Create `frontend/src/components/DevicePicker.test.jsx`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DevicePicker from './DevicePicker'

const DEVICES = [
  { id: 'mac-id', name: 'My Mac', type: 'Computer', is_active: true },
  { id: 'phone-id', name: "Alex's iPhone", type: 'Smartphone', is_active: false },
  { id: 'speaker-id', name: 'Kitchen Speaker', type: 'Speaker', is_active: false },
]

const defaultPrefs = {
  defaultDeviceId: null,
  suppressedDeviceIds: [],
  knownDevices: [],
  setDefault: vi.fn(),
  clearDefault: vi.fn(),
  toggleSuppressed: vi.fn(),
  isSuppressed: vi.fn().mockReturnValue(false),
  updateKnownDevices: vi.fn(),
}

describe('DevicePicker — main view', () => {
  it('shows loading state initially', () => {
    let resolve
    const onFetchDevices = vi.fn().mockReturnValue(new Promise(r => { resolve = r }))
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={vi.fn()}
        preferences={defaultPrefs}
      />
    )
    expect(screen.getByText('Connect to a device')).toBeInTheDocument()
    expect(screen.getByTestId('device-picker-loading')).toBeInTheDocument()
  })

  it('renders device list after fetch', async () => {
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={vi.fn()}
        preferences={defaultPrefs}
      />
    )
    expect(await screen.findByText('My Mac')).toBeInTheDocument()
    expect(screen.getByText("Alex's iPhone")).toBeInTheDocument()
    expect(screen.getByText('Kitchen Speaker')).toBeInTheDocument()
  })

  it('shows green dot on active device', async () => {
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={vi.fn()}
        preferences={defaultPrefs}
      />
    )
    await screen.findByText('My Mac')
    const activeRow = screen.getByTestId('device-row-mac-id')
    expect(within(activeRow).getByTestId('active-dot')).toBeInTheDocument()
  })

  it('hides suppressed devices', async () => {
    const prefs = {
      ...defaultPrefs,
      suppressedDeviceIds: ['speaker-id'],
      isSuppressed: vi.fn((id) => id === 'speaker-id'),
    }
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={vi.fn()}
        preferences={prefs}
      />
    )
    await screen.findByText('My Mac')
    expect(screen.queryByText('Kitchen Speaker')).not.toBeInTheDocument()
  })

  it('calls onTransferPlayback when clicking inactive device', async () => {
    const user = userEvent.setup()
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    const onTransferPlayback = vi.fn()
    const onClose = vi.fn()
    render(
      <DevicePicker
        onClose={onClose}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={onTransferPlayback}
        preferences={defaultPrefs}
      />
    )
    await screen.findByText("Alex's iPhone")
    await user.click(screen.getByText("Alex's iPhone"))
    expect(onTransferPlayback).toHaveBeenCalledWith('phone-id')
    expect(onClose).toHaveBeenCalled()
  })

  it('does not call onTransferPlayback when clicking active device', async () => {
    const user = userEvent.setup()
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    const onTransferPlayback = vi.fn()
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={onTransferPlayback}
        preferences={defaultPrefs}
      />
    )
    await screen.findByText('My Mac')
    await user.click(screen.getByTestId('device-row-mac-id'))
    expect(onTransferPlayback).not.toHaveBeenCalled()
  })

  it('closes on backdrop click', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={onClose}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={vi.fn()}
        preferences={defaultPrefs}
      />
    )
    await screen.findByText('My Mac')
    await user.click(screen.getByTestId('device-picker-backdrop'))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape key', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={onClose}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={vi.fn()}
        preferences={defaultPrefs}
      />
    )
    await screen.findByText('My Mac')
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows empty state when no devices found', async () => {
    const onFetchDevices = vi.fn().mockResolvedValue([])
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={vi.fn()}
        preferences={defaultPrefs}
      />
    )
    expect(await screen.findByText(/no devices found/i)).toBeInTheDocument()
  })

  it('shows all-hidden state when all devices are suppressed', async () => {
    const prefs = {
      ...defaultPrefs,
      suppressedDeviceIds: ['mac-id', 'phone-id', 'speaker-id'],
      isSuppressed: vi.fn().mockReturnValue(true),
    }
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={vi.fn()}
        preferences={prefs}
      />
    )
    expect(await screen.findByText(/all available devices are hidden/i)).toBeInTheDocument()
  })

  it('shows hide button on non-active device rows', async () => {
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={vi.fn()}
        preferences={defaultPrefs}
      />
    )
    await screen.findByText("Alex's iPhone")
    const phoneRow = screen.getByTestId('device-row-phone-id')
    expect(within(phoneRow).getByTestId('hide-device-btn')).toBeInTheDocument()
    // Active device should NOT have hide button
    const macRow = screen.getByTestId('device-row-mac-id')
    expect(within(macRow).queryByTestId('hide-device-btn')).not.toBeInTheDocument()
  })

  it('calls toggleSuppressed when hide button clicked', async () => {
    const user = userEvent.setup()
    const toggleSuppressed = vi.fn()
    const prefs = { ...defaultPrefs, toggleSuppressed }
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={vi.fn()}
        preferences={prefs}
      />
    )
    await screen.findByText("Alex's iPhone")
    const phoneRow = screen.getByTestId('device-row-phone-id')
    await user.click(within(phoneRow).getByTestId('hide-device-btn'))
    expect(toggleSuppressed).toHaveBeenCalledWith('phone-id')
  })

  it('calls updateKnownDevices after fetching', async () => {
    const updateKnownDevices = vi.fn()
    const prefs = { ...defaultPrefs, updateKnownDevices }
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={vi.fn()}
        preferences={prefs}
      />
    )
    await screen.findByText('My Mac')
    expect(updateKnownDevices).toHaveBeenCalledWith(DEVICES)
  })

  it('shows star icon next to default device', async () => {
    const prefs = { ...defaultPrefs, defaultDeviceId: 'phone-id' }
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={vi.fn()}
        preferences={prefs}
      />
    )
    await screen.findByText("Alex's iPhone")
    const phoneRow = screen.getByTestId('device-row-phone-id')
    expect(within(phoneRow).getByTestId('default-star')).toBeInTheDocument()
  })

  it('shows retry button when fetch fails', async () => {
    const user = userEvent.setup()
    const onFetchDevices = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(DEVICES)
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={vi.fn()}
        preferences={defaultPrefs}
      />
    )
    expect(await screen.findByText(/couldn't load devices/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('My Mac')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate/frontend" && npm test -- --run DevicePicker.test`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement DevicePicker component**

Create `frontend/src/components/DevicePicker.jsx`:

```javascript
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

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1.08-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1.08 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001.08 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1.08z" />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
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

// --- Exported speaker icon for PlaybackBar indicator ---
export function SpeakerIndicatorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.08" />
    </svg>
  )
}

export default function DevicePicker({
  onClose,
  onFetchDevices,
  onTransferPlayback,
  preferences,
  onDeviceSelected,
}) {
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const fetchAndShow = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const list = await onFetchDevices()
      setDevices(list)
      preferences.updateKnownDevices(list)
    } catch {
      setError(true)
    }
    setLoading(false)
  }, [onFetchDevices, preferences.updateKnownDevices])

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

  function handleTransfer(deviceId) {
    onClose()
    if (onDeviceSelected) {
      onDeviceSelected(deviceId)
    } else {
      onTransferPlayback(deviceId)
    }
  }

  const visibleDevices = devices.filter(d => !preferences.isSuppressed(d.id))
  const allHidden = devices.length > 0 && visibleDevices.length === 0

  if (showSettings) {
    return (
      <>
        <div
          data-testid="device-picker-backdrop"
          className="fixed inset-0 z-[299]"
          onClick={onClose}
        />
        <div
          role="dialog"
          aria-label="Device settings"
          className="absolute bottom-[calc(100%+8px)] right-0 bg-surface border border-border rounded-lg min-w-[240px] shadow-[0_4px_16px_rgba(0,0,0,0.3)] z-[300]"
        >
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
            <button
              aria-label="Back to device list"
              className="bg-transparent border-none text-text-dim cursor-pointer p-0.5 rounded hover:text-text"
              onClick={() => setShowSettings(false)}
            >
              <BackIcon />
            </button>
            <span className="text-sm font-semibold text-text">Device Settings</span>
          </div>

          {/* Default device section */}
          <div className="px-3 py-2">
            <div className="text-xs font-bold uppercase tracking-wider text-text-dim mb-1.5">Default Device</div>
            {preferences.defaultDeviceId ? (
              <div className="flex items-center justify-between text-sm text-text py-1">
                <span>{preferences.knownDevices.find(d => d.id === preferences.defaultDeviceId)?.name ?? 'Unknown'}</span>
                <button
                  className="text-xs text-text-dim bg-transparent border-none cursor-pointer hover:text-text"
                  onClick={() => preferences.clearDefault()}
                >
                  Clear
                </button>
              </div>
            ) : (
              <div className="text-sm text-text-dim italic py-1">None set</div>
            )}
            {visibleDevices.filter(d => d.id !== preferences.defaultDeviceId).map(d => (
              <div
                key={d.id}
                className="flex items-center gap-2 py-1.5 px-1 text-sm text-text-dim cursor-pointer rounded hover:bg-surface-2"
                onClick={() => preferences.setDefault(d.id)}
              >
                {deviceTypeIcon(d.type)}
                <span>{d.name}</span>
              </div>
            ))}
          </div>

          {/* Hidden devices section */}
          {preferences.suppressedDeviceIds.length > 0 && (
            <div className="px-3 py-2 border-t border-border">
              <div className="text-xs font-bold uppercase tracking-wider text-text-dim mb-1.5">Hidden Devices</div>
              {preferences.suppressedDeviceIds.map(id => {
                const known = preferences.knownDevices.find(d => d.id === id)
                return (
                  <div key={id} className="flex items-center justify-between py-1.5 text-sm text-text-dim">
                    <span>{known?.name ?? id}</span>
                    <button
                      data-testid={`unhide-${id}`}
                      className="text-xs text-text-dim bg-transparent border-none cursor-pointer hover:text-text"
                      onClick={() => preferences.toggleSuppressed(id)}
                    >
                      Unhide
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <div
        data-testid="device-picker-backdrop"
        className="fixed inset-0 z-[299]"
        onClick={onClose}
      />
      <div
        role="listbox"
        aria-label="Select device"
        className="absolute bottom-[calc(100%+8px)] right-0 bg-surface border border-border rounded-lg min-w-[240px] shadow-[0_4px_16px_rgba(0,0,0,0.3)] z-[300]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <span className="text-sm font-semibold text-text">Connect to a device</span>
          <button
            aria-label="Device settings"
            data-testid="device-settings-btn"
            className="bg-transparent border-none text-text-dim cursor-pointer p-0.5 rounded hover:text-text"
            onClick={() => setShowSettings(true)}
          >
            <GearIcon />
          </button>
        </div>

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
        ) : allHidden ? (
          <div className="py-3 px-3 text-sm text-text-dim">
            All available devices are hidden.{' '}
            <button
              className="text-text bg-transparent border-none cursor-pointer hover:underline p-0 text-sm"
              onClick={() => setShowSettings(true)}
            >
              Manage
            </button>
          </div>
        ) : visibleDevices.length === 0 ? (
          <div className="py-3 px-3 text-sm text-text-dim">No devices found. Open Spotify on any device.</div>
        ) : (
          visibleDevices.map(d => (
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
              onClick={d.is_active ? undefined : () => handleTransfer(d.id)}
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
              {preferences.defaultDeviceId === d.id && (
                <span data-testid="default-star" className="text-xs text-text-dim flex-shrink-0">★</span>
              )}
              {!d.is_active && (
                <button
                  data-testid="hide-device-btn"
                  aria-label={`Hide ${d.name}`}
                  className="text-text-dim bg-transparent border-none cursor-pointer text-xs p-0.5 rounded opacity-50 hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); preferences.toggleSuppressed(d.id) }}
                >
                  ×
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate/frontend" && npm test -- --run DevicePicker.test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate" add frontend/src/components/DevicePicker.jsx frontend/src/components/DevicePicker.test.jsx
git -C "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate" commit -m "feat: add shared DevicePicker component

- Device list with type icons (laptop/phone/speaker)
- Green dot + accent color on active device
- Star icon on default device
- Hide button on inactive devices
- Backdrop overlay for click-outside dismiss
- Escape key dismiss
- Loading, error (with retry), empty, all-hidden states
- Gear icon opens settings sub-view placeholder

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: DevicePicker — preferences sub-view tests

**Files:**
- Modify: `frontend/src/components/DevicePicker.test.jsx` (append tests)

- [ ] **Step 1: Write tests for preferences sub-view**

Append to `frontend/src/components/DevicePicker.test.jsx`:

```javascript
describe('DevicePicker — settings sub-view', () => {
  it('opens settings when gear icon clicked', async () => {
    const user = userEvent.setup()
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={vi.fn()}
        preferences={defaultPrefs}
      />
    )
    await screen.findByText('My Mac')
    await user.click(screen.getByTestId('device-settings-btn'))
    expect(screen.getByText('Device Settings')).toBeInTheDocument()
  })

  it('shows current default device with clear button', async () => {
    const user = userEvent.setup()
    const clearDefault = vi.fn()
    const prefs = {
      ...defaultPrefs,
      defaultDeviceId: 'phone-id',
      knownDevices: [{ id: 'phone-id', name: "Alex's iPhone", type: 'Smartphone' }],
      clearDefault,
    }
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={vi.fn()}
        preferences={prefs}
      />
    )
    await screen.findByText('My Mac')
    await user.click(screen.getByTestId('device-settings-btn'))
    expect(screen.getByText("Alex's iPhone")).toBeInTheDocument()
    await user.click(screen.getByText('Clear'))
    expect(clearDefault).toHaveBeenCalled()
  })

  it('shows "None set" when no default device', async () => {
    const user = userEvent.setup()
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={vi.fn()}
        preferences={defaultPrefs}
      />
    )
    await screen.findByText('My Mac')
    await user.click(screen.getByTestId('device-settings-btn'))
    expect(screen.getByText('None set')).toBeInTheDocument()
  })

  it('calls setDefault when clicking a device in settings', async () => {
    const user = userEvent.setup()
    const setDefault = vi.fn()
    const prefs = { ...defaultPrefs, setDefault }
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={vi.fn()}
        preferences={prefs}
      />
    )
    await screen.findByText('My Mac')
    await user.click(screen.getByTestId('device-settings-btn'))
    await user.click(screen.getByText('My Mac'))
    expect(setDefault).toHaveBeenCalledWith('mac-id')
  })

  it('shows hidden devices with unhide button', async () => {
    const user = userEvent.setup()
    const toggleSuppressed = vi.fn()
    const prefs = {
      ...defaultPrefs,
      suppressedDeviceIds: ['speaker-id'],
      knownDevices: [{ id: 'speaker-id', name: 'Kitchen Speaker', type: 'Speaker' }],
      isSuppressed: vi.fn((id) => id === 'speaker-id'),
      toggleSuppressed,
    }
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={vi.fn()}
        preferences={prefs}
      />
    )
    await screen.findByText('My Mac')
    await user.click(screen.getByTestId('device-settings-btn'))
    expect(screen.getByText('Kitchen Speaker')).toBeInTheDocument()
    await user.click(screen.getByTestId('unhide-speaker-id'))
    expect(toggleSuppressed).toHaveBeenCalledWith('speaker-id')
  })

  it('back button returns to main picker view', async () => {
    const user = userEvent.setup()
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={vi.fn()}
        preferences={defaultPrefs}
      />
    )
    await screen.findByText('My Mac')
    await user.click(screen.getByTestId('device-settings-btn'))
    expect(screen.getByText('Device Settings')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.getByText('Connect to a device')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

The settings sub-view was already implemented in Step 3 of Task 3. These tests validate the implementation.

Run: `cd "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate/frontend" && npm test -- --run DevicePicker.test`

Expected: PASS. If any fail, adjust the implementation to match.

- [ ] **Step 3: Commit**

```bash
git -C "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate" add frontend/src/components/DevicePicker.test.jsx
git -C "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate" commit -m "test: add DevicePicker preferences sub-view tests

- Settings open/close via gear and back button
- Default device display, set, clear
- Hidden devices list with unhide

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 3: Integration — PlaybackBar, FullScreenNowPlaying, App.jsx

### Task 5: PlaybackBar — speaker icon + DevicePicker integration

**Files:**
- Modify: `frontend/src/components/PlaybackBar.jsx`
- Modify: `frontend/src/components/PlaybackBar.test.jsx`

- [ ] **Step 1: Write failing tests for speaker icon and DevicePicker**

Append to `frontend/src/components/PlaybackBar.test.jsx`. First, update the imports at the top to include the needed test utilities, then append:

```javascript
// --- Speaker icon + DevicePicker ---

describe('device indicator', () => {
  it('renders speaker icon when device is present', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
        onFetchDevices={vi.fn().mockResolvedValue([])}
        onTransferPlayback={vi.fn()}
        devicePreferences={{
          defaultDeviceId: null,
          suppressedDeviceIds: [],
          knownDevices: [],
          setDefault: vi.fn(),
          clearDefault: vi.fn(),
          toggleSuppressed: vi.fn(),
          isSuppressed: vi.fn().mockReturnValue(false),
          updateKnownDevices: vi.fn(),
        }}
      />
    )
    expect(screen.getByTestId('device-indicator')).toBeInTheDocument()
  })

  it('speaker icon is green when device type is not Computer', () => {
    const remoteState = {
      ...PLAYING_STATE,
      device: { name: "Alex's iPhone", type: 'Smartphone' },
    }
    render(
      <PlaybackBar
        state={remoteState}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
        onFetchDevices={vi.fn().mockResolvedValue([])}
        onTransferPlayback={vi.fn()}
        devicePreferences={{
          defaultDeviceId: null,
          suppressedDeviceIds: [],
          knownDevices: [],
          setDefault: vi.fn(),
          clearDefault: vi.fn(),
          toggleSuppressed: vi.fn(),
          isSuppressed: vi.fn().mockReturnValue(false),
          updateKnownDevices: vi.fn(),
        }}
      />
    )
    const indicator = screen.getByTestId('device-indicator')
    expect(indicator).toHaveStyle({ color: 'var(--accent)' })
  })

  it('speaker icon is dim when device type is Computer', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
        onFetchDevices={vi.fn().mockResolvedValue([])}
        onTransferPlayback={vi.fn()}
        devicePreferences={{
          defaultDeviceId: null,
          suppressedDeviceIds: [],
          knownDevices: [],
          setDefault: vi.fn(),
          clearDefault: vi.fn(),
          toggleSuppressed: vi.fn(),
          isSuppressed: vi.fn().mockReturnValue(false),
          updateKnownDevices: vi.fn(),
        }}
      />
    )
    const indicator = screen.getByTestId('device-indicator')
    expect(indicator).toHaveStyle({ color: 'var(--text-dim)' })
  })

  it('opens DevicePicker on speaker icon click', async () => {
    const user = userEvent.setup()
    const onFetchDevices = vi.fn().mockResolvedValue([
      { id: 'mac-id', name: 'My Mac', type: 'Computer', is_active: true },
    ])
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={vi.fn()}
        devicePreferences={{
          defaultDeviceId: null,
          suppressedDeviceIds: [],
          knownDevices: [],
          setDefault: vi.fn(),
          clearDefault: vi.fn(),
          toggleSuppressed: vi.fn(),
          isSuppressed: vi.fn().mockReturnValue(false),
          updateKnownDevices: vi.fn(),
        }}
      />
    )
    await user.click(screen.getByTestId('device-indicator'))
    expect(await screen.findByText('Connect to a device')).toBeInTheDocument()
  })

  it('does not render speaker icon when no device', () => {
    render(
      <PlaybackBar
        state={IDLE_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    expect(screen.queryByTestId('device-indicator')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate/frontend" && npm test -- --run PlaybackBar.test`

Expected: FAIL — `device-indicator` not found.

- [ ] **Step 3: Refactor PlaybackBar.jsx**

In `PlaybackBar.jsx`:

**3a. Add import at top:**
```javascript
import DevicePicker, { SpeakerIndicatorIcon } from './DevicePicker'
```

**3b. Add `devicePreferences` to the component props** (alongside existing `onFetchDevices` and `onTransferPlayback`).

**3c. Remove all inline device picker state and logic:**
- Remove: `devicesOpen`, `devices`, `devicesLoading`, `devicePickerRef` state declarations
- Remove: the `useEffect` for click-outside / Escape handling (lines ~213-229)
- Remove: `handleOpenDevicePicker` and `handleTransfer` functions

**3d. Add simple toggle state:**
```javascript
const [pickerOpen, setPickerOpen] = useState(false)
```

**3e. Replace the entire device section in the RIGHT ZONE JSX** (the block from `{(device && onFetchDevices ? (` to the closing `)}`) with:

```jsx
{device && onFetchDevices && (
  <div style={{ position: 'relative' }}>
    <button
      data-testid="device-indicator"
      aria-label="Select playback device"
      className="bg-transparent border-none cursor-pointer p-1 rounded flex items-center justify-center"
      style={{ color: device.type !== 'Computer' ? 'var(--accent)' : 'var(--text-dim)' }}
      onClick={() => setPickerOpen(o => !o)}
    >
      <SpeakerIndicatorIcon />
    </button>
    {pickerOpen && (
      <DevicePicker
        onClose={() => setPickerOpen(false)}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={onTransferPlayback}
        preferences={devicePreferences}
      />
    )}
  </div>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate/frontend" && npm test -- --run PlaybackBar.test`

Expected: PASS. Some existing device picker tests may need updating or removal since they tested the old inline picker. Remove tests that reference the old `▸ {device.name} ▾` pattern.

- [ ] **Step 5: Commit**

```bash
git -C "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate" add frontend/src/components/PlaybackBar.jsx frontend/src/components/PlaybackBar.test.jsx
git -C "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate" commit -m "feat: replace PlaybackBar device text with speaker icon + DevicePicker

- Speaker icon: green for remote devices, dim for Computer
- Click opens shared DevicePicker component
- Removes all inline picker logic (fixes click-outside bug)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: FullScreenNowPlaying — "Listening on" banner + DevicePicker

**Files:**
- Modify: `frontend/src/components/FullScreenNowPlaying.jsx`
- Modify: `frontend/src/components/FullScreenNowPlaying.test.jsx`

- [ ] **Step 1: Write failing tests**

Append to `frontend/src/components/FullScreenNowPlaying.test.jsx`:

```javascript
describe('device indicator', () => {
  it('shows "Listening on" banner when device is remote', () => {
    render(
      <FullScreenNowPlaying
        {...defaultProps}
        state={{ ...defaultProps.state, device: { name: "Alex's iPhone", type: 'Smartphone' } }}
        devicePreferences={{
          defaultDeviceId: null,
          suppressedDeviceIds: [],
          knownDevices: [],
          setDefault: vi.fn(),
          clearDefault: vi.fn(),
          toggleSuppressed: vi.fn(),
          isSuppressed: vi.fn().mockReturnValue(false),
          updateKnownDevices: vi.fn(),
        }}
      />
    )
    expect(screen.getByText(/listening on/i)).toBeInTheDocument()
    expect(screen.getByText("Alex's iPhone")).toBeInTheDocument()
  })

  it('hides banner when device type is Computer', () => {
    render(
      <FullScreenNowPlaying
        {...defaultProps}
        state={{ ...defaultProps.state, device: { name: 'My Mac', type: 'Computer' } }}
        devicePreferences={{
          defaultDeviceId: null,
          suppressedDeviceIds: [],
          knownDevices: [],
          setDefault: vi.fn(),
          clearDefault: vi.fn(),
          toggleSuppressed: vi.fn(),
          isSuppressed: vi.fn().mockReturnValue(false),
          updateKnownDevices: vi.fn(),
        }}
      />
    )
    expect(screen.queryByText(/listening on/i)).not.toBeInTheDocument()
  })

  it('opens DevicePicker when banner tapped', async () => {
    const user = userEvent.setup()
    const onFetchDevices = vi.fn().mockResolvedValue([
      { id: 'phone-id', name: "Alex's iPhone", type: 'Smartphone', is_active: true },
    ])
    render(
      <FullScreenNowPlaying
        {...defaultProps}
        state={{ ...defaultProps.state, device: { name: "Alex's iPhone", type: 'Smartphone' } }}
        onFetchDevices={onFetchDevices}
        devicePreferences={{
          defaultDeviceId: null,
          suppressedDeviceIds: [],
          knownDevices: [],
          setDefault: vi.fn(),
          clearDefault: vi.fn(),
          toggleSuppressed: vi.fn(),
          isSuppressed: vi.fn().mockReturnValue(false),
          updateKnownDevices: vi.fn(),
        }}
      />
    )
    await user.click(screen.getByText(/listening on/i))
    expect(await screen.findByText('Connect to a device')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate/frontend" && npm test -- --run FullScreenNowPlaying.test`

Expected: FAIL.

- [ ] **Step 3: Refactor FullScreenNowPlaying.jsx**

**3a. Add import:**
```javascript
import DevicePicker, { SpeakerIndicatorIcon } from './DevicePicker'
```

**3b. Add `devicePreferences` prop** to the component signature.

**3c. Remove inline device picker state and logic:**
- Remove: `devicesOpen`, `devices`, `devicesLoading` state
- Remove: `handleOpenDevicePicker` function

**3d. Add simple toggle:**
```javascript
const [pickerOpen, setPickerOpen] = useState(false)
```

**3e. Replace the device selector section** (the `{device && onFetchDevices && (` block) with:

```jsx
{device && device.type !== 'Computer' && onFetchDevices && (
  <div className="mt-3 relative">
    <button
      className="text-xs bg-transparent border-none flex items-center gap-1.5 mx-auto"
      style={{ color: 'var(--accent)' }}
      onClick={() => setPickerOpen(o => !o)}
    >
      <SpeakerIndicatorIcon />
      <span>Listening on <strong>{device.name}</strong></span>
    </button>
    {pickerOpen && (
      <DevicePicker
        onClose={() => setPickerOpen(false)}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={onTransferPlayback}
        preferences={devicePreferences}
      />
    )}
  </div>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate/frontend" && npm test -- --run FullScreenNowPlaying.test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate" add frontend/src/components/FullScreenNowPlaying.jsx frontend/src/components/FullScreenNowPlaying.test.jsx
git -C "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate" commit -m "feat: add Listening On banner + DevicePicker to FullScreenNowPlaying

- Green 'Listening on {device}' banner for non-Computer devices
- Tap opens shared DevicePicker
- Removes duplicated inline picker logic

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: App.jsx — wire useDevicePreferences + smart handlePlay + modal picker

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Read current App.jsx**

Read `frontend/src/App.jsx` to see the exact current code before making changes.

- [ ] **Step 2: Add imports and hook**

Add near the top of App.jsx:
```javascript
import { useDevicePreferences } from './useDevicePreferences'
import DevicePicker from './components/DevicePicker'
```

Inside the App component, add:
```javascript
const devicePrefs = useDevicePreferences()
```

Add modal state:
```javascript
const [devicePickerModal, setDevicePickerModal] = useState(null) // null or { contextUri }
```

- [ ] **Step 3: Modify handlePlay to use resolveDevice**

Replace the `handlePlay` function. The current handlePlay calls `play(contextUri)` directly. The new version:

```javascript
const handlePlay = useCallback(async (spotifyId) => {
  if (playingIdRef.current === spotifyId && isPlayingRef.current) {
    await pause()
    return null
  } else {
    const contextUri = `spotify:album:${spotifyId}`
    const { deviceId, showPicker } = await devicePrefs.resolveDevice(fetchDevices)

    if (showPicker) {
      setDevicePickerModal({ contextUri, spotifyId })
      return null
    }

    if (deviceId) {
      await transferPlayback(deviceId)
    }

    const prevPlayingId = playingIdRef.current
    setPlayingId(spotifyId) // optimistic
    const err = await play(contextUri)
    if (err) {
      setPlayingId(prevPlayingId) // revert
      if (err === 'no_device') {
        setPlaybackMessage({ code: 'NO_DEVICE', text: 'No Spotify device found. Open Spotify on any device and try again.' })
        setTimeout(() => setPlaybackMessage(null), 4000)
      } else if (err === 'restricted_device') {
        setPlaybackMessage({ code: 'RESTRICTED', text: 'This device restricts API playback. Start playing in Spotify first, then control it here.' })
        setTimeout(() => setPlaybackMessage(null), 6000)
      }
    }
    if (!err) {
      setNowPlayingSpotifyId(spotifyId)
      setNowPlayingImageUrl(
        albums.find(a => a.spotify_id === spotifyId)?.image_url ?? null
      )
    }
    return err
  }
}, [play, pause, fetchDevices, transferPlayback, devicePrefs.resolveDevice, albums])
```

- [ ] **Step 4: Add modal picker handler**

Add after handlePlay:

```javascript
const handleModalDeviceSelected = useCallback(async (deviceId) => {
  const modal = devicePickerModal
  setDevicePickerModal(null)
  if (!modal) return

  await transferPlayback(deviceId)
  const prevPlayingId = playingIdRef.current
  setPlayingId(modal.spotifyId)
  const err = await play(modal.contextUri)
  if (err) {
    setPlayingId(prevPlayingId)
  } else {
    setNowPlayingSpotifyId(modal.spotifyId)
    setNowPlayingImageUrl(
      albums.find(a => a.spotify_id === modal.spotifyId)?.image_url ?? null
    )
  }
}, [devicePickerModal, transferPlayback, play, albums])
```

- [ ] **Step 5: Pass devicePreferences prop to PlaybackBar and FullScreenNowPlaying**

Find both `<PlaybackBar` and `<FullScreenNowPlaying` JSX usages and add:
```jsx
devicePreferences={devicePrefs}
```

- [ ] **Step 6: Add modal picker JSX**

Add just before the closing `</div>` of the App's return, in both mobile and desktop layouts:

```jsx
{devicePickerModal && (
  <div className="fixed inset-0 z-[400] flex items-center justify-center">
    <div className="fixed inset-0 bg-black/50" onClick={() => setDevicePickerModal(null)} />
    <div className="relative z-[401] w-[280px]">
      <DevicePicker
        onClose={() => setDevicePickerModal(null)}
        onFetchDevices={fetchDevices}
        onTransferPlayback={handleModalDeviceSelected}
        preferences={devicePrefs}
        onDeviceSelected={handleModalDeviceSelected}
      />
    </div>
  </div>
)}
```

Note: The DevicePicker in modal mode needs its positioning adjusted — it normally uses `absolute bottom-[calc(100%+8px)] right-0`. For the modal case, wrap it in a container that overrides positioning. If the DevicePicker's absolute positioning causes layout issues in modal mode, add a `modal` boolean prop to DevicePicker that switches to `relative` positioning and removes the backdrop (since the modal wrapper provides its own).

- [ ] **Step 7: Run full frontend test suite**

Run: `cd "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate/frontend" && npm test -- --run`

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git -C "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate" add frontend/src/App.jsx
git -C "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate" commit -m "feat: wire smart device selection into App.jsx

- useDevicePreferences resolves default device before play
- Modal picker shown when default device unavailable
- devicePreferences passed to PlaybackBar and FullScreenNowPlaying

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Final Verification

- [ ] **Run full backend test suite** (should be untouched — no backend changes):

```bash
cd "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate/backend" && .venv/bin/python -m pytest tests/ -v
```

- [ ] **Run full frontend test suite:**

```bash
cd "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate/frontend" && npm test -- --run
```

- [ ] **Merge to main:**

```bash
git -C "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate" checkout main
git -C "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate" merge feat/smart-device-selection
git -C "/Users/alextoofanian/Documents/20-29 Projects/21 Software/21.01 Personal Projects/crate" push origin main
```

- [ ] **Update BACKLOG.md:** Mark "Smart device selection" as completed with links to spec and plan.
