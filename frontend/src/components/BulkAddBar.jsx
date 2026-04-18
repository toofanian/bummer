import AlbumArtStrip from './AlbumArtStrip'

export default function BulkAddBar({ selectedAlbums, onOpenPicker, onClear, bottomOffset = 0 }) {
  return (
    <div
      className="fixed left-0 right-0 z-[300] bg-surface border-t border-border"
      style={{ bottom: bottomOffset, paddingBottom: bottomOffset === 0 ? 'calc(12px + env(safe-area-inset-bottom, 0px))' : undefined }}
    >
      <div className="flex items-center justify-between px-4 py-2 gap-3 h-14">
        <div className="flex-1 min-w-0">
          <AlbumArtStrip albums={selectedAlbums} size={40} />
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
