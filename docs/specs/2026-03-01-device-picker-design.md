# Device Picker Design

**Date:** 2026-03-01
**Status:** Approved

## Goal

Add a device picker to the PlaybackBar so the user can transfer Spotify playback between active devices (phone, Mac, etc.) without leaving the app. The browser tab itself does not become a Spotify device — audio always comes from an existing Spotify client.

## Approach

Option A: Click-to-open device picker popover. The current device name in the PlaybackBar right zone becomes clickable. On click, the app fetches the live device list from Spotify and shows a popover. Clicking a device transfers playback to it.

Rejected alternatives:
- Continuous device polling (overkill — on-demand fetch on popover open is sufficient)
- Spotify Web Playback SDK (too complex; doesn't match the stated goal)

## Backend

Two new endpoints in `backend/routers/playback.py`:

**GET /playback/devices**
- Calls `sp.devices()`
- Returns: `[{ "id": "...", "name": "Alex's iPhone", "type": "Smartphone", "is_active": true }, ...]`

**PUT /playback/transfer**
- Body: `{ "device_id": "..." }`
- Calls `sp.transfer_playback(device_id, force_play=True)`
- Returns 204 on success

`force_play=True` ensures playback continues/starts on the new device immediately.

## Frontend — usePlayback hook

Two new functions:

- `fetchDevices()` — calls `GET /playback/devices`, returns device array. Called on-demand (not polled).
- `transferPlayback(deviceId)` — calls `PUT /playback/transfer`, then triggers a single `fetchState()` so the device name in the bar updates immediately.

Device list is local state inside the picker component — not stored in the hook.

## Frontend — PlaybackBar UI

The device name in the right zone becomes a `<button>` styled as text with a `▾` caret to signal interactivity.

**On click:**
1. Fetches devices (inline `...` loading state)
2. Popover appears above the device name listing all devices
3. Each row: type glyph + device name
4. Active device: `✓` checkmark, muted styling, not re-clickable
5. Click inactive device → `transferPlayback(id)` → popover closes → device name updates

**Dismiss:** click-outside or Escape key.

Popover logic lives in `PlaybackBar.jsx` as local state (`devicesOpen`, `devices`, `devicesLoading`). No new component file.

## Error Handling

| Scenario | Behavior |
|---|---|
| No other devices found | Popover shows "No other devices found" |
| Transfer fails (device offline) | PlaybackBar message slot shows brief error; popover closes |
| Stale device list | Accepted — matches Spotify's own behavior |
| Non-Premium user (403) | Surfaced via existing "restricted device" error pattern |

## Testing

**Backend (pytest):**
- `GET /playback/devices` returns list of devices
- `PUT /playback/transfer` calls `sp.transfer_playback` with correct `device_id` and `force_play=True`
- Bad device ID returns appropriate error

**Frontend (Vitest/RTL):**
- `usePlayback` exposes `fetchDevices` and `transferPlayback`
- Device list renders in popover
- Active device shows checkmark
- Clicking inactive device calls `transferPlayback`
- Click-outside closes popover
- Escape key closes popover
