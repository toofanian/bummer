export default function LibraryViewToggle({ activeView, onViewChange, albumCount, artistCount }) {
  return (
    <div role="tablist" className="inline-flex bg-surface-2 rounded-full p-0.5 gap-0.5">
      <button
        role="tab"
        aria-selected={activeView === 'albums'}
        className={`px-3 py-1 text-xs font-medium rounded-full transition-colors duration-150 border-none cursor-pointer ${
          activeView === 'albums' ? 'bg-surface text-text' : 'bg-transparent text-text-dim hover:text-text'
        }`}
        onClick={() => onViewChange('albums')}
      >
        Albums ({albumCount})
      </button>
      <button
        role="tab"
        aria-selected={activeView === 'artists'}
        className={`px-3 py-1 text-xs font-medium rounded-full transition-colors duration-150 border-none cursor-pointer ${
          activeView === 'artists' ? 'bg-surface text-text' : 'bg-transparent text-text-dim hover:text-text'
        }`}
        onClick={() => onViewChange('artists')}
      >
        Artists{artistCount != null ? ` (${artistCount})` : ''}
      </button>
    </div>
  )
}
