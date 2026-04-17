# Smart Device Selection Design

**Date:** 2026-03-16
**Status:** Approved

## Goal

Replace the text-based device display with a Spotify-faithful speaker icon indicator, add smart device selection (default device, suppress unwanted devices), extract a shared DevicePicker component, and fix the click-outside bug in the current device picker popover.

## Current State

- **PlaybackBar (desktop):** `▸ Device Name ▾` text — clickable, opens a popover with device list, transfer, checkmark on active. Has a click-outside bug: `mousedown` fires before `onClick` on device options, closing the popover before the transfer registers. Transfer-then-close also races.
- **FullScreenNowPlaying (mobile):** "Playing on Device Name ▾" text button with inline popover. No click-outside handler. Duplicates all picker logic.
- **MiniPlaybackBar (mobile):** No device indicator. No change planned.
- **handlePlay (App.jsx):** Plays on whatever device Spotify picks. `usePlayback.play()` returns `'no_device'` or `'restricted_device'` on 409; `handlePlay` displays the error message. No device preference logic.

## Design

### 1. Speaker Icon & Green Accent

**Desktop PlaybackBar (right zone):**
- Replace `▸ {device.name} ▾` with a 16x16 speaker SVG icon
- When active device type is NOT `Computer`: icon renders in green (`var(--accent)`) to signal remote playback
- When playing on local computer: icon renders in `var(--text-dim)`
- Click opens the DevicePicker popover
- No device name shown inline

**Mobile FullScreenNowPlaying:**
- Below playback controls, when device is present and `device.type !== 'Computer'`: green-tinted line `🔊 Listening on {device.name}` — tappable to open DevicePicker
- When `device.type === 'Computer'` or no device: no banner (Crate is a browser app, so "Computer" is treated as local regardless of actual machine)

**MiniPlaybackBar:** No change (too compact, matches Spotify).

### 2. Device Picker Popover

**Header:** "Connect to a device" with gear icon (⚙️) in top-right to access preferences sub-view.

**Device rows:**
- Device-type SVG icon (phone/laptop/speaker) on the left
- Device name in the middle
- Active device: green dot + name in green, not clickable
- Default device: subtle star icon next to name
- Non-active devices: small `×` hide button on the far right (tapping suppresses the device)
- Empty state: "No devices found. Open Spotify on any device."

**Bug fix:** Replace `mousedown` click-outside listener with a backdrop `<div>` overlay behind the popover. Clicks on the backdrop close the popover; clicks on popover options propagate normally. This eliminates the mousedown/onClick race condition. The backdrop approach applies to **all** DevicePicker instances (desktop popover and mobile popover alike) since it's built into the shared component.

**Shared component:** Extract into `DevicePicker.jsx` used by both PlaybackBar and FullScreenNowPlaying. The component receives `onClose`, `onFetchDevices`, `onTransferPlayback`, and device preferences as props. It manages its own internal state (devices list, loading, preferences sub-view toggle).

### 3. Device Preferences Sub-View

Accessed via gear icon in the picker header. Swaps popover content (same shell, different content).

**Contents:**
- Back arrow + "Device Settings" header
- **Default device section:** Current default (if set) with "Clear" button. Below, list of non-suppressed devices — tap to set as default. Active default has filled star icon.
- **Hidden devices section:** Lists suppressed devices with "Unhide" button each. Unhide removes from `suppressedDeviceIds`.

**Suppressing devices:** In the main picker view, each non-active device row has a `×` icon. Tapping adds to `suppressedDeviceIds` and removes from list.

### 4. Smart Device Selection Logic

**`useDevicePreferences` hook API:**
```js
const {
  defaultDeviceId,       // string | null
  suppressedDeviceIds,   // string[]
  knownDevices,          // { id, name, type }[]
  setDefault,            // (deviceId: string) => void
  clearDefault,          // () => void
  toggleSuppressed,      // (deviceId: string) => void
  isSuppressed,          // (deviceId: string) => boolean
  updateKnownDevices,    // (devices: {id,name,type}[]) => void
  resolveDevice,         // (fetchDevices) => Promise<{ deviceId: string | null, showPicker: boolean }>
} = useDevicePreferences()
```

**`resolveDevice(fetchDevices)` logic:**
1. If no `defaultDeviceId`: return `{ deviceId: null, showPicker: false }` (current behavior — Spotify picks)
2. Call `fetchDevices()` to get live device list
3. If default is in the live list and not suppressed: return `{ deviceId: defaultDeviceId, showPicker: false }`
4. Otherwise: return `{ deviceId: null, showPicker: true }` (caller should show picker)

