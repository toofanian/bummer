import { useState } from 'react'
import { X } from 'lucide-react'
import { Badge } from './ui/badge'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from './ui/command'

/**
 * Inline tag chip editor.
 *
 * Props:
 *   allTags          flat array of {id, name, parent_tag_id, position}
 *   selectedTagIds   array of tag ids currently applied
 *   onChange         (nextIds: string[]) => void
 *   onCreate         async (name: string) => Promise<{ id: string }>
 */
function TagPickerInput({ allTags = [], selectedTagIds = [], onChange, onCreate }) {
  const [query, setQuery] = useState('')

  const tagsById = new Map(allTags.map((t) => [t.id, t]))
  const selectedSet = new Set(selectedTagIds)
  const selectedTags = selectedTagIds
    .map((id) => tagsById.get(id))
    .filter(Boolean)

  const trimmed = query.trim()
  const lowerQuery = trimmed.toLowerCase()

  // Options: tags not already selected, filtered by query
  const options = allTags.filter((tag) => {
    if (selectedSet.has(tag.id)) return false
    if (!trimmed) return true
    return tag.name.toLowerCase().includes(lowerQuery)
  })

  const exactMatch = allTags.find(
    (tag) => tag.name.toLowerCase() === lowerQuery,
  )

  function handleRemove(tagId) {
    onChange?.(selectedTagIds.filter((id) => id !== tagId))
  }

  function handleSelect(tagId) {
    if (selectedSet.has(tagId)) return
    onChange?.([...selectedTagIds, tagId])
    setQuery('')
  }

  async function handleCreate(name) {
    if (!name) return
    const created = await onCreate?.(name)
    if (created?.id) {
      onChange?.([...selectedTagIds, created.id])
    }
    setQuery('')
  }

  async function handleKeyDown(event) {
    if (event.key !== 'Enter') return
    if (!trimmed) return

    // If there's an exact match (selected or not), prefer selecting it.
    if (exactMatch) {
      event.preventDefault()
      if (!selectedSet.has(exactMatch.id)) {
        handleSelect(exactMatch.id)
      } else {
        setQuery('')
      }
      return
    }

    // No exact match: only create if there are also no fuzzy options
    // (so users can still arrow-select a partial match if they want).
    if (options.length === 0) {
      event.preventDefault()
      await handleCreate(trimmed)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedTags.map((tag) => (
            <Badge
              key={tag.id}
              variant="secondary"
              className="gap-1 bg-bg-elevated text-text border border-border"
            >
              <span>{tag.name}</span>
              <button
                type="button"
                aria-label={`Remove ${tag.name}`}
                onClick={() => handleRemove(tag.id)}
                className="ml-1 inline-flex items-center justify-center rounded-sm text-text-dim hover:text-text"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Command
        shouldFilter={false}
        className="border border-border bg-bg-elevated"
        onKeyDown={handleKeyDown}
      >
        <CommandInput
          role="combobox"
          placeholder="Add a tag…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {options.length === 0 && trimmed && !exactMatch && (
            <CommandEmpty className="text-text-dim">
              Press Enter to create &ldquo;{trimmed}&rdquo;
            </CommandEmpty>
          )}
          {options.length > 0 && (
            <CommandGroup>
              {options.map((tag) => (
                <CommandItem
                  key={tag.id}
                  value={tag.name}
                  onSelect={() => handleSelect(tag.id)}
                >
                  {tag.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>
  )
}

export default TagPickerInput
