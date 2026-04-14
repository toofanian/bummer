import { useState, useRef, useEffect } from 'react'

const DROPDOWN_WIDTH = 200

/**
 * CollectionsBubble
 *
 * Props:
 *   albumCollectionIds  — string[]  IDs of collections this album is in
 *   collections         — { id, name }[]  all collections
 *   onToggle            — (collectionId: string, add: boolean) => void
 *   onCreate            — (name: string) => void
 */
export default function CollectionsBubble({ albumCollectionIds, collections, onToggle, onCreate }) {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef(null)
  const dropdownRef = useRef(null)

  const count = albumCollectionIds.length

  function handleToggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.right - DROPDOWN_WIDTH })
    }
    setOpen(o => !o)
  }

  function handleCheckbox(id, currentlyIn) {
    onToggle(id, !currentlyIn)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && newName.trim()) {
      onCreate(newName.trim())
      setNewName('')
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  useEffect(() => {
    if (!open) return
    function onClickOutside(e) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        btnRef.current && !btnRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        className={`bg-transparent border border-transparent text-text-dim cursor-pointer w-[22px] h-[22px] rounded-full text-xs font-semibold flex items-center justify-center p-0 transition-all duration-100${count > 0 ? ' bg-surface-2 !border-accent text-accent' : ''}`}
        aria-label={count > 0 ? `${count} collections` : 'Add to collection'}
        onClick={handleToggle}
      >
        {count > 0 ? count : '+'}
      </button>

      {open && (
        <div
          ref={dropdownRef}
          className="z-[1000] bg-surface border border-border rounded-lg min-w-[200px] max-w-[240px] shadow-lg overflow-hidden"
          style={{ position: 'fixed', top: pos.top, left: pos.left, right: 'auto' }}
          role="dialog"
          aria-label="Collections"
        >
          <input
            className="w-full px-3 py-2 text-xs border-b border-border bg-surface"
            placeholder="New collection"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />

          <div className="max-h-[200px] overflow-y-auto">
            {collections.length === 0 ? (
              <div className="px-3 py-2 text-xs text-text-dim italic">No collections yet</div>
            ) : (
              collections.map(c => {
                const checked = albumCollectionIds.includes(c.id)
                return (
                  <div
                    key={c.id}
                    className="flex justify-between items-center px-3 py-2 cursor-pointer text-sm hover:bg-surface-2 transition-colors duration-150"
                    role="menuitemcheckbox"
                    aria-checked={checked}
                    onClick={() => handleCheckbox(c.id, checked)}
                  >
                    <span>{c.name}</span>
                    {checked && (
                      <span className="text-accent font-semibold" aria-hidden="true">✓</span>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
