# Mobile Search UX Fix — Design Spec

**Issue:** [#28](https://github.com/toofanian/bummer/issues/28)
**Date:** 2026-04-16

## Problem

Mobile search UX has three concrete issues:
1. Header (with search input) scrolls away with content — not fixed/sticky
2. BulkAddBar (z-50) renders behind BottomTabBar (z-200) — z-index stacking bug
3. Search input has minimal focus feedback (border-color only)

## Scope

Three targeted fixes. No architectural changes.

### Out of scope
- Search state persistence across tab switches — intentionally clears on tab switch (existing behavior, confirmed desired)
- iOS keyboard handling — `h-dvh` + `viewport-fit=cover` + `overflow-y-auto` already handle this correctly on modern iOS Safari
- Desktop layout — unaffected, separate code path

## Fix 1: Sticky header

**File:** `frontend/src/App.jsx` (mobile layout, ~line 673)

**Current:** Header is a regular flow element inside `flex flex-col h-dvh`. Content area is `flex-1 overflow-hidden` with inner `overflow-y-auto`.

**Change:** Add `sticky top-0 z-[100]` and explicit `bg-surface` to the header element. Since the header is already outside the scroll container (content scrolls inside `overflow-y-auto` div), this should work with the existing flex layout. The `z-[100]` ensures header stays above scrolling content but below fixed bottom bars (z-190+).

**Risk:** Low. Header is already outside scroll container. Sticky just prevents it from collapsing out of the flex layout on scroll.

## Fix 2: BulkAddBar z-index

**File:** `frontend/src/components/BulkAddBar.jsx` (~line 12)

**Current:** `z-50` (Tailwind z-50 = 50). BottomTabBar is `z-[200]`. BulkAddBar renders behind BottomTabBar.

**Change:** BulkAddBar should sit above BottomTabBar. Change to `z-[210]`. Also adjust `bottom` offset so BulkAddBar sits above BottomTabBar rather than overlapping at `bottom-0`:
- Set `bottom` to `calc(50px + env(safe-area-inset-bottom, 0px))` (BottomTabBar height)

**Z-index ladder after fix:**
- z-[100]: Sticky header
- z-[190]: MiniPlaybackBar
- z-[200]: BottomTabBar
- z-[210]: BulkAddBar
- z-[300]: DigestPanel, FullScreenNowPlaying
- z-[400-401]: DevicePicker modal

## Fix 3: Search input focus states

**File:** `frontend/src/App.jsx` (~line 687) and/or `frontend/src/tailwind.css` (~line 99)

**Current:** Only `border-color: var(--color-focus-border)` on focus. Very subtle.

**Change:** Add visible focus ring and background shift:
- `focus:ring-2 focus:ring-accent/40 focus:bg-surface-2/80` on the search input element
- Or update the global `input:focus` rule in `tailwind.css` to include ring + background

Prefer input-specific classes over global rule change to avoid unintended side effects.

## Testing

- **Sticky header:** Scroll content on mobile viewport; header should remain visible at top
- **BulkAddBar:** Enter bulk-add mode; bar should appear above BottomTabBar, not behind it
- **Focus states:** Tap search input; should see visible ring/glow feedback
- Unit tests: existing Vitest tests should still pass (no behavioral changes)
