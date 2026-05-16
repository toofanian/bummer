import { useState, useEffect, useMemo } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'
import AlbumPromptBar from './AlbumPromptBar'
import { TagTreeSidebar } from './TagTreeSidebar'
import { ViewToggle } from './ViewToggle'
import CollectionGrid from './CollectionGrid'
import CollectionList from './CollectionList'
import TagDrillPage from './TagDrillPage'
import { buildTagTree, getDescendantIds } from '../lib/tagTree'

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

  // Eagerly load album art previews per collection. Used by both the mobile
  // TagDrillPage and the desktop grid/list (which take `albumsByCollection`).
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

  // albumsByCollection: { [collectionId]: Album[] } derived from the artMap
  // used for both mobile TagDrillPage and desktop grid/list previews.
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
        onCreateCollection={onCreateCollection}
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
