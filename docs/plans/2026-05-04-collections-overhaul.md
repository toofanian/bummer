# Collections Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace flat collections list with hierarchical-tag browsing, denser layouts (list + grid), shadcn primitives, and a centralized membership reducer — preserving the serving-platter add flow.

**Architecture:** New `tags` and `collection_tags` Postgres tables (forest of tags, many-to-many to collections). New backend endpoints under `/tags` and `/collections/{id}/tags`. Frontend gets a `TagTreeSidebar` (desktop) / `TagDrillPage` (mobile), `CollectionGrid` and `CollectionList` views with a toggle, `TagPickerInput` for inline tag-add, and a `TagManagerPage`. shadcn/ui adopted for tree, toggle, card, command, and badge primitives. App.jsx scattered `albumCollectionMap` mutations consolidated into `useCollectionMembership`.

**Tech Stack:** FastAPI, Supabase Postgres, React + Vite, Tailwind, shadcn/ui, dnd-kit, Vitest, pytest

**Spec:** `docs/specs/2026-05-04-collections-overhaul-design.md`

---

## Phase 1 — Backend (tags data model + endpoints)

### Task 1: Create `tags` and `collection_tags` migration

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_create_tags.sql`

- [ ] **Step 1: Generate migration file**

```bash
supabase migration new create_tags
```

- [ ] **Step 2: Write the migration SQL**

```sql
CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    parent_tag_id uuid REFERENCES public.tags(id) ON DELETE CASCADE,
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE NULLS NOT DISTINCT (user_id, parent_tag_id, name)
);

CREATE INDEX idx_tags_user_parent ON public.tags(user_id, parent_tag_id, position);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own tags" ON public.tags
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own tags" ON public.tags
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own tags" ON public.tags
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own tags" ON public.tags
    FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE public.collection_tags (
    collection_id uuid NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
    tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (collection_id, tag_id)
);

CREATE INDEX idx_collection_tags_tag ON public.collection_tags(tag_id);

ALTER TABLE public.collection_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own collection_tags" ON public.collection_tags
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.collections c WHERE c.id = collection_id AND c.user_id = auth.uid())
    );
CREATE POLICY "Users insert own collection_tags" ON public.collection_tags
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.collections c WHERE c.id = collection_id AND c.user_id = auth.uid())
        AND EXISTS (SELECT 1 FROM public.tags t WHERE t.id = tag_id AND t.user_id = auth.uid())
    );
CREATE POLICY "Users delete own collection_tags" ON public.collection_tags
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.collections c WHERE c.id = collection_id AND c.user_id = auth.uid())
    );
```

- [ ] **Step 3: Apply migration to prod via Supabase MCP `apply_migration`**

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: create tags + collection_tags tables [125]"
```

---

### Task 2: Add tag CRUD endpoints (`/tags` GET, POST, PATCH, DELETE, PUT /move, PUT /reorder)

**Files:**
- Create: `backend/routers/tags.py`
- Modify: `backend/main.py` (register router)
- Test: `backend/tests/test_tags.py`

- [ ] **Step 1: Write failing tests for full CRUD**

Add `backend/tests/test_tags.py` with tests:
- `test_list_tags_empty_returns_empty_array`
- `test_create_root_tag_assigns_position_zero`
- `test_create_sibling_tag_assigns_next_position`
- `test_create_child_tag_with_parent_id`
- `test_create_duplicate_sibling_name_returns_409`
- `test_rename_tag`
- `test_delete_tag_cascades_to_children`
- `test_move_tag_changes_parent_and_position`
- `test_reorder_siblings`
- `test_user_cannot_see_other_users_tags`

Use the existing test fixtures (`authed_client`, `other_user_client`) from `backend/tests/conftest.py`.

- [ ] **Step 2: Run tests, verify all FAIL**

```bash
backend/.venv/bin/python -m pytest backend/tests/test_tags.py -v
```

