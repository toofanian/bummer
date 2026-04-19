import { useRef, useState, useEffect } from 'react'

export default function AlbumPromptRow({ label, albums, albumCollectionMap, selectedIds, onToggleSelect }) {
  const hasAlbums = albums && albums.length > 0
  const containerRef = useRef(null)
  const [visibleCount, setVisibleCount] = useState(null)

  useEffect(() => {
    if (!containerRef.current || !hasAlbums) return
    function measure() {
      const el = containerRef.current
      if (!el) return
      const cardSize = 56
      const gap = 8
      const padding = 24 // px-3 = 12px * 2
      const available = el.clientWidth - padding
      if (available <= 0) return
      const count = Math.max(1, Math.floor((available + gap) / (cardSize + gap)))
      setVisibleCount(count)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [hasAlbums])

  const display = hasAlbums ? (visibleCount != null ? albums.slice(0, visibleCount) : albums) : []

  return (
    <div ref={containerRef} className="overflow-hidden">
      {!hasAlbums ? null : (
      <div className="flex gap-2 px-3 py-2 justify-center">
        {display.map(album => {
          const collectionIds = albumCollectionMap[album.service_id] || []
          const count = collectionIds.length
          const isSelected = selectedIds.has(album.service_id)

          return (
            <button
              key={album.service_id}
              className={`relative flex-shrink-0 rounded-md overflow-hidden transition-all duration-150 p-0 border-none bg-transparent ${
                isSelected
                  ? 'ring-2 ring-accent shadow-[0_0_8px_rgba(var(--accent-rgb,99,102,241),0.4)]'
                  : ''
              }`}
              style={{ width: 56, height: 56 }}
              onClick={() => onToggleSelect(album.service_id)}
              aria-label={`${isSelected ? 'Deselect' : 'Select'} ${album.name}`}
            >
              {album.image_url ? (
                <img
                  src={album.image_url}
                  alt={album.name}
                  width={56}
                  height={56}
                  className="rounded-md object-cover"
                  style={{ width: 56, height: 56 }}
                />
              ) : (
                <div data-testid="album-placeholder" className="rounded-md bg-surface-2" style={{ width: 56, height: 56 }} />
              )}

              {(count > 0 || isSelected) && (
                <div
                  data-testid="collection-count-overlay"
                  className={`absolute inset-0 bg-black/50 flex items-center justify-center ${
                    isSelected && count > 0 ? 'items-end justify-end pb-1 pr-1' : ''
                  }`}
                >
                  {count > 0 && (
                    <span className={`text-white font-bold ${isSelected ? 'text-[10px]' : 'text-sm'}`}>
                      {count}
                    </span>
                  )}
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
      )}
    </div>
  )
}
