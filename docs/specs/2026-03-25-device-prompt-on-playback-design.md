# Device Prompt on Playback

## Problem

When no Spotify device is active and the user triggers playback, the backend silently falls back to `devices[0]` (usually the laptop). This means:

- Playing from phone always starts on the laptop
- The user's phone doesn't appear in the device list unless Spotify is actively open on it
- The auto-fallback removes user agency over where music plays

This is rooted in a Spotify Connect limitation: the `/me/player/devices` API only returns devices with an active Spotify session. A phone with Spotify backgrounded won't appear.

## Solution

Replace the current auto-fallback with an explicit device selection flow. When the user triggers any play action and no device is currently active, open the device picker as a modal. The user selects a device (opening Spotify on it if needed to make it appear), playback transfers there, and the original play intent executes automatically.

## Design decisions

- **No default device system.** The existing default/suppressed device preferences (`useDevicePreferences.js`) are removed entirely. Every cold-start playback goes through the picker. This is simpler and avoids stale device ID issues.
- **Pending intent pattern.** The play intent (album or track) is stored in state while the picker is open. On device selection, transfer + retry happens automatically.
- **Auto-poll in picker.** The device picker polls `/playback/devices` every ~3 seconds while open, so newly-opened Spotify apps appear without manual refresh.
- **Playback bar hint.** When no device is active, the playback bar shows "Connect a device" in place of track info. Tapping it opens the picker without a pending intent (just device selection).

## Architecture

### Backend changes

**`PUT /play` endpoint** — Remove the auto-recovery block (`playback.py:82-93`) that catches "No active device", fetches `devices[0]`, and transfers. If no device is active, return 409 with `detail: "no_device"` immediately.

### Frontend changes

#### Pending intent state

Generalize the existing `devicePickerModal` state in `App.jsx` to hold the play intent:

```
pendingPlayIntent: null | {
  type: 'album' | 'track',
  contextUri?: string,   // for album play
  trackUri?: string,     // for track play
  spotifyId?: string,    // for album play (to set playingId)
}
```

When the intent is non-null, the device picker modal is open.

#### Play flow (album and track)

Both `handlePlay` and `handlePlayTrack` follow the same logic:

1. Attempt the play action (call `PUT /play`)
2. If success → playback starts on the currently active device (existing behavior)
3. If 409 `no_device` → store the play intent in state, open the device picker modal
4. User selects a device → transfer playback to it → retry the stored intent → close picker
5. If 409 `restricted_device` on retry → show inline error in picker, keep it open

Note: the frontend does not try to pre-check whether a device is active. It optimistically attempts playback and reacts to the backend's response. This avoids a redundant round-trip and handles the case where a device was recently active but our local state doesn't reflect it.

#### Device picker simplification

Remove from `DevicePicker.jsx`:
- Settings panel (gear icon, "Device Settings" view)
- Default device display and selection
- Hidden/suppressed devices feature
- The `preferences` prop entirely

Add to `DevicePicker.jsx`:
- Auto-poll: `setInterval` calling `onFetchDevices` every ~3 seconds while mounted
- Inline error state for restricted devices: "This device restricts remote playback — try another"

#### Playback bar "no device" state

When `playback.device` is null and `playback.is_playing` is false, the playback bar (both desktop `PlaybackBar` and mobile `MiniPlaybackBar`) shows:
- Text: "Connect a device" in place of track name/artist
- Tapping/clicking this area opens the device picker (without a pending intent — purely for device selection/transfer)

#### Dismiss behavior

If the user closes the picker without selecting a device:
- The pending play intent is cleared (play action is cancelled)
- No toast or error message
- The playback bar remains in "Connect a device" state as a persistent hint

### Files removed

- `frontend/src/useDevicePreferences.js` — entire file
- `frontend/src/useDevicePreferences.test.js` — entire file

### Files modified

- `backend/routers/playback.py` — remove auto-recovery block in `PUT /play`
- `backend/tests/test_playback.py` — update tests for new behavior
- `frontend/src/App.jsx` — replace `devicePickerModal` + `useDevicePreferences` with pending intent pattern, unify album/track play paths
- `frontend/src/components/DevicePicker.jsx` — remove settings/preferences, add auto-poll
- `frontend/src/components/DevicePicker.test.jsx` — update tests
- `frontend/src/components/PlaybackBar.jsx` — add "Connect a device" state
- `frontend/src/components/PlaybackBar.test.jsx` — update tests
- `frontend/src/components/MiniPlaybackBar.jsx` — add "Connect a device" state
- `frontend/src/components/MiniPlaybackBar.test.jsx` — update tests

## Edge cases

- **Restricted device:** If the selected device returns 403 restricted, show an inline error in the picker ("This device restricts remote playback — try another") and keep the picker open so the user can pick a different device.
- **Device goes offline between selection and play:** Backend returns `no_device` again. Reopen the picker with the same pending intent.
- **Already playing on a device:** No picker needed. Play actions go directly to the active device (existing behavior).
- **Picker open, no devices found:** Show existing "No devices found. Open Spotify on any device." message. Auto-poll will surface new devices as they come online.

## Out of scope

- Spotify Web Playback SDK integration
- Auto-detecting which physical device the user is browsing from
- Any "smart" heuristics for device selection