- [ ] **Step 3: Implement `backend/routers/tags.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID

from backend.deps import get_user_supabase, get_user_id

router = APIRouter(prefix="/tags", tags=["tags"])


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    parent_tag_id: Optional[UUID] = None


class TagRename(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class TagMove(BaseModel):
    parent_tag_id: Optional[UUID] = None
    position: int = Field(ge=0)


class TagReorder(BaseModel):
    parent_tag_id: Optional[UUID] = None
    tag_ids: list[UUID]


@router.get("")
def list_tags(supabase=Depends(get_user_supabase), user_id=Depends(get_user_id)):
    res = (
        supabase.table("tags")
        .select("id, name, parent_tag_id, position, created_at")
        .eq("user_id", user_id)
        .order("position")
        .execute()
    )
    return res.data


@router.post("", status_code=201)
def create_tag(body: TagCreate, supabase=Depends(get_user_supabase), user_id=Depends(get_user_id)):
    # Compute next position among siblings
    siblings = (
        supabase.table("tags")
        .select("position")
        .eq("user_id", user_id)
        .eq("parent_tag_id" if body.parent_tag_id else "parent_tag_id", str(body.parent_tag_id) if body.parent_tag_id else None)
    )
    if body.parent_tag_id is None:
        siblings = siblings.is_("parent_tag_id", "null")
    else:
        siblings = siblings.eq("parent_tag_id", str(body.parent_tag_id))
    sibling_rows = siblings.execute().data
    next_pos = max((s["position"] for s in sibling_rows), default=-1) + 1

    payload = {
        "user_id": user_id,
        "name": body.name,
        "parent_tag_id": str(body.parent_tag_id) if body.parent_tag_id else None,
        "position": next_pos,
    }
    try:
        res = supabase.table("tags").insert(payload).execute()
    except Exception as e:
        if "duplicate" in str(e).lower() or "unique" in str(e).lower():
            raise HTTPException(status.HTTP_409_CONFLICT, "Tag with that name already exists at this level")
        raise
    return res.data[0]


@router.patch("/{tag_id}")
def rename_tag(tag_id: UUID, body: TagRename, supabase=Depends(get_user_supabase), user_id=Depends(get_user_id)):
    res = (
        supabase.table("tags")
        .update({"name": body.name})
        .eq("id", str(tag_id))
        .eq("user_id", user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag not found")
    return res.data[0]


@router.delete("/{tag_id}", status_code=204)
def delete_tag(tag_id: UUID, supabase=Depends(get_user_supabase), user_id=Depends(get_user_id)):
    res = (
        supabase.table("tags")
        .delete()
        .eq("id", str(tag_id))
        .eq("user_id", user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag not found")


@router.put("/{tag_id}/move")
def move_tag(tag_id: UUID, body: TagMove, supabase=Depends(get_user_supabase), user_id=Depends(get_user_id)):
    res = (
        supabase.table("tags")
        .update({
            "parent_tag_id": str(body.parent_tag_id) if body.parent_tag_id else None,
            "position": body.position,
        })
        .eq("id", str(tag_id))
        .eq("user_id", user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag not found")
    return res.data[0]


@router.put("/reorder")
def reorder_siblings(body: TagReorder, supabase=Depends(get_user_supabase), user_id=Depends(get_user_id)):
    for idx, tag_id in enumerate(body.tag_ids):
        supabase.table("tags").update({"position": idx}).eq("id", str(tag_id)).eq("user_id", user_id).execute()
    return {"ok": True}
```

Register router in `backend/main.py`:

```python
from backend.routers import tags as tags_router
app.include_router(tags_router.router)
```

- [ ] **Step 4: Run tests, verify PASS**

```bash
backend/.venv/bin/python -m pytest backend/tests/test_tags.py -v
```

- [ ] **Step 5: Lint**

```bash
backend/.venv/bin/ruff check backend/ --fix
backend/.venv/bin/ruff format backend/
```

- [ ] **Step 6: Commit**

```bash
git add backend/
git commit -m "feat: add tags CRUD endpoints [125]"
```

---

### Task 3: Add collection ↔ tag association endpoints

**Files:**
- Modify: `backend/routers/metadata.py` (add three handlers)
- Test: `backend/tests/test_collections.py` (add new test cases)

Endpoints:
- `GET /collections/{id}/tags` — list tags on a collection
- `PUT /collections/{id}/tags` body `{ tag_ids: [...] }` — replace full tag set
- `GET /tags/{id}/collections` — list collections that have this tag (direct only)

- [ ] **Step 1: Write failing tests**

