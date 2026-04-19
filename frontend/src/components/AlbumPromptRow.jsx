export default function AlbumPromptRow({ label, albums, albumCollectionMap, selectedIds, onToggleSelect }) {
  if (!albums || albums.length === 0) return null

  return (
    <div>
      <div className="text-[10px] font-medium text-text-dim uppercase tracking-wider px-3 py-1">{label}</div>
      <div className="flex gap-2 px-3 pb-2 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        {albums.map(album => {
          const collectionIds = albumCollectionMap[album.service_id] || []
          const count = collectionIds.length
          const isSelected = selectedIds.has(album.service_id)

          return (
            <button
              key={album.service_id}
              className={`relative flex-shrink-0 rounded-md overflow-hidden border-2 transition-all duration-150 ${
                isSelected
                  ? 'border-accent shadow-[0_0_8px_rgba(var(--accent-rgb,99,102,241),0.4)]'
                  : 'border-transparent'
              }`}
              style={{ width: 56, height: 56 }}
              onClick={() => onToggleSelect(album.service_id)}
              aria-label={`${isSelected ? 'Deselect' : 'Select'} ${album.name}`}
            >
              {album.image_url ? (
                <img
                  src={album.image_url}
                  alt={album.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div data-testid="album-placeholder" className="w-full h-full bg-surface-2" />
              )}

              {count > 0 && (
                <div
                  data-testid="collection-count-overlay"
                  className={`absolute inset-0 bg-black/50 flex items-center justify-center ${
                    isSelected ? 'items-end justify-end pb-1 pr-1' : ''
                  }`}
                >
                  <span className={`text-white font-bold ${isSelected ? 'text-[10px]' : 'text-sm'}`}>
                    {count}
                  </span>
                </div>
              )}

              {isSelected && (
                <div className="absolute inset-0 flex items-center justify-center" data-testid="selected-overlay">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
