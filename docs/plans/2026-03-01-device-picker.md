# Device Picker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a clickable device picker to the PlaybackBar so the user can transfer Spotify playback between active devices without leaving the app.

**Architecture:** Two new backend endpoints (`GET /playback/devices`, `PUT /playback/transfer`) expose Spotify's device list and transfer API. The frontend adds `fetchDevices` and `transferPlayback` to the existing `usePlayback` hook, and converts the static device name in `PlaybackBar` into a clickable chip that opens a popover listing all active devices.

**Tech Stack:** FastAPI + spotipy (backend), React + Vitest + RTL (frontend), existing CSS variable design system.

---

## Task 1: Backend — GET /playback/devices

**Files:**
- Modify: `backend/tests/test_playback.py` (append tests at the bottom)
- Modify: `backend/routers/playback.py` (append new endpoint)

### Step 1: Write the failing tests

Append to the bottom of `backend/tests/test_playback.py`:

```python
# --- GET /playback/devices ---

def test_get_devices_returns_device_list():
    sp = make_sp()
    sp.devices.return_value = {
        "devices": [
            {"id": "abc123", "name": "Alex's iPhone", "type": "Smartphone", "is_active": True},
            {"id": "def456", "name": "My Mac", "type": "Computer", "is_active": False},
        ]
    }
    override_spotify(sp)

    response = client.get("/playback/devices")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0] == {"id": "abc123", "name": "Alex's iPhone", "type": "Smartphone", "is_active": True}
    assert data[1] == {"id": "def456", "name": "My Mac", "type": "Computer", "is_active": False}

    clear_overrides()


def test_get_devices_returns_empty_list_when_no_devices():
    sp = make_sp()
    sp.devices.return_value = {"devices": []}
    override_spotify(sp)

    response = client.get("/playback/devices")

    assert response.status_code == 200
    assert response.json() == []

    clear_overrides()
```

### Step 2: Run to verify they fail

```bash
cd backend && source .venv/bin/activate && pytest tests/test_playback.py::test_get_devices_returns_device_list tests/test_playback.py::test_get_devices_returns_empty_list_when_no_devices -v
```

