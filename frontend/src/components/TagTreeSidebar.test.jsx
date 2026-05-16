import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TagTreeSidebar } from './TagTreeSidebar'

const TAGS = [
  { id: 'a', name: 'Genre', parent_tag_id: null, position: 0 },
  { id: 'b', name: 'Rock', parent_tag_id: 'a', position: 0 },
  { id: 'c', name: 'Mood', parent_tag_id: null, position: 1 },
]

describe('TagTreeSidebar', () => {
  it('renders the "All" root and each top-level tag', () => {
    render(
      <TagTreeSidebar
        tags={TAGS}
        selectedTagId={null}
        onSelect={() => {}}
        onOpenManager={() => {}}
      />
    )
    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('Genre')).toBeInTheDocument()
    expect(screen.getByText('Mood')).toBeInTheDocument()
  })

  it('shows children when parent is expanded (default open)', () => {
    render(
      <TagTreeSidebar
        tags={TAGS}
        selectedTagId={null}
        onSelect={() => {}}
        onOpenManager={() => {}}
      />
    )
    expect(screen.getByText('Rock')).toBeInTheDocument()
  })

  it('hides children after collapsing the parent', () => {
    render(
      <TagTreeSidebar
        tags={TAGS}
        selectedTagId={null}
        onSelect={() => {}}
        onOpenManager={() => {}}
      />
    )
    // The chevron toggle button is the only <button> sibling of Genre's label.
    const buttons = screen.getAllByRole('button')
    // First button is the chevron next to Genre (Mood is a leaf so has no chevron;
    // last button is "Manage tags").
    fireEvent.click(buttons[0])
    expect(screen.queryByText('Rock')).not.toBeInTheDocument()
  })

  it('fires onSelect with tag id when a tag row is clicked', () => {
    const onSelect = vi.fn()
    render(
      <TagTreeSidebar
        tags={TAGS}
        selectedTagId={null}
        onSelect={onSelect}
        onOpenManager={() => {}}
      />
    )
    fireEvent.click(screen.getByText('Mood'))
    expect(onSelect).toHaveBeenCalledWith('c')
  })

  it('fires onSelect(null) when the "All" row is clicked', () => {
    const onSelect = vi.fn()
    render(
      <TagTreeSidebar
        tags={TAGS}
        selectedTagId={'a'}
        onSelect={onSelect}
        onOpenManager={() => {}}
      />
    )
    fireEvent.click(screen.getByText('All'))
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('shows empty-state copy when there are no tags', () => {
    render(
      <TagTreeSidebar
        tags={[]}
        selectedTagId={null}
        onSelect={() => {}}
        onOpenManager={() => {}}
      />
    )
    expect(screen.getByText('No tags yet')).toBeInTheDocument()
  })

  it('fires onOpenManager when "Manage tags" is clicked', () => {
    const onOpenManager = vi.fn()
    render(
      <TagTreeSidebar
        tags={TAGS}
        selectedTagId={null}
        onSelect={() => {}}
        onOpenManager={onOpenManager}
      />
    )
    fireEvent.click(screen.getByText('Manage tags'))
    expect(onOpenManager).toHaveBeenCalled()
  })
})
