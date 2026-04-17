import { useState } from 'react'

export default function CollectionDetailHeader({ name, description, albumCount, onBack, onDescriptionChange }) {
  const [desc, setDesc] = useState(description || '')

  function handleBlur() {
    const trimmed = desc.trim()
    if (trimmed !== (description || '')) {
      onDescriptionChange(trimmed || null)
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-surface flex-shrink-0">
      <button className="text-sm text-text-dim transition-colors duration-150 hover:text-text" onClick={onBack}>← Back</button>
      <div className="flex-1 min-w-0">
        <h2 className="text-base font-semibold">{name}</h2>
        <input
          className="bg-transparent border-none text-xs text-text-dim w-full p-0 outline-none"
          placeholder="Add a description…"
          value={desc}
          onChange={e => setDesc(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={e => e.key === 'Enter' && e.target.blur()}
        />
      </div>
      <span className="text-sm text-text-dim flex-shrink-0">{albumCount} albums</span>
    </div>
  )
}
