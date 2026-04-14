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
    <div className="collections-bubble">
      <button
        ref={btnRef}
        className={`collections-bubble-btn${count > 0 ? ' has-collections' : ''}`}
        aria-label={count > 0 ? `${count} collections` : 'Add to collection'}
        onClick={handleToggle}
      >
        {count > 0 ? count : '+'}
      </button>

      {open && (
        <div
          ref={dropdownRef}
          className="collections-bubble-dropdown"
          style={{ position: 'fixed', top: pos.top, left: pos.left, right: 'auto' }}
          role="dialog"
          aria-label="Collections"
        >
          <input
            className="collections-bubble-new-input"
            placeholder="New collection"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />

          <div className="collections-bubble-list">
            {collections.length === 0 ? (
              <div className="collections-bubble-empty">No collections yet</div>
            ) : (
              collections.map(c => {
                const checked = albumCollectionIds.includes(c.id)
                return (
                  <div
                    key={c.id}
                    className="collections-bubble-item"
                    role="menuitemcheckbox"
                    aria-checked={checked}
                    onClick={() => handleCheckbox(c.id, checked)}
                  >
                    <span>{c.name}</span>
                    {checked && (
                      <span className="collections-bubble-check" aria-hidden="true">✓</span>
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