Add to `backend/tests/test_collections.py`:
- `test_list_collection_tags_empty`
- `test_set_collection_tags_replaces_existing`
- `test_set_collection_tags_clears_when_empty_array`
- `test_set_collection_tags_validates_tag_ownership` (passing another user's tag → 404 or 400)
- `test_list_collections_for_tag`
- `test_user_isolation_for_collection_tags`

- [ ] **Step 2: Run, verify FAIL**

```bash
backend/.venv/bin/python -m pytest backend/tests/test_collections.py -v -k "tag"
```

- [ ] **Step 3: Implement handlers in `backend/routers/metadata.py`**

```python
class CollectionTagsSet(BaseModel):
    tag_ids: list[UUID]


@router.get("/collections/{collection_id}/tags")
def list_collection_tags(collection_id: UUID, supabase=Depends(get_user_supabase), user_id=Depends(get_user_id)):
    # Verify ownership
    coll = supabase.table("collections").select("id").eq("id", str(collection_id)).eq("user_id", user_id).execute()
    if not coll.data:
        raise HTTPException(404, "Collection not found")
    res = (
        supabase.table("collection_tags")
        .select("tag_id, tags(id, name, parent_tag_id, position)")
        .eq("collection_id", str(collection_id))
        .execute()
    )
    return [row["tags"] for row in res.data]


@router.put("/collections/{collection_id}/tags")
def set_collection_tags(collection_id: UUID, body: CollectionTagsSet, supabase=Depends(get_user_supabase), user_id=Depends(get_user_id)):
    coll = supabase.table("collections").select("id").eq("id", str(collection_id)).eq("user_id", user_id).execute()
    if not coll.data:
        raise HTTPException(404, "Collection not found")
    # Validate all tag_ids belong to user
    if body.tag_ids:
        owned = (
            supabase.table("tags")
            .select("id")
            .in_("id", [str(t) for t in body.tag_ids])
            .eq("user_id", user_id)
            .execute()
        )
        if len(owned.data) != len(body.tag_ids):
            raise HTTPException(400, "One or more tag_ids invalid")
    # Wipe and reinsert
    supabase.table("collection_tags").delete().eq("collection_id", str(collection_id)).execute()
    if body.tag_ids:
        rows = [{"collection_id": str(collection_id), "tag_id": str(t)} for t in body.tag_ids]
        supabase.table("collection_tags").insert(rows).execute()
    return {"ok": True}


@router.get("/tags/{tag_id}/collections")
def list_collections_for_tag(tag_id: UUID, supabase=Depends(get_user_supabase), user_id=Depends(get_user_id)):
    tag = supabase.table("tags").select("id").eq("id", str(tag_id)).eq("user_id", user_id).execute()
    if not tag.data:
        raise HTTPException(404, "Tag not found")
    res = (
        supabase.table("collection_tags")
        .select("collection_id")
        .eq("tag_id", str(tag_id))
        .execute()
    )
    return [{"collection_id": row["collection_id"]} for row in res.data]
```

- [ ] **Step 4: Run tests, verify PASS**

- [ ] **Step 5: Lint + Commit**

```bash
backend/.venv/bin/ruff check backend/ --fix && backend/.venv/bin/ruff format backend/
git add backend/
git commit -m "feat: add collection<->tag association endpoints [125]"
```

---

## Phase 2 — Frontend foundation

### Task 4: Install shadcn/ui + required components

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/components/ui/*` (shadcn output)
- Modify: `frontend/tailwind.config.js` (shadcn config additions)

- [ ] **Step 1: Initialize shadcn**

```bash
npx --prefix frontend shadcn@latest init
```

Use existing Tailwind config; choose "JavaScript" not TypeScript; CSS variables yes; output dir `src/components/ui`.

- [ ] **Step 2: Install needed components**

```bash
npx --prefix frontend shadcn@latest add collapsible toggle-group card command badge button dialog
```

- [ ] **Step 3: Verify dev server still starts**

```bash
make dev-bg MAIN_REPO=<main-repo-path>
```

Check `http://localhost:5173` loads. Stop with `make stop`.

- [ ] **Step 4: Commit**

```bash
git add frontend/
git commit -m "chore: install shadcn/ui base components [125]"
```

---

### Task 5: Add `useCollectionMembership` hook

**Files:**
- Create: `frontend/src/hooks/useCollectionMembership.js`
- Test: `frontend/src/hooks/useCollectionMembership.test.js`
- Modify: `frontend/src/App.jsx` — replace scattered `setAlbumCollectionMap` calls with hook actions

- [ ] **Step 1: Write failing tests**

Test cases:
- `addAlbumsToCollection(collectionId, albumIds)` updates map for each
- `removeAlbumFromCollection(collectionId, albumId)` removes entry
- `setCollectionMembership(collectionId, albumIds)` replaces full set
- `deleteCollection(collectionId)` removes collectionId from every album's list
- Returns stable references (memoized) when state unchanged

- [ ] **Step 2: Run, verify FAIL**

```bash
npx --prefix frontend vitest --run useCollectionMembership
```

- [ ] **Step 3: Implement**

```js
// frontend/src/hooks/useCollectionMembership.js
import { useCallback, useState } from 'react';

export function useCollectionMembership(initial = {}) {
  const [map, setMap] = useState(initial);

  const addAlbumsToCollection = useCallback((collectionId, albumIds) => {
    setMap((prev) => {
      const next = { ...prev };
      for (const id of albumIds) {
        const list = next[id] ?? [];
        if (!list.includes(collectionId)) next[id] = [...list, collectionId];
      }
      return next;
    });
  }, []);

  const removeAlbumFromCollection = useCallback((collectionId, albumId) => {
    setMap((prev) => {
      const list = prev[albumId];
      if (!list) return prev;
      const filtered = list.filter((id) => id !== collectionId);
      return { ...prev, [albumId]: filtered };
    });
  }, []);

  const setCollectionMembership = useCallback((collectionId, albumIds) => {
    setMap((prev) => {
      const next = {};
      // Strip collectionId from all entries
      for (const [aid, list] of Object.entries(prev)) {
        const stripped = list.filter((id) => id !== collectionId);
        if (stripped.length) next[aid] = stripped;
      }
      // Add to each new album
      for (const aid of albumIds) {
        next[aid] = [...(next[aid] ?? []), collectionId];
      }
      return next;
    });
  }, []);

  const deleteCollection = useCallback((collectionId) => {
    setMap((prev) => {
      const next = {};
      for (const [aid, list] of Object.entries(prev)) {
        const stripped = list.filter((id) => id !== collectionId);
        if (stripped.length) next[aid] = stripped;
      }
      return next;
    });
  }, []);

  return {
    albumCollectionMap: map,
    setAlbumCollectionMap: setMap,
    addAlbumsToCollection,
    removeAlbumFromCollection,
    setCollectionMembership,
    deleteCollection,
  };
}
```

- [ ] **Step 4: Run tests, verify PASS**

- [ ] **Step 5: Refactor App.jsx**

Replace existing `useState(albumCollectionMap)` with `useCollectionMembership()`. Replace inline `setAlbumCollectionMap(...)` mutations in `handleBulkAdd`, `handleToggleCollection`, `handleDeleteCollection`, `handleFetchCollectionAlbums`, `handleEnterCollection` with the named action calls.

Run full frontend test suite to confirm no regressions:

```bash
npx --prefix frontend vitest --run
```

- [ ] **Step 6: Commit**

```bash
git add frontend/
git commit -m "refactor: centralize collection membership in hook [125]"
```

---

## Phase 3 — Tag UI

### Task 6: Build `TagTreeSidebar` component (desktop)

**Files:**
- Create: `frontend/src/components/TagTreeSidebar.jsx`
- Test: `frontend/src/components/TagTreeSidebar.test.jsx`
- Create: `frontend/src/lib/tagTree.js` (tree-building helpers)
- Test: `frontend/src/lib/tagTree.test.js`

- [ ] **Step 1: Write failing tests for `tagTree.js` helpers**

```js
// buildTagTree(flatTags) -> [{ ...tag, children: [...] }]
// getDescendantIds(tree, tagId) -> Set<string>
// findNode(tree, tagId) -> node | null
```

- [ ] **Step 2: Implement `tagTree.js`**

```js
export function buildTagTree(flatTags) {
  const byId = new Map();
  for (const t of flatTags) byId.set(t.id, { ...t, children: [] });
  const roots = [];
  for (const node of byId.values()) {
    if (node.parent_tag_id && byId.has(node.parent_tag_id)) {
      byId.get(node.parent_tag_id).children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (nodes) => {
    nodes.sort((a, b) => a.position - b.position);
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

export function getDescendantIds(tree, tagId) {
  const result = new Set();
  const node = findNode(tree, tagId);
  if (!node) return result;
  const walk = (n) => {
    result.add(n.id);
    n.children.forEach(walk);
  };
  walk(node);
  return result;
}

export function findNode(tree, tagId) {
  for (const node of tree) {
    if (node.id === tagId) return node;
    const sub = findNode(node.children, tagId);
    if (sub) return sub;
  }
  return null;
}
```

- [ ] **Step 3: Write failing tests for `TagTreeSidebar`**

Tests:
- Renders "All" root + flat tag list
- Expand/collapse parent shows/hides children
- Click tag fires `onSelect(tagId)`
- Selected tag has highlighted state
- Empty state shows "No tags yet" + "Manage tags" link

- [ ] **Step 4: Implement `TagTreeSidebar.jsx`**

```jsx
import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight } from 'lucide-react';
import { buildTagTree } from '@/lib/tagTree';

function TagNode({ node, selectedId, onSelect, depth = 0 }) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer hover:bg-bg-elevated ${isSelected ? 'bg-bg-elevated text-text font-medium' : 'text-text-dim'}`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => onSelect(node.id)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
            className="w-4 h-4 flex items-center justify-center"
          >
            <ChevronRight className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className="text-sm truncate">{node.name}</span>
      </div>
      {hasChildren && open && (
        <div>
          {node.children.map((child) => (
            <TagNode key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function TagTreeSidebar({ tags, selectedTagId, onSelect, onOpenManager }) {
  const tree = buildTagTree(tags);
  return (
    <aside className="w-56 border-r border-border h-full flex flex-col">
      <div className="p-2 flex-1 overflow-y-auto">
        <div
          className={`px-2 py-1 rounded cursor-pointer hover:bg-bg-elevated text-sm ${selectedTagId === null ? 'bg-bg-elevated font-medium' : 'text-text-dim'}`}
          onClick={() => onSelect(null)}
        >
          All
        </div>
        {tree.map((node) => (
          <TagNode key={node.id} node={node} selectedId={selectedTagId} onSelect={onSelect} />
        ))}
        {tags.length === 0 && (
          <div className="px-2 py-4 text-xs text-text-dim">No tags yet</div>
        )}
      </div>
      <button
        onClick={onOpenManager}
        className="border-t border-border px-3 py-2 text-xs text-text-dim hover:text-text text-left"
      >
        Manage tags
      </button>
    </aside>
  );
}
```

- [ ] **Step 5: Tests PASS, commit**

```bash
git add frontend/
git commit -m "feat: add TagTreeSidebar + tagTree helpers [125]"
```

---

### Task 7: Build `TagPickerInput` (inline tag chip editor on collection)

**Files:**
- Create: `frontend/src/components/TagPickerInput.jsx`
- Test: `frontend/src/components/TagPickerInput.test.jsx`

Behavior: shows current tags as removable chips, an autocomplete combobox below (using shadcn `Command`) listing existing tags filtered by query. Enter creates a new tag if no exact match exists. Calls `onChange(tagIds)`.

- [ ] **Step 1: Write tests**

- Renders existing tag chips
- Removing a chip fires `onChange` without that tag id
- Typing filters dropdown
- Selecting from dropdown adds tag id
- Pressing Enter on novel name calls `onCreate(name)` and adds returned tag

- [ ] **Step 2: Implement** using shadcn `Command` + `Badge`. Component props:

```jsx
<TagPickerInput
  allTags={tags}
  selectedTagIds={[...]}
  onChange={(nextIds) => ...}
  onCreate={async (name) => /* returns { id } */}
