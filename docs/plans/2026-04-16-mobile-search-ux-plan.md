# Mobile Search UX Fix — Implementation Plan

**Spec:** `docs/specs/2026-04-16-mobile-search-ux-design.md`
**Issue:** [#28](https://github.com/toofanian/bummer/issues/28)

## Steps

### Step 1: Sticky header
1. Open `frontend/src/App.jsx`, find the mobile `<header>` element (~line 673)
2. Add `sticky top-0 z-[100] bg-surface` to its className
3. Verify existing tests pass: `cd frontend && npm test`

### Step 2: BulkAddBar z-index fix
1. Open `frontend/src/components/BulkAddBar.jsx` (~line 12)
2. Change `z-50` to `z-[210]`
3. Change `bottom-0` positioning to `bottom-[calc(50px+env(safe-area-inset-bottom,0px))]` — or use inline style: `style={{ bottom: 'calc(50px + env(safe-area-inset-bottom, 0px))' }}`
4. Remove redundant `paddingBottom` safe-area since BulkAddBar now sits above BottomTabBar
5. Verify existing tests pass

### Step 3: Search input focus states
1. Open `frontend/src/App.jsx`, find search `<input>` (~line 687)
2. Add focus classes: `focus:ring-2 focus:ring-accent/40 focus:outline-none`
3. Verify existing tests pass

### Step 4: Final verification
1. Run full test suite: `cd frontend && npm test`
2. Commit all changes
