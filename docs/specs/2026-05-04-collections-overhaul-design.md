# Collections Overhaul — Design Spec

**Date:** 2026-05-04
**Issue:** [#125](https://github.com/toofanian/bummer/issues/125)
**Status:** Approved

## Goal

Rebuild the collections experience around hierarchical tags, denser layouts, and a sidebar-driven browsing model. Replace the flat collection list with a tag tree + collection grid/list, while preserving the existing "serving platter" workflow for adding albums.

## Non-Goals

- No auto-generation, recommendations, or AI-driven organization. All organization is user-driven.
- No changes to library sync, playback, or non-collection UI.
- No removal of the existing bulk-add flow from Library / Collection detail (Flow B).

## User Decisions Locked In

| Decision | Choice |
|---|---|
| Hierarchy model | Tags (data) browsed as folders (UX) |
| Tags per collection | Many |
| Tag nesting | Hierarchical (parent → child, arbitrary depth) |
| Browsing nav | Sidebar tag tree + main pane (mobile: drill-down) |
| View modes | List **and** grid, user-toggled |
| Grid card | Album art mosaic + collection name only |
| Pinned cover art | Overrides mosaic when set (existing behavior) |
| Tag CRUD | Inline tag-add on collection editor + dedicated tag manager page |
| Component foundation | shadcn/ui (replaces hand-built primitives where it fits) |
| Add-to-collection from Collections pane (Flow A) | Preserved — Recently Added / Recently Played rows stay at bottom of main pane |
| Add-to-collection from Library / Detail (Flow B) | Unchanged |

## Data Model

### New tables

```sql
-- Tags form a forest per user. parent_tag_id = NULL for root tags.
create table tags (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    parent_tag_id uuid references tags(id) on delete cascade,
    position integer not null default 0,
    created_at timestamptz not null default now(),
    unique (user_id, parent_tag_id, name)  -- sibling names unique per parent
);

create index idx_tags_user_parent on tags(user_id, parent_tag_id, position);

-- Many-to-many: collection ↔ tag
create table collection_tags (
    collection_id uuid not null references collections(id) on delete cascade,
    tag_id uuid not null references tags(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (collection_id, tag_id)
);

create index idx_collection_tags_tag on collection_tags(tag_id);
```

RLS: user can only see/modify their own tags and their own `collection_tags` (enforced via `collections.user_id` and `tags.user_id`).

### Existing `collections` table

Unchanged. Keep `position`, `description`, `cover_album_id`.

## Backend Endpoints

All under `backend/routers/metadata.py` (or new `tags.py` if file grows too large — judgment call during implementation).

| Method | Path | Purpose |
|---|---|---|
| GET | `/tags` | List all user's tags as flat array (frontend builds tree) |
| POST | `/tags` | Create tag `{ name, parent_tag_id? }` — assigns next position among siblings |
| PATCH | `/tags/{id}` | Rename tag `{ name }` |
| PUT | `/tags/{id}/move` | Reparent tag `{ parent_tag_id, position }` |
| DELETE | `/tags/{id}` | Delete tag (cascades to descendants and `collection_tags`) |
| PUT | `/tags/reorder` | Bulk reorder siblings under a parent `{ parent_tag_id, tag_ids: [...] }` |
| GET | `/collections/{id}/tags` | List tags on a collection |
| PUT | `/collections/{id}/tags` | Replace full tag set on a collection `{ tag_ids: [...] }` |
| GET | `/tags/{id}/collections` | List collections that have this tag (direct membership only — frontend handles hierarchy expansion) |

Existing `/collections` endpoints unchanged.

## Frontend Architecture

### New layout (Collections view)

**Desktop:**

```
┌────────────────────────────────────────────────────────────┐
│  Top nav (existing)                                         │
├──────────────┬─────────────────────────────────────────────┤
│              │  [List/Grid toggle]    [+ New Collection]    │
│  Tag Tree    │                                              │
│  (sidebar)   │  Collection grid or list                     │
│              │  (filtered by selected tag)                  │
│  • All       │                                              │
│  ▾ Genre     │                                              │
│    • Jazz    │                                              │
│    • Rock    │                                              │
│  • Mood      │                                              │
│  • Favorites │  ─────────────────────────────────────────   │
│              │  Recently Added                              │
│  [+ Tag]     │  [album art row — serving platter]           │
│  [Manage]    │  Recently Played                             │
│              │  [album art row — serving platter]           │
└──────────────┴─────────────────────────────────────────────┘
```

**Mobile:**

- Top level = tag drill-down page (list of root tags + "All collections")
- Tap tag → page showing child tags + collections in that tag
- Tap collection → existing collection detail
- Serving platter rows on the "All collections" page bottom (unchanged)
- Bottom tab bar unchanged

### New components

| Component | Purpose | Notes |
|---|---|---|
| `TagTreeSidebar` | Desktop sidebar tag tree | shadcn `Collapsible` primitives, drag-reorder via dnd-kit |
| `TagDrillPage` | Mobile drill-down view | Renders one tag's children + collections |
| `CollectionGrid` | Grid of collection cards | Mosaic art + name |
| `CollectionList` | Compact list of collections | Replaces current row layout, denser |
| `CollectionCard` | Single grid card | 2x2 album mosaic, fallback to single pinned cover |
| `ViewToggle` | List/grid switch | shadcn `ToggleGroup` |
| `TagManagerPage` | Dedicated CRUD page | Tree editor: add/rename/delete/move/reparent |
| `TagPickerInput` | Inline tag chip input on collection editor | Autocomplete existing + create new on Enter |

### Components reused unchanged

- `AlbumPromptBar` (serving platter floating action bar)
- `CollectionPicker` (modal — used by BulkAddBar)
- `BulkAddBar`
- `CollectionDetailHeader` (gains a `TagPickerInput`)
- `AlbumArtStrip`

### Components removed / replaced

- Existing `CollectionsPane` row rendering — replaced by `CollectionGrid` / `CollectionList`. Hooks and prop wiring preserved where possible. The component itself can stay as a thin orchestrator.

### State management

App.jsx today carries 40+ useState calls and scattered `albumCollectionMap` updates. Scope the cleanup tightly to what this overhaul touches:

- Add `tags[]` and `selectedTagId` to App.jsx state.
- Centralize collection-membership mutations into a small reducer or hook (`useCollectionMembership`) — eliminates the 5+ scattered `setAlbumCollectionMap` patterns. **In scope** because this code is directly affected by the overhaul.
- Don't touch unrelated App.jsx state (playback, sync, auth) — out of scope.

### Filtering by tag (frontend)

When a tag is selected:
- Show all collections that have **the selected tag OR any of its descendants**.
- Tree expansion / descendant lookup is computed client-side from the flat `tags[]` array.

"All" (root) = no filter, show every collection.

## shadcn Adoption

Install only what we need:

- `Collapsible` — tag tree nodes
- `ToggleGroup` — list/grid view toggle
- `Card` — collection grid cards
- `Command` — tag autocomplete in `TagPickerInput`
- `Badge` — tag chips on collection editor
- `Tabs` — possibly for tag manager page sections (TBD by implementer)
- Keep existing dnd-kit for drag/reorder

Theme tokens stay aligned to current Tailwind config (text-dim, etc.). No global redesign — components adopt existing palette.

## Migration & Rollout

- One Supabase migration: creates `tags` and `collection_tags` tables + indexes + RLS.
- No data backfill needed — users start with zero tags. Existing collections show under "All" until tagged.
- Apply migration to prod **before** merging the PR (preview shares prod DB).
- No feature flag — ship the new UI directly. The data model is additive; nothing breaks if frontend isn't shipped yet.

## Testing

- **Backend:** pytest for each new endpoint — happy path + auth isolation + cascade-delete of tags.
- **Frontend:**
  - `TagTreeSidebar` — render, expand/collapse, select, reorder
  - `TagPickerInput` — autocomplete, create-on-Enter, chip add/remove
  - `CollectionGrid` / `CollectionCard` — mosaic rendering, pinned cover override, click to open
  - `CollectionList` — denser layout renders, all existing behaviors (rename/delete/reorder) still work
  - `TagManagerPage` — CRUD flows, hierarchy moves, cascade-delete confirmation
  - Filter behavior — selecting a tag shows correct collections (including descendants)
- TDD throughout per project convention.

## Open Questions for Implementation

1. **Drag a collection onto a tag in the sidebar to assign it?** Nice-to-have, not required for v1. Defer.
2. **Tag color/icon?** Out of scope for v1. Can add later as `tags.color` / `tags.icon` columns.
3. **Show tag chips on collection cards?** No (user picked card text = name only). Tags visible only in collection detail / tag manager.
4. **Rename "Collections" view?** No. Keep label.

## Out of Scope

- iOS-style tiled grid with auto-mosaics (issue #98) — partly addressed by `CollectionCard` mosaic but full visual polish deferred.
- Inline collection picker on row tap (issue #88) — defer; existing modal picker stays.
- Folder hierarchy as a separate concept (issue #92) — superseded by tag tree.
- Bulk add bar persistence across pages (issue #122) — separate bug, separate PR.
- App.jsx cleanup beyond the collection-membership reducer.
