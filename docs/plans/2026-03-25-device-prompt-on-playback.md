# Device Prompt on Playback — Implementation Plan

Spec: [docs/specs/2026-03-25-device-prompt-on-playback-design.md](../specs/2026-03-25-device-prompt-on-playback-design.md)

## Status

- [x] Task 1: Backend — `PUT /play` returns 409 `no_device` instead of auto-recovering
- [ ] Task 2: DevicePicker — remove preferences/settings, add auto-poll, add inline error state
- [ ] Task 3: PlaybackBar + MiniPlaybackBar — "Connect a device" no-device state
- [ ] Task 4: App.jsx + cleanup — pending intent pattern, unify play paths, remove useDevicePreferences

---

## Task 1 (complete): Backend

**Files:** `backend/routers/playback.py`, `backend/tests/test_playback.py`

Already done. `PUT /play` returns 409 `{"detail": "no_device"}` immediately when no device is active. No auto-transfer. Tests confirm this.

---

## Task 2: DevicePicker — remove preferences/settings, add auto-poll

**Files:** `frontend/src/components/DevicePicker.jsx`, `frontend/src/components/DevicePicker.test.jsx`

### Steps

1. **Write failing tests** for the new behavior:
   - Auto-poll calls `onFetchDevices` every ~3 seconds while mounted (mock timers)
   - No gear icon / settings panel rendered
   - `preferences` prop is not accepted
   - Inline error state: if `restrictedDevice` prop is true, show "This device restricts remote playback — try another" above the device list
   - `onDeviceSelected` is the single callback (remove `onTransferPlayback` duplication)
   - Existing device list rendering tests still pass

2. **Implement changes** to `DevicePicker.jsx`:
   - Remove: `showSettings` state, `GearIcon`, `BackIcon`, the settings panel JSX block, default device star display, hide-device button, `allHidden` condition, `preferences` prop usage throughout
   - Remove: `modal` prop positioning logic (simplify — always use `relative` positioning; callers control placement)
   - Add: `useEffect` with `setInterval` (3000ms) calling `onFetchDevices`, cleared on unmount
   - Add: `restrictedDevice` prop (boolean) — when true, show inline error message above device list
   - Simplify props to: `{ onClose, onFetchDevices, onDeviceSelected, restrictedDevice }`
   - Keep: device list rendering, loading/error/empty states, device type icons, active device styling, `SpeakerIndicatorIcon` export
   - Remove: `createPortal` (callers handle their own portal/modal wrapping)

3. **Verify tests pass**

---

## Task 3: PlaybackBar + MiniPlaybackBar — "Connect a device" state

**Files:** `frontend/src/components/PlaybackBar.jsx`, `frontend/src/components/PlaybackBar.test.jsx`, `frontend/src/components/MiniPlaybackBar.jsx`, `frontend/src/components/MiniPlaybackBar.test.jsx`

### Steps

1. **Write failing tests** first:
   - When `state.device` is null and `state.is_playing` is false, renders "Connect a device" text in track area
   - Clicking/tapping "Connect a device" text calls `onOpenDevicePicker`
   - When track info is present, normal track display renders (existing tests)
   - Remove any test references to `devicePreferences` prop

2. **Implement changes** to `PlaybackBar.jsx`:
   - Add `onOpenDevicePicker` prop
   - Replace `devicePreferences` prop usage with `onOpenDevicePicker`
   - When `!state.track && !state.device` (no active device): render "Connect a device" in the track name area, make it clickable → calls `onOpenDevicePicker`
   - Remove the inline DevicePicker toggle / `preferences` prop entirely from PlaybackBar

3. **Implement changes** to `MiniPlaybackBar.jsx`:
   - Same pattern: add `onOpenDevicePicker` prop
   - When no track and no device: show "Connect a device" text, tapping calls `onOpenDevicePicker`
   - Remove `devicePreferences` prop

4. **Verify tests pass**

---

## Task 4: App.jsx + cleanup — pending intent pattern, unify play paths

**Files:** `frontend/src/App.jsx`, `frontend/src/components/FullScreenNowPlaying.jsx` (remove devicePreferences prop), delete `frontend/src/useDevicePreferences.js` + `frontend/src/useDevicePreferences.test.js`

