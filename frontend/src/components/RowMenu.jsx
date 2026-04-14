import { useState, useRef, useEffect } from 'react'

const DROPDOWN_WIDTH = 180

export default function RowMenu({ collections, onAdd, onCreate }) {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef(null)
  const dropdownRef = useRef(null)

  function handleToggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.right - DROPDOWN_WIDTH })
    }
    setOpen(o => !o)
  }

  function handleAdd(id) {
    onAdd(id)
    setOpen(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && newName.trim()) {
      onCreate(newName.trim())
      setNewName('')
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
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div className="row-menu">
      <button ref={btnRef} onClick={handleToggle}>...</button>
      {open && (
        <div
          ref={dropdownRef}
          className="row-menu-dropdown"
          style={{ position: 'fixed', top: pos.top, left: pos.left, right: 'auto' }}
        >
          {collections.length === 0
            ? <div>No collections</div>
            : collections.map(c => (
                <div key={c.id} onClick={() => handleAdd(c.id)}>{c.name}</div>
              ))
          }
          <input
            placeholder="New collection"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
      )}
    </div>
  )
}
