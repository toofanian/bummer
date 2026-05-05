import { useState, useEffect, useMemo } from 'react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useIsMobile } from '../hooks/useIsMobile'
import AlbumArtStrip from './AlbumArtStrip'
import AlbumPromptBar from './AlbumPromptBar'
import { TagTreeSidebar } from './TagTreeSidebar'
import { ViewToggle } from './ViewToggle'
import CollectionGrid from './CollectionGrid'
import CollectionList from './CollectionList'
import TagDrillPage from './TagDrillPage'
import { buildTagTree, getDescendantIds } from '../lib/tagTree'

// --- Legacy mobile row ---
// Mobile branch keeps the existing row-with-art-strip rendering until Task 14
// replaces it with TagDrillPage. Desktop uses the new composition below.

function CollectionRow({ col, renamingId, renameValue, setRenameValue, setRenamingId, submitRename, confirmingId, setConfirmingId, menuOpenId, setMenuOpenId, handleDeleteClick, handleConfirmDelete, handleCancelDelete, onEnter, artAlbums, dragHandleProps, sortableRef, sortableStyle }) {
  return (
    <div
      ref={sortableRef}
      style={sortableStyle}
      data-testid="collection-row"
      className="border-b border-border cursor-pointer hover:bg-hover transition-colors duration-150 group"
      onClick={() => onEnter(col)}
      onMouseLeave={() => {
        if (menuOpenId === col.id) setMenuOpenId(null)
        if (confirmingId === col.id) setConfirmingId(null)
      }}
    >
      <div className="flex items-center justify-between px-4 py-2">
        {dragHandleProps && (
          <button
            aria-label="Drag to reorder"
            className="drag-handle bg-transparent border-none text-text-dim cursor-grab p-0 text-lg touch-none ml-1 mr-2"
            onClick={(e) => e.stopPropagation()}
            {...dragHandleProps}
          >⠿</button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {renamingId === col.id ? (
              <input
                className="text-sm font-medium text-text bg-transparent border-b border-accent outline-none w-full"
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') submitRename(col)
                  if (e.key === 'Escape') { setRenamingId(null) }
                }}
                onBlur={() => submitRename(col)}
                autoFocus
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className="text-sm font-medium text-text">{col.name}</span>
            )}
          </div>
          {col.album_count != null && (
            <div className="text-xs text-text-dim mt-0.5">{col.album_count} {col.album_count === 1 ? 'album' : 'albums'}</div>
          )}
          {col.description && (
            <div className="text-xs text-text-dim mt-0.5 truncate">{col.description}</div>
          )}
        </div>
        <div onClick={e => e.stopPropagation()} className="relative">
          {renamingId === col.id ? null : confirmingId === col.id ? (
            <>
              <button className="bg-delete-red border-none text-white cursor-pointer text-xs font-semibold px-1.5 py-0.5 rounded mr-0.5 whitespace-nowrap" aria-label="Confirm delete" onClick={e => handleConfirmDelete(e, col.id)}>Delete</button>
              <button className="bg-transparent border border-border text-text-dim cursor-pointer text-xs px-1.5 py-0.5 rounded whitespace-nowrap" aria-label="Cancel" onClick={handleCancelDelete}>Cancel</button>
            </>
          ) : menuOpenId === col.id ? (
            <div className="flex gap-1">
              <button className="bg-transparent border border-border text-text text-xs px-2 py-1 rounded cursor-pointer hover:bg-surface-2" onClick={() => { setMenuOpenId(null); setRenamingId(col.id); setRenameValue(col.name) }}>Rename</button>
              <button className="bg-transparent border border-border text-delete-red text-xs px-2 py-1 rounded cursor-pointer hover:bg-surface-2" onClick={e => { setMenuOpenId(null); handleDeleteClick(e, col.id) }}>Delete</button>
            </div>
          ) : (
            <button className="bg-transparent border-none text-text-dim cursor-pointer text-lg p-1.5 rounded opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-surface-2 transition-opacity duration-150" aria-label="More options" onClick={() => setMenuOpenId(col.id)}>⋯</button>
          )}
        </div>
      </div>
      <div style={{ height: 62 }}>
        <AlbumArtStrip albums={artAlbums} size={62} />
      </div>
    </div>
  )
}

function SortableCollectionRow({ col, ...rest }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: col.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <CollectionRow
      col={col}
      sortableRef={setNodeRef}
      sortableStyle={style}
      dragHandleProps={{ ...attributes, ...listeners }}
      {...rest}
    />
  )
}

// Shared filter helper: returns the subset of `collections` that match the
// currently-selected tag (or all when selectedTagId is null). A collection
// matches when any of its tag ids appears in the selected tag's descendant set.
function filterCollectionsByTag(collections, tags, selectedTagId, collectionTagsMap) {
  if (selectedTagId === null || selectedTagId === undefined) return collections
  const tree = buildTagTree(tags || [])
  const allowed = getDescendantIds(tree, selectedTagId)
  if (allowed.size === 0) return []
  return collections.filter(c => {
    const tagIds = (collectionTagsMap || {})[c.id] || []
    return tagIds.some(id => allowed.has(id))
  })
}

// Exported for unit tests of the pure filter logic
export { filterCollectionsByTag }

