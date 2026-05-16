import { List, LayoutGrid } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

/**
 * Two-button toggle for collection view mode.
 *
 * Controlled component: parent owns the value. Persistence to localStorage
 * is handled separately by `useCollectionsViewMode`.
 *
 * @param {{ value: 'list' | 'grid', onChange: (next: 'list' | 'grid') => void }} props
 */
export function ViewToggle({ value, onChange }) {
  const handleValueChange = (groupValue) => {
    // Base UI ToggleGroup (multiple=false) emits an array; with one item
    // pressed, that array has one element. If the user clicks the active
    // item it does not toggle off (single-select), so we ignore empty.
    const next = groupValue?.[0]
    if (!next || next === value) return
    onChange(next)
  }

  return (
    <ToggleGroup
      value={[value]}
      onValueChange={handleValueChange}
      aria-label="Collections view mode"
    >
      <ToggleGroupItem value="list" aria-label="List view">
        <List className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="grid" aria-label="Grid view">
        <LayoutGrid className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
