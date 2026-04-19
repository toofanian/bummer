# Home Page Tabs + Digest Rename — Design Spec

Issue: #80

## Summary

Redesign the home page from vertically stacked sections to a tabbed/columnar layout matching the existing digest (formerly changelog) page pattern. Also rename all "changelog" references to "digest" throughout the frontend.

## Home Page Layout

### Mobile (tabs)

4 tabs at the top of the home page, matching the digest page tab styling:

1. **Recently Played** (default)
2. **Recently Added**
3. **You Might Like**
4. **Rediscover**

One section visible at a time. Tab bar uses the same underline-active pattern as the digest page: `flex border-b border-border`, active tab gets `text-text border-b-2 border-accent`, inactive gets `text-text-dim hover:text-text`.

### Desktop (columns)

4 equal-width columns side-by-side (`grid grid-cols-4` or `flex` with `flex-1`), each independently scrollable, with `border-r border-border` between them. Each column has an uppercase label header matching the digest page style.

### Data

No changes to the `/home` endpoint. Single fetch on mount, same as today. Data split into the 4 sections as currently done in `HomePage.jsx` (`mergeRecentlyPlayed` for tab 1, `recently_added` for tab 2, `recommended` for tab 3, `rediscover` for tab 4).

### Album rendering within columns/tabs

Each section renders albums as a vertical list (not the horizontal scroll `AlbumRow`). Each album row shows: thumbnail (36px), album name, artist names — same layout as the digest page list items. Clicking an album calls `onPlay(service_id)`.

Empty state per section: italic "Nothing yet" text, same as current `AlwaysRow`.

### Overall empty state

If all 4 sections are empty, show the existing centered message: "Start playing albums to see your listening history here."

## Digest Rename

Rename all frontend references from "changelog" to "digest":

| Current | New |
|---------|-----|
| `ChangelogView.jsx` | `DigestView.jsx` |
| `ChangelogView.test.jsx` | `DigestView.test.jsx` |
| `ChangelogView` component name | `DigestView` |
| `ChangelogSection` internal component | `ChangesSection` (keeps meaning) |
| `view === 'changelog'` in App.jsx | `view === 'digest'` |
| BottomTabBar label "Changelog" | "Digest" |
| Nav header label "Changelog" | "Digest" |
| `activeTab === 'changelog'` inside DigestView | `activeTab === 'changes'` |

No backend changes — the `/digest/changelog` endpoint stays as-is.

## Files Changed

1. `frontend/src/components/HomePage.jsx` — rewrite to tabbed/columnar layout
2. `frontend/src/components/ChangelogView.jsx` → `frontend/src/components/DigestView.jsx` — rename file + component
3. `frontend/src/components/ChangelogView.test.jsx` → `frontend/src/components/DigestView.test.jsx` — rename file + update imports
4. `frontend/src/components/BottomTabBar.jsx` — "Changelog" → "Digest"
5. `frontend/src/components/BottomTabBar.test.jsx` — update label references
6. `frontend/src/App.jsx` — update imports, view state values, nav labels

## Testing

- HomePage tests: verify tab rendering on mobile, column rendering on desktop, tab switching, empty states, album click calls onPlay
- DigestView tests: update imports, verify existing tests still pass after rename
- BottomTabBar tests: update "Changelog" → "Digest" in assertions
- App.jsx: no dedicated test file, covered by component tests
