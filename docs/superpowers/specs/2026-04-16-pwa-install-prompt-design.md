# PWA Install Prompt & Settings Page — Design Spec

**Issue:** #17 — PWA install prompt
**Branch:** `17-pwa-install-prompt`
**Date:** 2026-04-16

## Goal

Add a Settings page with PWA install instructions so users know how to install Bummer as an app. Also modernize the settings menu from a dropdown to a full page view, and point feedback to GitHub Discussions.

## Scope

No service worker. No `beforeinstallprompt` interception. Chrome already shows the install icon in the address bar with the existing manifest + icons setup. This is purely a **reminder/help UI** with browser-specific instructions.

## Changes

### 1. Settings page replaces dropdown menu

- Gear icon in header calls `setView('settings')` instead of toggling a dropdown
- New `SettingsPage` component renders when `view === 'settings'`
- Back arrow at top returns to previous view (track `prevView` or default to `'home'`)

### 2. Settings page sections

**Install App**
- Detect platform (iOS Safari, Chrome/Edge desktop, Android Chrome) via user agent
- Show relevant install instructions for detected platform:
  - **Chrome/Edge desktop:** "Click the install icon in your browser's address bar"
  - **iOS Safari:** "Tap Share > Add to Home Screen"
  - **Android Chrome:** "Tap the three-dot menu > Add to Home Screen" (or install banner)
- Simple text + brief visual hint, no interactive install flow

**Send Feedback**
- External link to `https://github.com/toofanian/bummer/discussions`
- Replaces current `mailto:` link

**Log Out**
- Same behavior as current dropdown item

**Delete Account**
- Same confirmation modal as current (type DELETE to confirm)

### 3. Files touched

| File | Change |
|------|--------|
| `App.jsx` | Add `'settings'` to view handling, pass `setView` to SettingsMenu/header |
| `SettingsMenu.jsx` | Refactor from dropdown to full-page `SettingsPage` component (rename file) |
| `SettingsMenu.test.jsx` | Update tests for new page-based behavior |

## Non-goals

- Service worker registration
- `beforeinstallprompt` event handling
- Custom install button that triggers native install prompt
- Offline support
