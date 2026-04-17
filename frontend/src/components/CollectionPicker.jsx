import { useState, useRef, useEffect, useMemo } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'

export default function CollectionPicker({
  albumIds,
  collections,
  albumCollectionMap,
  onToggle,
  onBulkAdd,
  onCreate,
  onClose,
}) {
  const [search, setSearch] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const isFirstRender = useRef(true)
  const isMobile = useIsMobile()
  const isBulk = albumIds.length > 1

  const filtered = useMemo(() => {
    if (!search.trim()) return collections
    const q = search.toLowerCase()
    return collections.filter(c => c.name.toLowerCase().includes(q))
  }, [collections, search])

  const exactMatch = useMemo(() => {
    if (!search.trim()) return true
    return collections.some(c => c.name.toLowerCase() === search.trim().toLowerCase())
  }, [collections, search])

  const showCreate = search.trim() && !exactMatch

  // Total navigable rows: filtered collections + optional create row
  const totalRows = filtered.length + (showCreate ? 1 : 0)

  function isChecked(collectionId) {
    if (isBulk) {
      return albumIds.every(id => (albumCollectionMap[id] || []).includes(collectionId))
    }
    return (albumCollectionMap[albumIds[0]] || []).includes(collectionId)
  }

  function handleRowClick(collection) {
    if (isBulk) {
      onBulkAdd(collection.id)
    } else {
      const checked = isChecked(collection.id)
      onToggle(albumIds[0], collection.id, !checked)
    }
  }

  function handleCreate() {
    onCreate(search.trim())
    setSearch('')
    setHighlightIndex(-1)
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex(prev => {
        if (totalRows === 0) return -1
        return (prev + 1) % totalRows
      })
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex(prev => {
        if (totalRows === 0) return -1
        if (prev <= 0) return totalRows - 1
        return prev - 1
      })
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightIndex >= 0 && highlightIndex < filtered.length) {
        handleRowClick(filtered[highlightIndex])
      } else if (highlightIndex === filtered.length && showCreate) {
        handleCreate()
      }
      return
    }
  }

  // Reset highlight when search changes (skip initial render)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    setHighlightIndex(totalRows > 0 ? 0 : -1)
  }, [search])

  // Scroll highlighted row into view
  useEffect(() => {
    if (highlightIndex < 0 || !listRef.current) return
    const row = listRef.current.children[highlightIndex]
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center">
      <div
        data-testid="picker-backdrop"
        className="fixed inset-0 bg-black/50"
        onClick={onClose}
      />
      <div
        data-testid="picker-container"
        className={`relative z-[501] bg-surface border border-border rounded-lg shadow-xl overflow-hidden ${
          isMobile
            ? 'fixed left-0 right-0 bottom-0 rounded-b-none max-h-[70vh]'
            : 'w-[320px] max-h-[400px]'
        }`}
        role="listbox"
        aria-label="Collection picker"
      >
        <input
          ref={inputRef}
          className={`w-full px-3 py-2.5 border-b border-border bg-surface ${
            isMobile ? 'text-base' : 'text-sm'
          }`}
          placeholder="Search or create collection..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />

        <div ref={listRef} className="overflow-y-auto max-h-[300px]" style={isMobile ? { maxHeight: 'calc(70vh - 44px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' } : undefined}>
          {filtered.map((c, i) => {
            const checked = isChecked(c.id)
            const highlighted = i === highlightIndex
            return (
              <div
                key={c.id}
                role="option"
                aria-selected={checked}
                data-highlighted={highlighted ? 'true' : 'false'}
                className={`flex justify-between items-center px-3 py-2.5 cursor-pointer text-sm transition-colors duration-100 min-h-[44px] ${
                  highlighted ? 'bg-surface-2' : 'hover:bg-surface-2'
                }`}
                onClick={() => handleRowClick(c)}
              >
                <span className="truncate">{c.name}</span>
                {checked && (
                  <span className="text-accent font-semibold ml-2 flex-shrink-0" aria-hidden="true">✓</span>
                )}
              </div>
            )
          })}
          {showCreate && (
            <div
              role="option"
              aria-selected={false}
              data-highlighted={highlightIndex === filtered.length ? 'true' : 'false'}
              className={`flex items-center px-3 py-2.5 cursor-pointer text-sm min-h-[44px] text-accent ${
                highlightIndex === filtered.length ? 'bg-surface-2' : 'hover:bg-surface-2'
              }`}
              onClick={handleCreate}
            >
              Create "{search.trim()}"
            </div>
          )}
          {filtered.length === 0 && !showCreate && (
            <div className="px-3 py-2.5 text-sm text-text-dim italic">No collections</div>
          )}
        </div>
      </div>
    </div>
  )
}
