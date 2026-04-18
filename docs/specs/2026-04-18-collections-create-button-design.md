# Move "Create Collection" to Nav Bar

## Problem
The create collection input takes up permanent space at the top of CollectionsPane. It should be a compact button in the nav bar (like LibraryViewToggle for Albums/Artists), expanding inline to a text input on click.

## Design

### Behavior
- When `view === 'collections'`, a "+" button appears in the nav bar next to the Collections tab
- Clicking "+" transforms it into a text input inline in the nav bar
- Enter: creates collection, reverts to "+" button
- Escape or blur: reverts to "+" button without creating
- Empty input on Enter: reverts without creating (same as current behavior)

### State (App.jsx)
- `showCollectionCreate` (boolean) — controls button vs input display
- `collectionCreateName` (string) — input value
- Both reset after create or cancel

### Component changes
1. **CollectionsPane.jsx**: Remove the create input bar (sticky header with input + Create button). Remove `newName` state, `handleCreate` function. Keep `onCreate` prop in the interface — just won't be called from within the pane.
2. **App.jsx**: Add inline create UI in the nav bar, both desktop (header nav) and mobile (header area). Wire to existing `handleCreateCollection`.

### Visual treatment
- "+" button: same pill styling as LibraryViewToggle buttons (`bg-surface-2 rounded-full`)
- Input: replaces the button, same approximate width, auto-focused, rounded pill style to match