export default function CollectionsPane({
  collections,
  onEnter,
  onDelete,
  onCreate,
  onRename,
  onFetchAlbums,
  albumCollectionMap,
  collectionsForPicker,
  session,
  onBulkAdd,
  onCreateCollection,
  onReorder,
  showCreate,
  onShowCreateChange,
  createName,
  onCreateNameChange,
  onCreateSubmit,
  // New props (Task 12)
  tags,
  selectedTagId,
  onSelectTag,
  viewMode,
  onViewModeChange,
  onManageTags,
  onOpenTagManager,
  collectionTagsMap,
}) {
  const isMobile = useIsMobile()
  const [artMap, setArtMap] = useState({})
  const [confirmingId, setConfirmingId] = useState(null)
  const [menuOpenId, setMenuOpenId] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')

  // Eagerly load album art previews per collection. Used by both the mobile
  // legacy rows and the desktop grid/list (which take `albumsByCollection`).
  useEffect(() => {
    if (!onFetchAlbums || !collections.length) return
    collections.forEach(col => {
      if (artMap[col.id]) return
      setArtMap(prev => ({ ...prev, [col.id]: { albums: [], loading: true } }))
      onFetchAlbums(col.id).then(albums => {
        setArtMap(prev => ({ ...prev, [col.id]: { albums, loading: false } }))
      })
    })
  }, [collections])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!confirmingId && !menuOpenId) return
    function handleDocClick() {
      setConfirmingId(null)
      setMenuOpenId(null)
    }
    const id = setTimeout(() => {
      document.addEventListener('click', handleDocClick)
    }, 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('click', handleDocClick)
    }
  }, [confirmingId, menuOpenId])

  function handleDeleteClick(e, colId) {
    e.stopPropagation()
    if (confirmingId !== colId) setConfirmingId(colId)
  }
  function handleConfirmDelete(e, colId) {
    e.stopPropagation()
    onDelete(colId)
    setConfirmingId(null)
  }
  function handleCancelDelete(e) {
    e.stopPropagation()
    setConfirmingId(null)
  }
  function submitRename(col) {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== col.name) {
      onRename(col.id, trimmed)
    }
    setRenamingId(null)
  }

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor))
  const sortableIds = useMemo(() => collections.map(c => c.id), [collections])
  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sortableIds.indexOf(active.id)
    const newIndex = sortableIds.indexOf(over.id)
    const newOrder = arrayMove(sortableIds, oldIndex, newIndex)
    onReorder?.(newOrder)
  }

  // albumsByCollection: { [collectionId]: Album[] } derived from the artMap
  // used for both mobile rows (legacy) and desktop grid/list previews.
  const albumsByCollection = useMemo(() => {
    const out = {}
    Object.entries(artMap).forEach(([colId, entry]) => {
      out[colId] = entry?.albums || []
    })
    return out
  }, [artMap])

  // Refresh art for a single collection — used after bulk-adding albums via
  // AlbumPromptBar so the strip updates without re-fetching everything.
  async function refreshCollectionArt(collectionId) {
    if (!onFetchAlbums) return
    const albums = await onFetchAlbums(collectionId)
    setArtMap(prev => ({ ...prev, [collectionId]: { albums, loading: false } }))
  }

  // Compute the filtered set unconditionally so hook order stays stable across
  // mobile/desktop branches. (Mobile ignores it; desktop renders from it.)
  const filteredCollections = useMemo(
    () => filterCollectionsByTag(collections, tags || [], selectedTagId ?? null, collectionTagsMap || {}),
    [collections, tags, selectedTagId, collectionTagsMap],
  )

  // ---- Mobile branch (drill-down) ----
  if (isMobile) {
    const servingPlatter = (
      <AlbumPromptBar
        albumCollectionMap={albumCollectionMap || {}}
        collections={collectionsForPicker || []}
        session={session}
        onBulkAdd={async (collectionId, albumIds) => {
          if (onBulkAdd) await onBulkAdd(collectionId, albumIds)
          await refreshCollectionArt(collectionId)
        }}
        onCreate={onCreateCollection || (() => {})}
      />
    )
    return (
      <TagDrillPage
        tags={tags || []}
        collections={collections}
        collectionTagsMap={collectionTagsMap || {}}
        albumsByCollection={albumsByCollection}
        currentTagId={selectedTagId ?? null}
        onSelectTag={onSelectTag || (() => {})}
        onOpenCollection={onEnter}
        servingPlatter={servingPlatter}
      />
    )
  }

  // ---- Desktop branch (new composition) ----
  const effectiveViewMode = viewMode === 'grid' ? 'grid' : 'list'

  return (
    <div className="flex h-full w-full overflow-hidden">
      <TagTreeSidebar
        tags={tags || []}
        selectedTagId={selectedTagId ?? null}
        onSelect={onSelectTag || (() => {})}
        onOpenManager={onOpenTagManager || (() => {})}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-border flex-shrink-0">
          <ViewToggle value={effectiveViewMode} onChange={onViewModeChange || (() => {})} />
          {onCreate && (
            <button
              type="button"
              onClick={() => onCreate()}
              className="bg-transparent border border-border text-text text-xs px-3 py-1 rounded cursor-pointer hover:bg-bg-elevated"
            >
              + New Collection
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-3" data-testid="collections-content">
          {effectiveViewMode === 'grid' ? (
            <CollectionGrid
              collections={filteredCollections}
              albumsByCollection={albumsByCollection}
              onOpen={onEnter}
            />
          ) : (
            <CollectionList
              collections={filteredCollections}
              albumsByCollection={albumsByCollection}
              onOpen={onEnter}
              onRename={onRename}
              onDelete={onDelete}
              onReorder={onReorder}
              onManageTags={onManageTags || onEnter}
            />
          )}
        </div>
        <AlbumPromptBar
          albumCollectionMap={albumCollectionMap || {}}
          collections={collectionsForPicker || []}
          session={session}
          onBulkAdd={async (collectionId, albumIds) => {
            if (onBulkAdd) await onBulkAdd(collectionId, albumIds)
            await refreshCollectionArt(collectionId)
          }}
          onCreate={onCreateCollection || (() => {})}
        />
      </div>
    </div>
  )
}
