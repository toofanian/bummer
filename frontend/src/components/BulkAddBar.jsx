export default function BulkAddBar({ selectedAlbums, onOpenPicker, onClear, bottomOffset = 0 }) {
  return (
    <div
      className="fixed left-0 right-0 z-[300] bg-surface border-t border-border"
      style={{ bottom: bottomOffset, paddingBottom: bottomOffset === 0 ? 'calc(12px + env(safe-area-inset-bottom, 0px))' : undefined }}
    >
      <div className="flex items-center justify-between px-4 py-2 gap-3 h-14">
        <div className="flex items-center gap-0 flex-1 min-w-0 overflow-hidden">
          {selectedAlbums.map((album) => (
            <div key={album.service_id} className="flex-shrink-0 w-10 h-10 -mr-1 first:ml-0">
              {album.image_url
                ? <img src={album.image_url} alt={album.name} width={40} height={40} className="w-10 h-10 rounded object-cover border border-border" />
                : <div className="w-10 h-10 rounded bg-surface-2 border border-border" />
              }
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            className="px-3 py-1.5 text-sm font-medium bg-text text-bg rounded-lg"
            aria-label="Add to Collection"
            onClick={onOpenPicker}
          >
            Add to Collection
          </button>
          <button
            className="px-2 py-1.5 text-sm text-text-dim hover:text-text"
            aria-label="Clear selection"
            onClick={onClear}
          >
            &times;
          </button>
        </div>
      </div>
    </div>
  )
}
