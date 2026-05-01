# Lazy Rendering App-Wide [134]

## Goal

Apply lazy rendering (IntersectionObserver + sentinel) to all scroll-heavy lists, following the pattern from #133. Extract a reusable hook to keep it DRY.

## Hook: `useLazyRender`

**File:** `frontend/src/hooks/useLazyRender.js`

```js
function useLazyRender(items, batchSize = 30)
// Returns: { visible, hasMore, sentinelRef }
```

- `visible`: `items.slice(0, visibleCount)`
- `hasMore`: `visibleCount < items.length`
- `sentinelRef`: ref to attach to sentinel element
- Resets `visibleCount` to `batchSize` when `items` identity changes
- IntersectionObserver on sentinel increments `visibleCount` by `batchSize`

## Targets

### 1. AlbumTable (mobile cards)

- Wrap `sorted.map(renderMobileCard)` with `useLazyRender(sorted)`
- Add sentinel `<div>` after last card
- Skip when `reorderable` is true (collections are small, DnD needs all items)

### 2. AlbumTable (desktop rows)

- Apply `useLazyRender(sorted)` to `sorted.map(renderDesktopRow)` in `<tbody>`
- Sentinel is a `<tr><td colSpan={...} ref={sentinelRef}></td></tr>`
- Skip when `reorderable` is true

### 3. ArtistsView (artist list)

- Apply to `filteredGroups` in the artist list view (not the detail view — detail uses AlbumTable which gets its own lazy rendering)

### 4. DigestView — ChangesSection

- Flatten `days[].events[]` into a single array for lazy rendering, then re-group by day header when rendering
- Alternative: apply per-day, but days can have many events — flat is simpler and more effective

### 5. DigestView — HistorySection

- Same flat approach as ChangesSection for `days[].plays[]`
- Works alongside existing server-side pagination (`Load more` button)

### 6. HomePage — Refactor

- Replace inline IntersectionObserver logic in `AlbumList` with `useLazyRender` hook
- No behavior change, just DRY

## What gets skipped

- **CollectionsPane**: typically tens of items
- **SearchOverlay**: results are already filtered
- **DigestView StatsSection**: small fixed lists (top 10)

## Testing

Each target gets a test verifying:
1. Initial render shows only first batch
2. Sentinel element exists when more items remain
3. Items identity change resets visible count

Hook itself gets unit tests for the core logic.

## Batch size

Default 30 for all targets. Same as HomePage's current `BATCH_SIZE`.