**Depends on:** Tasks 2 and 3 (DevicePicker interface, PlaybackBar/MiniPlaybackBar props)

### Steps

1. **Remove `useDevicePreferences`:**
   - Delete `frontend/src/useDevicePreferences.js`
   - Delete `frontend/src/useDevicePreferences.test.js`
   - Remove `import { useDevicePreferences }` from `App.jsx`
   - Remove `const devicePrefs = useDevicePreferences()` from `App.jsx`

2. **Replace `devicePickerModal` state with `pendingPlayIntent`:**
   ```js
   // OLD
   const [devicePickerModal, setDevicePickerModal] = useState(null) // null or { contextUri, spotifyId }
   // NEW
   const [pendingPlayIntent, setPendingPlayIntent] = useState(null)
   // Shape: null | { type: 'album'|'track', contextUri?, trackUri?, spotifyId? }
   ```

3. **Rewrite `handlePlay`** (album play):
   - Remove the `devicePrefs.resolveDevice` + `transferPlayback` pre-check block
   - Set `playingId` optimistically, call `play(contextUri)`
   - On 409 `no_device`: revert `playingId`, store `{ type: 'album', contextUri, spotifyId }` as `pendingPlayIntent` (opens picker)
   - On 409 `restricted_device`: keep existing toast behavior
   - On success: log history

4. **Rewrite `handlePlayTrack`** (track play):
   - Call `playTrack(trackUri)`
   - On 409 `no_device`: store `{ type: 'track', trackUri }` as `pendingPlayIntent`
   - (Currently `handlePlayTrack` just delegates to `playTrack` — check if `playTrack` in `usePlayback` returns error codes; if not, update it to do so)

5. **Rewrite `handleModalDeviceSelected`** (device selected from picker):
   - Transfer to selected device
   - Retry the stored intent:
     - If `intent.type === 'album'`: set `playingId = intent.spotifyId`, call `play(intent.contextUri)`
     - If `intent.type === 'track'`: call `playTrack(intent.trackUri)`
   - On retry 409 `no_device`: reopen picker with same intent (set `pendingPlayIntent` again)
   - On retry 409 `restricted_device`: set `restrictedDevice` error flag in picker (keep picker open)
   - On success: close picker, clear intent

6. **Add "Connect a device" picker trigger:**
   - Add `openDevicePicker` helper: `setPendingPlayIntent(null)` + open the modal (need a separate boolean or rely on `pendingPlayIntent` being non-null as the signal... but for no-intent case use a sentinel like `pendingPlayIntent = 'no_intent'` or use a separate `devicePickerOpen` boolean)
   - Simplest: use a separate `devicePickerOpen` boolean, and `pendingPlayIntent` is just for intent. Open picker = `setDevicePickerOpen(true)`. Store intent separately.
   - Actually per spec: "When the intent is non-null, the device picker modal is open." For the "Connect a device" case, open picker without an intent. Use: `pendingPlayIntent = {}` as the open signal (empty object = picker open, no intent).

7. **Update DevicePicker usage** in both mobile and desktop JSX:
   - Remove `preferences` prop
   - Pass `restrictedDevice` state
   - Pass `onDeviceSelected={handleModalDeviceSelected}`
   - Remove backdrop div (DevicePicker now handles its own backdrop internally, or caller wraps with modal overlay)

8. **Update PlaybackBar** props:
   - Remove `devicePreferences={devicePrefs}`
   - Add `onOpenDevicePicker={() => setPendingPlayIntent({})}`

9. **Update MiniPlaybackBar** props:
   - Same: remove `devicePreferences`, add `onOpenDevicePicker`

10. **Update FullScreenNowPlaying** props:
    - Remove `devicePreferences={devicePrefs}` — check the component to see if it passes prefs down to DevicePicker internally; remove that entire chain

11. **Write/update App.jsx tests** if any exist (check `App.test.jsx`)

12. **Verify all frontend tests pass:** `cd frontend && npm test`

---

## Verification

After all tasks:
1. `cd backend && pytest` — all pass
2. `cd frontend && npm test` — all pass
3. Commit on `feat/device-prompt-on-playback`
