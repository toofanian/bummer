# Artists Grouping View — Design Spec

**Date**: 2026-03-14
**Status**: Approved

## Overview

Add an "Artists" sub-view within the Library tab that groups saved albums by artist. Primary use case is lookup-oriented: "I want to see what I have by a specific artist."

## Navigation Changes

### Desktop

- Rename the "Albums" tab button to **"Library"** in the `<nav>` (no count on this tab — count moves to the pill toggle)
- Remove the existing `<h1>Library</h1>` page title (now redundant since "Library" is the tab name)
- When Library is the active view, show the `LibraryViewToggle` pill inside the `<nav>`, immediately after the Library tab button
- Clicking the Library tab keeps whichever sub-view (Albums/Artists) was last active

### Mobile

- BottomTabBar already says "Library" — no change needed there
- Add the `LibraryViewToggle` pill in the mobile header bar, between the title and the search input, when Library tab is active

### Pill Toggle Component (`LibraryViewToggle`)

- Two options: "Albums" and "Artists"
- Albums label includes album count via `albumCount` prop (number): renders as `Albums (342)`
- Styled as a small pill with `role="tablist"`, active state uses `bg-surface` against `bg-surface-2` background
- Props: `activeView: 'albums' | 'artists'`, `onViewChange: (view) => void`, `albumCount: number`

## Artist List View

Shown when the "Artists" pill is active.

### Data

- Derived client-side from the existing `albums` array — no new API calls
- Group albums by artist name; albums with multiple artists appear under each artist
- Sorted alphabetically by artist name

### Each Artist Row

- **Composite thumbnail**: grid of up to 4 album covers (same pattern as Collections cards). Fallback: artist initial on `bg-surface-2`
- **Artist name**
- **Album count**: e.g., "3 albums"
- **Chevron** `›`

Desktop rows should NOT show additional inline album cover thumbnails — only the composite thumbnail on the left.

### Search

`ArtistsView` receives the full unfiltered `albums` array and the `search` string as props. Filtering happens inside ArtistsView: group all albums by artist first, then filter artist groups where either the artist name matches or any of their album names match. This preserves all of an artist's albums when the artist name matches (unlike filtering albums first then grouping).

### Responsive Layout

- **Desktop**: rows with hover highlight (`hover:bg-hover`), same density as album rows
- **Mobile**: card-style rows with 44px thumbnails, full tap targets

## Artist Detail Page

Shown when an artist row is clicked.

### Layout

- **Header**: Back button `← Back`, artist name, album count
- **Body**: Standard `AlbumTable` filtered to that artist's albums
  - Full sort, expand tracks, play, collections bubble — all existing interactions
  - No additional chrome (no bio, no artist image)

### Responsive

Same on desktop and mobile — AlbumTable already handles both layouts.

## State Management

- New `libraryView` state in `App.jsx`: `'albums' | 'artists'` (default: `'albums'`)
- Persists when navigating away from Library and back (e.g., switch to Collections, come back — still on Artists if that's where you were)
- `selectedArtist` is local state inside `ArtistsView` — navigating away from Library unmounts ArtistsView (conditional rendering, not show/hide), which resets to the artist list

## Files to Modify

- **Modify**: `frontend/src/components/ArtistsView.jsx` — update existing component: remove desktop inline thumbnails, add `search` prop (string) and filter artist groups internally, drop `loading` prop (not needed — data is always derived from albums). Full updated props: `{ albums, search, onFetchTracks, onPlay, onPlayTrack, playingId, playingTrackName, collections, albumCollectionMap, onToggleCollection, onCreateCollection }`
- **Modify**: `frontend/src/components/LibraryViewToggle.jsx` — add `albumCount` prop, render count in Albums label
- **Modify**: `frontend/src/App.jsx` — add `libraryView` state, rename desktop "Albums" tab to "Library", remove `<h1>Library</h1>`, render `LibraryViewToggle` in nav and mobile header, conditionally render `ArtistsView` or `AlbumTable` based on `libraryView` when `view === 'library'` (both mobile and desktop layouts). Pass unfiltered `albums` and `search` to ArtistsView. Note: `handleFocusAlbum` only works in Albums sub-view — this is acceptable for now.
- **No changes**: `frontend/src/components/BottomTabBar.jsx` (already says Library)

## Out of Scope

- Artist images/bios from Spotify API
- Artist-level playback (play all albums by an artist)
- Persisting `libraryView` preference to localStorage
- New backend endpoints