Expected: FAIL with 404 (route doesn't exist yet).

### Step 3: Implement the endpoint

Append to the bottom of `backend/routers/playback.py`:

```python
@router.get("/devices")
def get_devices(sp: spotipy.Spotify = Depends(get_spotify)):
    result = sp.devices()
    devices = result.get("devices", [])
    return [
        {
            "id": d["id"],
            "name": d["name"],
            "type": d["type"],
            "is_active": d.get("is_active", False),
        }
        for d in devices
    ]
```

### Step 4: Run to verify they pass

```bash
pytest tests/test_playback.py::test_get_devices_returns_device_list tests/test_playback.py::test_get_devices_returns_empty_list_when_no_devices -v
```

Expected: PASS.

### Step 5: Run full backend test suite

```bash
pytest tests/ -v
```

Expected: all existing tests still pass.

### Step 6: Commit

```bash
git checkout -b feat/device-picker
git add backend/tests/test_playback.py backend/routers/playback.py
git commit -m "feat: add GET /playback/devices endpoint

- Returns list of active Spotify devices with id, name, type, is_active
- Normalizes Spotify device object to minimal shape

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Backend — PUT /playback/transfer

**Files:**
- Modify: `backend/tests/test_playback.py` (append tests)
- Modify: `backend/routers/playback.py` (append model + endpoint)

### Step 1: Write the failing tests

Append to `backend/tests/test_playback.py`:

```python
# --- PUT /playback/transfer ---

def test_transfer_playback_calls_spotify_transfer():
    sp = make_sp()
    override_spotify(sp)

    response = client.put("/playback/transfer", json={"device_id": "abc123"})

    assert response.status_code == 204
    sp.transfer_playback.assert_called_once_with("abc123", force_play=True)

    clear_overrides()


def test_transfer_playback_missing_device_id_returns_422():
    sp = make_sp()
    override_spotify(sp)

    response = client.put("/playback/transfer", json={})

    assert response.status_code == 422

    clear_overrides()
```

### Step 2: Run to verify they fail

```bash
pytest tests/test_playback.py::test_transfer_playback_calls_spotify_transfer tests/test_playback.py::test_transfer_playback_missing_device_id_returns_422 -v
```

Expected: FAIL (404 — route doesn't exist).

### Step 3: Implement the endpoint

Add the `TransferRequest` model and endpoint to `backend/routers/playback.py`. Add the model near the other Pydantic models at the top (after `VolumeRequest`):

```python
class TransferRequest(BaseModel):
    device_id: str
```

Then append the endpoint at the bottom:

```python
@router.put("/transfer")
def transfer_playback(body: TransferRequest, sp: spotipy.Spotify = Depends(get_spotify)):
    sp.transfer_playback(body.device_id, force_play=True)
    return Response(status_code=204)
```

### Step 4: Run to verify they pass

```bash
pytest tests/test_playback.py::test_transfer_playback_calls_spotify_transfer tests/test_playback.py::test_transfer_playback_missing_device_id_returns_422 -v
```

Expected: PASS.

### Step 5: Run full backend test suite

```bash
pytest tests/ -v
```

Expected: all tests pass.

### Step 6: Commit

```bash
git add backend/tests/test_playback.py backend/routers/playback.py
git commit -m "feat: add PUT /playback/transfer endpoint

- Transfers Spotify playback to specified device_id
- Uses force_play=True so music resumes immediately on target device

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Frontend — usePlayback hook additions

**Files:**
- Create: `frontend/src/usePlayback.test.js`
- Modify: `frontend/src/usePlayback.js`

### Step 1: Check if a test file exists

```bash
ls frontend/src/usePlayback.test.js 2>/dev/null || echo "not found"
```

If it doesn't exist, create it. If it does, append the new tests to it.

### Step 2: Write the failing tests

Create (or append to) `frontend/src/usePlayback.test.js`:

```javascript
import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { usePlayback } from './usePlayback'

// Suppress polling during tests
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ is_playing: false, track: null, device: null }),
  }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('fetchDevices', () => {
  it('returns device list from /playback/devices', async () => {
    const devices = [
      { id: 'abc', name: "Alex's iPhone", type: 'Smartphone', is_active: true },
      { id: 'def', name: 'My Mac', type: 'Computer', is_active: false },
    ]
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ is_playing: false, track: null, device: null }) })
    fetch.mockResolvedValueOnce({ ok: true, json: async () => devices })

    const { result } = renderHook(() => usePlayback())

    let returned
    await act(async () => {
      returned = await result.current.fetchDevices()
    })

    expect(returned).toEqual(devices)
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/playback/devices'))
  })

  it('returns empty array when fetch fails', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ is_playing: false, track: null, device: null }) })
    fetch.mockResolvedValueOnce({ ok: false })

    const { result } = renderHook(() => usePlayback())

    let returned
    await act(async () => {
      returned = await result.current.fetchDevices()
    })

    expect(returned).toEqual([])
  })
})

describe('transferPlayback', () => {
  it('calls PUT /playback/transfer with device_id and then refreshes state', async () => {
    const newState = { is_playing: true, track: { name: 'Song', album: 'Album', artists: ['Artist'], progress_ms: 0, duration_ms: 200000 }, device: { name: 'My Mac', type: 'Computer' } }

    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ is_playing: false, track: null, device: null }) }) // initial poll
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })   // transfer PUT
      .mockResolvedValueOnce({ ok: true, json: async () => newState }) // state refresh

    const { result } = renderHook(() => usePlayback())

    await act(async () => {
      await result.current.transferPlayback('abc123')
    })

    const transferCall = fetch.mock.calls.find(c => c[0].includes('/playback/transfer'))
    expect(transferCall).toBeTruthy()
    const body = JSON.parse(transferCall[1].body)
    expect(body.device_id).toBe('abc123')
    expect(transferCall[1].method).toBe('PUT')
  })
})
```

### Step 3: Run to verify they fail

```bash
cd frontend && npm test -- --run usePlayback.test
```

Expected: FAIL — `fetchDevices` and `transferPlayback` are not returned by the hook yet.

### Step 4: Implement in usePlayback.js

Open `frontend/src/usePlayback.js`. The current return statement is:

```javascript
return { state, play, playTrack, pause, previousTrack, nextTrack, setVolume }
```

Add these two functions before the return statement (after `setVolume`):

```javascript
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
```

Update the return statement to include the new functions:

```javascript
return { state, play, playTrack, pause, previousTrack, nextTrack, setVolume, fetchDevices, transferPlayback }
```

### Step 5: Run to verify they pass

```bash
npm test -- --run usePlayback.test
```

Expected: PASS.

### Step 6: Run full frontend test suite

```bash
npm test -- --run
```

Expected: all existing tests still pass.

### Step 7: Commit

```bash
cd ..
git add frontend/src/usePlayback.js frontend/src/usePlayback.test.js
git commit -m "feat: add fetchDevices and transferPlayback to usePlayback

- fetchDevices: GETs /playback/devices, returns empty array on failure
- transferPlayback: PUTs /playback/transfer then refreshes playback state

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Frontend — PlaybackBar device picker UI

**Files:**
- Modify: `frontend/src/components/PlaybackBar.test.jsx` (append tests)
- Modify: `frontend/src/components/PlaybackBar.jsx` (add picker UI)

### Step 1: Write the failing tests

Append to `frontend/src/components/PlaybackBar.test.jsx`.

First, check what the PLAYING_STATE constant looks like at the top of the test file — it should have `device: { name: 'My Mac', type: 'Computer' }`. The new tests rely on that.

Append these tests at the bottom of the file:

```javascript
// --- Device picker ---

const DEVICE_LIST = [
  { id: 'mac-id', name: 'My Mac', type: 'Computer', is_active: true },
  { id: 'iphone-id', name: "Alex's iPhone", type: 'Smartphone', is_active: false },
]

describe('device picker', () => {
  it('renders device name as a button', () => {
    render(
      <PlaybackBar
        {...defaultProps}
        state={PLAYING_STATE}
        onFetchDevices={vi.fn()}
        onTransferPlayback={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /my mac/i })).toBeInTheDocument()
  })

  it('opens device list popover on click and shows devices', async () => {
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICE_LIST)
    render(
      <PlaybackBar
        {...defaultProps}
        state={PLAYING_STATE}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={vi.fn()}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /my mac/i }))

    expect(await screen.findByText("Alex's iPhone")).toBeInTheDocument()
    expect(screen.getByText('My Mac', { selector: '[data-testid="device-option"]' })).toBeInTheDocument()
  })

  it('shows checkmark next to active device', async () => {
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICE_LIST)
    render(
      <PlaybackBar
        {...defaultProps}
        state={PLAYING_STATE}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={vi.fn()}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /my mac/i }))
    await screen.findByText("Alex's iPhone")

    const activeOption = screen.getByText('My Mac', { selector: '[data-testid="device-option"]' }).closest('[data-testid="device-row"]')
    expect(activeOption).toHaveTextContent('✓')
  })

  it('calls onTransferPlayback with device id when clicking inactive device', async () => {
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICE_LIST)
    const onTransferPlayback = vi.fn().mockResolvedValue(undefined)
    render(
      <PlaybackBar
        {...defaultProps}
        state={PLAYING_STATE}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={onTransferPlayback}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /my mac/i }))
    await screen.findByText("Alex's iPhone")
    await userEvent.click(screen.getByText("Alex's iPhone"))

    expect(onTransferPlayback).toHaveBeenCalledWith('iphone-id')
  })

  it('closes popover after transferring to a device', async () => {
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICE_LIST)
    const onTransferPlayback = vi.fn().mockResolvedValue(undefined)
    render(
      <PlaybackBar
        {...defaultProps}
        state={PLAYING_STATE}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={onTransferPlayback}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /my mac/i }))
    await screen.findByText("Alex's iPhone")
    await userEvent.click(screen.getByText("Alex's iPhone"))

    expect(screen.queryByText("Alex's iPhone")).not.toBeInTheDocument()
  })

  it('shows loading state while fetching devices', async () => {
    let resolve
    const onFetchDevices = vi.fn().mockReturnValue(new Promise(r => { resolve = r }))
    render(
      <PlaybackBar
        {...defaultProps}
        state={PLAYING_STATE}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={vi.fn()}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /my mac/i }))
    expect(screen.getByText('...')).toBeInTheDocument()

    resolve(DEVICE_LIST)
    expect(await screen.findByText("Alex's iPhone")).toBeInTheDocument()
  })

  it('shows "No other devices found" when device list is empty', async () => {
    const onFetchDevices = vi.fn().mockResolvedValue([])
    render(
      <PlaybackBar
        {...defaultProps}
        state={PLAYING_STATE}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={vi.fn()}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /my mac/i }))
    expect(await screen.findByText('No other devices found')).toBeInTheDocument()
  })

  it('closes popover when Escape is pressed', async () => {
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICE_LIST)
    render(
      <PlaybackBar
        {...defaultProps}
        state={PLAYING_STATE}
        onFetchDevices={onFetchDevices}
        onTransferPlayback={vi.fn()}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /my mac/i }))
    await screen.findByText("Alex's iPhone")

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByText("Alex's iPhone")).not.toBeInTheDocument()
  })
})
```

**Note:** The tests assume a `defaultProps` object is already defined at the top of `PlaybackBar.test.jsx`. Check whether it exists. If the file uses individual prop spreads per test instead, adapt the tests to match whatever pattern the file uses. The key is passing `onFetchDevices` and `onTransferPlayback` as props.

### Step 2: Run to verify they fail

```bash
cd frontend && npm test -- --run PlaybackBar.test
```

Expected: FAIL — `onFetchDevices` prop not accepted, device name not a button.

### Step 3: Implement in PlaybackBar.jsx

**3a. Add new props to the component signature.**

Current signature:
```javascript
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
}) {
```

Add two new props:
```javascript
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
```

**3b. Add local state for the picker.** Add near the top of the component body, after the existing `const [volume, setVolume] = useState(50)` line:

```javascript
const [devicesOpen, setDevicesOpen] = useState(false)
const [devices, setDevices] = useState([])
const [devicesLoading, setDevicesLoading] = useState(false)
const devicePickerRef = useRef(null)
```

**3c. Add Escape key listener and click-outside handler.** Add a new `useEffect` after the existing spacebar `useEffect`:

```javascript
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
```

**3d. Add the handler for opening the picker:**

```javascript
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
```

**3e. Add styles.** Add these entries to the `styles` object at the top of the file (after `styles.deviceName`):

```javascript
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
```

**3f. Replace the static device name span in the JSX.** In the RIGHT ZONE section, find:

```jsx
{device && (
  <span style={styles.deviceName}>▸ {device.name}</span>
)}
```

Replace with:

```jsx
{device && onFetchDevices && (
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
)}

{device && !onFetchDevices && (
  <span style={styles.deviceName}>▸ {device.name}</span>
)}
```

### Step 4: Run to verify they pass

```bash
npm test -- --run PlaybackBar.test
```

Expected: PASS.

### Step 5: Run full frontend test suite

```bash
npm test -- --run
```

Expected: all tests pass.

### Step 6: Commit

```bash
cd ..
git add frontend/src/components/PlaybackBar.jsx frontend/src/components/PlaybackBar.test.jsx
git commit -m "feat: add device picker popover to PlaybackBar

- Device name becomes clickable chip with ▾ caret
- Popover fetches live device list on open
- Active device shows ✓ checkmark
- Click inactive device to transfer playback
- Dismisses on click-outside or Escape

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Wire up in App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`

### Step 1: Read App.jsx first

Before editing, read `frontend/src/App.jsx` to see the current `usePlayback` destructuring and the `<PlaybackBar>` usage.

### Step 2: Update usePlayback destructuring

Find the line that destructures `usePlayback()`. It currently looks like:

```javascript
const { state: playback, play, playTrack, pause, previousTrack, nextTrack, setVolume } = usePlayback()
```

Add the two new functions:

```javascript
const { state: playback, play, playTrack, pause, previousTrack, nextTrack, setVolume, fetchDevices, transferPlayback } = usePlayback()
```

### Step 3: Pass new props to PlaybackBar

Find the `<PlaybackBar` JSX block. Add the two new props:

```jsx
onFetchDevices={fetchDevices}
onTransferPlayback={transferPlayback}
```

### Step 4: Run full test suite to verify nothing broke

```bash
cd frontend && npm test -- --run
```

Expected: all tests pass.

### Step 5: Commit

```bash
cd ..
git add frontend/src/App.jsx
git commit -m "feat: wire device picker into App.jsx

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Final Verification

Run the complete test suites for both backend and frontend:

```bash
cd backend && source .venv/bin/activate && pytest tests/ -v
cd ../frontend && npm test -- --run
```

All tests should pass. Then merge to main:

```bash
cd ..
git checkout main
git merge feat/device-picker
```
