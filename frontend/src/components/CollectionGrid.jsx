import CollectionCard from './CollectionCard'

export default function CollectionGrid({ collections, albumsByCollection, onOpen }) {
  if (!collections || collections.length === 0) {
    return (
      <div className="p-4 text-sm text-text-dim italic">No collections yet</div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-3">
      {collections.map(collection => (
        <CollectionCard
          key={collection.id}
          collection={collection}
          albums={albumsByCollection?.[collection.id] ?? []}
          onOpen={onOpen}
        />
      ))}
    </div>
  )
}
