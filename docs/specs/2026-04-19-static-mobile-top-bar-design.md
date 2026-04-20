# Static Mobile Top Bar — Design Spec

**Issue:** #94  
**Date:** 2026-04-19

## Problem

Mobile top bar content shifts on every bottom-tab switch — title changes, controls appear/disappear, causing layout instability. The bottom tab bar already communicates which view is active, making the dynamic title redundant.

## Design

### Static mobile header

The header renders the same content on every view:

| Position | Element | Behavior |
|----------|---------|----------|
| Left | "Bummer" branding text | Always visible, static |
| Right | Search icon | Always rendered; `visibility: hidden` on views without search (home, digest, settings) to reserve space |
| Right | Settings gear icon | Always visible, navigates to settings view |

Remove from header: dynamic h1 title, `LibraryViewToggle`, create collection button/input.

### Relocated controls

**Library view toggle (Albums/Artists):**
- Move into library content area as an inline tab bar
- Style to match HomePage tab pattern: full-width, `border-b border-border`, uppercase labels, `border-b-2 border-accent` for active state
- Replaces current pill-style `LibraryViewToggle` on mobile (desktop keeps existing behavior)

**Create collection button:**
- Move into CollectionsPane content area (inline, top of list)
- Existing `+` icon button, repositioned

### Tab styling unification

HomePage, DigestView, and the new library inline tabs should share consistent styling:
- Uppercase labels, `text-xs font-bold tracking-wider`
- Active: `text-text border-b-2 border-accent`
- Inactive: `text-text-dim hover:text-text`
- Full-width distribution (`flex-1`)

### Scope boundaries

- Desktop header: unchanged
- Bottom tab bar: unchanged
- Search overlay behavior: unchanged (just trigger visibility changes)
- View content areas: unchanged except receiving relocated controls

## Files to change

1. `frontend/src/App.jsx` — mobile header JSX (lines 777-850), add library toggle below header in library view
2. `frontend/src/components/LibraryViewToggle.jsx` — add mobile variant with tab-bar styling, or accept a `variant` prop
3. `frontend/src/components/CollectionsPane.jsx` — add inline create button
4. Tests for all changed components
