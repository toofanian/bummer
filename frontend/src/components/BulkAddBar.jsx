export default function BulkAddBar({ selectedCount, onOpenPicker, onClear, bottomOffset = 0 }) {
  return (
    <div
      className="fixed left-0 right-0 z-[300] bg-surface border-t border-border"
      style={{ bottom: bottomOffset, paddingBottom: bottomOffset === 0 ? 'calc(12px + env(safe-area-inset-bottom, 0px))' : undefined }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm text-primary font-medium">{selectedCount} selected</span>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1.5 text-sm font-medium bg-accent text-on-accent rounded-lg"
            aria-label="Add to Collection"
            onClick={onOpenPicker}
          >
            Add to Collection
          </button>
          <button
            className="px-2 py-1.5 text-sm text-secondary hover:text-primary"
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