**On play (`handlePlay` in App.jsx):**
1. Call `resolveDevice(fetchDevices)`
2. If `deviceId` returned: `transferPlayback(deviceId)` then `play(contextUri)`
3. If `showPicker` is true: set state to show a **modal DevicePicker** (centered overlay, same DevicePicker component but rendered as a modal instead of a popover). User picks a device → transfer → play. Cancel dismisses without playing.
4. If neither (no default set): current behavior

**Blocking picker modal:** A centered modal overlay (same DevicePicker content, wrapped in a modal shell with backdrop). Renders in App.jsx via a `devicePickerModal` state flag. On device selection, the modal closes, transfer fires, then play fires. On cancel/backdrop-click, modal closes and playback is abandoned. This works identically on desktop and mobile.

**Suppressed devices:**
- Filtered out of picker list before rendering
- Detection: `resolveDevice` checks the live device list. If the only available devices are all suppressed, it returns `showPicker: true`. The picker modal in this case shows an empty state with "All available devices are hidden" and a link to the gear to unhide.

**Edge case — default device is also suppressed:** Setting a device as default auto-unsuppresses it. Suppressing the current default auto-clears the default. These are enforced in the hook.

**Edge case — stale device IDs:** Spotify device IDs are ephemeral and change on reconnect. When `resolveDevice` finds that `defaultDeviceId` is not in the live list, it falls back to matching by `name + type` from `knownDevices`. If a match is found, it updates the stored ID silently. If no match, it prompts the picker.

### 5. Persistence

`localStorage` key `crate_device_prefs`:
```json
{
  "defaultDeviceId": "abc123",
  "suppressedDeviceIds": ["def456"],
  "knownDevices": [
    { "id": "abc123", "name": "Alex's iPhone", "type": "Smartphone" },
    { "id": "def456", "name": "Stale Chromecast", "type": "CastAudio" }
  ]
}
```

`knownDevices` updated every time the picker fetches the device list. Allows preferences view to show names for suppressed devices even when offline.

### 6. Device Type Icons

Mapped from Spotify's `type` field:
- `Computer` → laptop SVG
- `Smartphone` → phone SVG
- `Speaker` / `CastAudio` / `CastVideo` → speaker SVG
- Fallback → generic speaker SVG
- PlaybackBar indicator: distinct `SpeakerIcon` (speaker with broadcast waves)

### 7. Component Architecture

**New files:**
- `frontend/src/components/DevicePicker.jsx` — shared picker (popover content, preferences sub-view, device type icons)
- `frontend/src/components/DevicePicker.test.jsx`
- `frontend/src/useDevicePreferences.js` — hook for localStorage `crate_device_prefs`
- `frontend/src/useDevicePreferences.test.js`

**Modified files:**
- `PlaybackBar.jsx` — remove inline picker logic, add speaker icon + DevicePicker
- `FullScreenNowPlaying.jsx` — remove inline picker logic, add "Listening on" banner + DevicePicker
- `App.jsx` — wire useDevicePreferences, modify handlePlay for device resolution
- No backend changes

### 8. Error Handling

| Scenario | Behavior |
|---|---|
| Default device unavailable on play | Show picker as blocking prompt |
| Transfer fails | Brief error in PlaybackBar message slot, popover closes |
| All devices suppressed | Picker shows empty state with link to gear to unhide |
| fetchDevices fails | "Couldn't load devices. Try again." with retry |
| Suppressed device is only one available | Prompt with note that hidden devices exist |

### 9. Testing Strategy

- **useDevicePreferences:** localStorage read/write, set/clear default, suppress/unsuppress, knownDevices merge, resolveDevice (default available, default unavailable, stale ID name-match fallback, default+suppressed conflict)
- **DevicePicker:** renders device list, green dot on active, hides suppressed, gear opens preferences, unhide works, set default works, hide button on rows, backdrop click closes, Escape closes, focus management, ARIA roles preserved (`role="listbox"`, `role="option"`)
- **PlaybackBar:** speaker icon renders, green when `device.type !== 'Computer'`, dim when `Computer`, click opens DevicePicker
- **FullScreenNowPlaying:** "Listening on" banner for `device.type !== 'Computer'`, no banner for Computer, tap opens picker
- **App.jsx handlePlay:** resolveDevice integration — transfer to default then play, show modal when default unavailable, modal cancel abandons playback, all-suppressed shows empty state with unhide link