/>
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add TagPickerInput component [125]"
```

---

### Task 8: Build `TagManagerPage`

**Files:**
- Create: `frontend/src/components/TagManagerPage.jsx`
- Test: `frontend/src/components/TagManagerPage.test.jsx`

Renders the tag tree as an editable surface: each node has rename / delete / add-child / drag-to-reparent. Uses dnd-kit for reorder + reparent.

- [ ] **Step 1: Write tests** — rename calls onRename, delete shows confirm + calls onDelete, add-child calls onCreate(parentId), reorder calls onReorder([ids], parentId).

- [ ] **Step 2: Implement** with the same tree-walk pattern as `TagTreeSidebar` but each node has inline-edit + action buttons. Use existing `confirmingId` pattern from CollectionsPane for delete confirmation.

- [ ] **Step 3: Commit**

---

## Phase 4 — Collection layouts

### Task 9: Build `CollectionGrid` + `CollectionCard`

**Files:**
- Create: `frontend/src/components/CollectionGrid.jsx`
- Create: `frontend/src/components/CollectionCard.jsx`
- Test: `frontend/src/components/CollectionCard.test.jsx`
- Test: `frontend/src/components/CollectionGrid.test.jsx`

`CollectionCard` renders a 2x2 mosaic of the first 4 albums (or single pinned cover when set). Below the mosaic: collection name only. Click → `onOpen(collection)`. Right-click / long-press → context menu (rename, delete, manage tags).

`CollectionGrid` is responsive: 2 columns mobile, 3-4 desktop. Uses CSS grid.

- [ ] **Step 1: Write tests**

CollectionCard:
- Renders 2x2 mosaic from `albums` prop
- Renders single pinned cover when `cover_album_id` set
- Renders gray placeholder when no albums
- Click fires `onOpen`

CollectionGrid:
- Renders one card per collection
- Empty state when collections empty

- [ ] **Step 2: Implement**

```jsx
// CollectionCard.jsx
export function CollectionCard({ collection, albums, onOpen }) {
  const pinned = collection.cover_album_id
    ? albums.find((a) => a.service_id === collection.cover_album_id)
    : null;
  const mosaicAlbums = pinned ? [pinned] : albums.slice(0, 4);

  return (
    <button
      onClick={() => onOpen(collection)}
      className="flex flex-col gap-2 text-left group"
    >
      <div className="aspect-square rounded-md overflow-hidden bg-bg-elevated grid grid-cols-2 grid-rows-2 gap-px">
        {mosaicAlbums.length === 0 ? (
          <div className="col-span-2 row-span-2 bg-bg-elevated" />
        ) : pinned ? (
          <img src={pinned.image_url} alt="" className="col-span-2 row-span-2 w-full h-full object-cover" />
        ) : (
          mosaicAlbums.map((a, i) => (
            <img key={a.service_id} src={a.image_url} alt="" className="w-full h-full object-cover" />
          ))
        )}
      </div>
      <div className="text-sm text-text truncate group-hover:text-text-hover">{collection.name}</div>
    </button>
  );
}
```

- [ ] **Step 3: Commit**

---

### Task 10: Build `CollectionList` (denser replacement)

**Files:**
- Create: `frontend/src/components/CollectionList.jsx`
- Test: `frontend/src/components/CollectionList.test.jsx`

Compact rows: small art strip (28px), name, count. Hover reveals overflow menu. ~40px row height (vs current 62px). Drag-to-reorder via dnd-kit, same as current pane.

- [ ] **Step 1: Tests** — renders rows, click opens, drag reorders, overflow menu (rename/delete/manage tags).

- [ ] **Step 2: Implement**, lifting the row interaction logic from current `CollectionsPane.jsx` but with denser styling.

- [ ] **Step 3: Commit**

---

### Task 11: Build `ViewToggle`

**Files:**
- Create: `frontend/src/components/ViewToggle.jsx`
- Test: `frontend/src/components/ViewToggle.test.jsx`

Two-button shadcn `ToggleGroup` (List / Grid icons). Persists choice to `localStorage` under `bummer.collectionsView`.

- [ ] **Step 1-3:** Tests + implementation + commit.

---

## Phase 5 — Wire it all together

### Task 12: Rebuild `CollectionsPane` as orchestrator

**Files:**
- Modify: `frontend/src/components/CollectionsPane.jsx`
- Modify: `frontend/src/App.jsx` (props it passes)

New CollectionsPane composition:

```jsx
<div className="flex h-full">
  <TagTreeSidebar
    tags={tags}
    selectedTagId={selectedTagId}
    onSelect={setSelectedTagId}
    onOpenManager={() => onView('tag-manager')}
  />
  <div className="flex-1 flex flex-col overflow-hidden">
    <div className="flex items-center justify-between p-3 border-b border-border">
      <ViewToggle value={viewMode} onChange={setViewMode} />
      <button onClick={onCreate}>+ New Collection</button>
    </div>
    <div className="flex-1 overflow-y-auto p-3">
      {viewMode === 'grid' ? (
        <CollectionGrid collections={filteredCollections} onOpen={onEnter} />
      ) : (
        <CollectionList collections={filteredCollections} onOpen={onEnter} ... />
      )}
    </div>
    {/* Existing serving platter rows */}
    <RecentlyAddedRow ... />
    <RecentlyPlayedRow ... />
  </div>
