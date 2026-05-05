import { useMemo } from 'react'
import CollectionGrid from './CollectionGrid'
import { buildTagTree, findNode, getDescendantIds } from '../lib/tagTree'

// Mobile drill-down navigation for tags + collections.
// - Root view (currentTagId === null): list of root tags + all collections grid + servingPlatter
// - Tag view (currentTagId !== null): back button, child tags, collections under this tag/descendants
export default function TagDrillPage({
  tags,
  collections,
  collectionTagsMap,
  albumsByCollection,
  currentTagId,
  onSelectTag,
  onOpenCollection,
  servingPlatter,
}) {
  const tree = useMemo(() => buildTagTree(tags || []), [tags])
  const currentNode = useMemo(
    () => (currentTagId ? findNode(tree, currentTagId) : null),
    [tree, currentTagId],
  )

  const isRoot = currentTagId == null

  const childTags = isRoot ? tree : currentNode?.children || []

  const visibleCollections = useMemo(() => {
    if (isRoot) return collections
    if (!currentNode) return []
    const allowed = getDescendantIds(tree, currentTagId)
    if (allowed.size === 0) return []
    return collections.filter((c) => {
      const tagIds = (collectionTagsMap || {})[c.id] || []
      return tagIds.some((id) => allowed.has(id))
    })
  }, [isRoot, currentNode, tree, currentTagId, collections, collectionTagsMap])

  function handleBack() {
    if (!currentNode) {
      onSelectTag(null)
      return
    }
    onSelectTag(currentNode.parent_tag_id || null)
  }

  return (
    <div className="w-full flex flex-col h-full overflow-hidden">
      <div className="flex items-center px-4 py-3 border-b border-border flex-shrink-0 gap-2">
        {isRoot ? (
          <h1 className="text-base font-semibold text-text">Collections</h1>
        ) : (
          <>
            <button
              type="button"
              aria-label="Back"
              onClick={handleBack}
              className="bg-transparent border-none text-text-dim hover:text-text cursor-pointer p-1 rounded"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <h1 className="text-base font-semibold text-text truncate">{currentNode?.name}</h1>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {childTags.length > 0 && (
          <div className="border-b border-border">
            {childTags.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => onSelectTag(node.id)}
                className="w-full flex items-center justify-between px-4 py-3 bg-transparent border-none border-b border-border text-left cursor-pointer hover:bg-bg-elevated transition-colors duration-150"
              >
                <span className="text-sm text-text">{node.name}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-text-dim">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            ))}
          </div>
        )}

        {visibleCollections.length > 0 ? (
          <CollectionGrid
            collections={visibleCollections}
            albumsByCollection={albumsByCollection || {}}
            onOpen={onOpenCollection}
          />
        ) : !isRoot && childTags.length === 0 ? (
          <div className="p-4 text-sm text-text-dim italic">No collections under this tag</div>
        ) : null}

        {isRoot && servingPlatter}
      </div>
    </div>
  )
}