</div>
```

`filteredCollections` = collections where `selectedTagId` is null OR collection has any tag in `getDescendantIds(tree, selectedTagId)`.

- [ ] **Step 1: Update CollectionsPane tests** — add tests for filtering, view toggling.

- [ ] **Step 2: Implement composition + filter logic.**

- [ ] **Step 3: Wire `tags`, `selectedTagId`, `viewMode` state into App.jsx.** Fetch tags on app load (parallel with collections); store in App state; pass down.

- [ ] **Step 4: Run full frontend test suite, fix regressions.**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: rebuild CollectionsPane with sidebar + grid/list [125]"
```

---

### Task 13: Add tag-manager view route

**Files:**
- Modify: `frontend/src/App.jsx` — add `'tag-manager'` to view union, render `TagManagerPage` when active
- Modify: `frontend/src/components/CollectionDetailHeader.jsx` — embed `TagPickerInput` below description

- [ ] **Step 1: Tests** — clicking "Manage tags" in sidebar switches view; collection detail saves tag changes via PUT `/collections/{id}/tags`.

- [ ] **Step 2: Implement.**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: wire tag manager + collection tag editor [125]"
```

---

## Phase 6 — Mobile

### Task 14: Mobile drill-down (`TagDrillPage`)

**Files:**
- Create: `frontend/src/components/TagDrillPage.jsx`
- Test: `frontend/src/components/TagDrillPage.test.jsx`
- Modify: `frontend/src/components/CollectionsPane.jsx` (mobile branch swaps in TagDrillPage instead of sidebar)

`TagDrillPage` shows: parent breadcrumb (back button to parent tag or "All"), child tags as tappable rows, then collections at this tag's level (CollectionGrid in 2-col mode). Serving platter rows at bottom only on the root ("All") view.

- [ ] **Step 1: Tests** — root shows root tags + all collections; tapping a tag drills in; back button returns; serving platter only shown at root.

- [ ] **Step 2: Implement** using same `buildTagTree` + `findNode` helpers.

- [ ] **Step 3: Wire mobile branch in CollectionsPane** (existing `useIsMobile()` or media query — match current pattern).

- [ ] **Step 4: Commit**

---

## Phase 7 — Cleanup

### Task 15: Remove dead code from old CollectionsPane

**Files:**
- Modify: `frontend/src/components/CollectionsPane.jsx`

Delete:
- Old desktop-row JSX (replaced by CollectionList)
- Old mobile-row JSX (replaced by CollectionGrid + drill-down)
- `artMap` side-effect block — moved into CollectionList / CollectionGrid where albums prop arrives ready to use
- Old rename/delete inline state — moved into CollectionList row component

Confirm by greping for any remaining references and running full tests:

```bash
npx --prefix frontend vitest --run
```

- [ ] **Step 1: Delete dead code, run tests, fix any breakages.**

- [ ] **Step 2: Commit**

```bash
git commit -m "refactor: remove dead CollectionsPane row code [125]"
```

---

### Task 16: Local preview + PR

- [ ] **Step 1: Start dev servers**

```bash
make dev-bg MAIN_REPO=<main-repo>
```

- [ ] **Step 2: Tell user to verify at `http://localhost:5173`** — both desktop (sidebar + grid + list toggle) and mobile (drill-down).

- [ ] **Step 3: After user approves, push branch and update draft PR description.**

```bash
gh pr edit --body "Closes #125 — Collections overhaul: hierarchical tags, sidebar tree, list/grid views, shadcn/ui foundation."
```

- [ ] **Step 4: Poll CI checks; merge with `gh pr merge --squash --repo toofanian/bummer` after pass + user approval.**

---

## Self-Review Checklist (run before handoff)

- [x] Spec coverage: all sections of `docs/specs/2026-05-04-collections-overhaul-design.md` mapped to a task
- [x] No "TBD" / "fill in later" placeholders in code blocks
- [x] Function signatures consistent across tasks (e.g. `addAlbumsToCollection`, `getDescendantIds`)
- [x] Migration applied before backend tasks merge to main
- [x] Tests written before implementation in every code task
- [x] Each task ends in a commit
