import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CollectionsBubble from './CollectionsBubble'

const COLLECTIONS = [
  { id: 'col-1', name: 'Road trip' },
  { id: 'col-2', name: '90s classics' },
]

describe('CollectionsBubble', () => {
  // --- Badge rendering ---

  it('shows "+" when album belongs to 0 collections', () => {
    render(
      <CollectionsBubble
        albumCollectionIds={[]}
        collections={COLLECTIONS}
        onToggle={() => {}}
        onCreate={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: /add to collection/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add to collection/i })).toHaveTextContent('+')
  })

  it('shows the count when album belongs to 1 or more collections', () => {
    render(
      <CollectionsBubble
        albumCollectionIds={['col-1', 'col-2']}
        collections={COLLECTIONS}
        onToggle={() => {}}
        onCreate={() => {}}
      />
    )
    const btn = screen.getByRole('button', { name: /collections/i })
    expect(btn).toHaveTextContent('2')
  })

  it('shows count of 1 when album belongs to exactly 1 collection', () => {
    render(
      <CollectionsBubble
        albumCollectionIds={['col-1']}
        collections={COLLECTIONS}
        onToggle={() => {}}
        onCreate={() => {}}
      />
    )
    const btn = screen.getByRole('button', { name: /collections/i })
    expect(btn).toHaveTextContent('1')
  })

  // --- Popover open/close ---

  it('popover is closed by default', () => {
    render(
      <CollectionsBubble
        albumCollectionIds={[]}
        collections={COLLECTIONS}
        onToggle={() => {}}
        onCreate={() => {}}
      />
    )
    expect(screen.queryByText('Road trip')).not.toBeInTheDocument()
  })

  it('opens popover when badge is clicked', async () => {
    render(
      <CollectionsBubble
        albumCollectionIds={[]}
        collections={COLLECTIONS}
        onToggle={() => {}}
        onCreate={() => {}}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /add to collection/i }))
    expect(screen.getByText('Road trip')).toBeInTheDocument()
    expect(screen.getByText('90s classics')).toBeInTheDocument()
  })

  it('closes popover when badge is clicked again', async () => {
    render(
      <CollectionsBubble
        albumCollectionIds={[]}
        collections={COLLECTIONS}
        onToggle={() => {}}
        onCreate={() => {}}
      />
    )
    const btn = screen.getByRole('button', { name: /add to collection/i })
    await userEvent.click(btn)
    await userEvent.click(btn)
    expect(screen.queryByText('Road trip')).not.toBeInTheDocument()
  })

  it('closes popover on Escape key', async () => {
    render(
      <CollectionsBubble
        albumCollectionIds={[]}
        collections={COLLECTIONS}
        onToggle={() => {}}
        onCreate={() => {}}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /add to collection/i }))
    expect(screen.getByText('Road trip')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByText('Road trip')).not.toBeInTheDocument()
  })

  // --- Custom checkmark indicator and toggling ---

  it('renders a menuitemcheckbox row for each collection when popover is open', async () => {
    render(
      <CollectionsBubble
        albumCollectionIds={[]}
        collections={COLLECTIONS}
        onToggle={() => {}}
        onCreate={() => {}}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /add to collection/i }))
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    const rows = screen.getAllByRole('menuitemcheckbox')
    expect(rows).toHaveLength(COLLECTIONS.length)
  })

  it('shows a checkmark indicator only for collections the album belongs to', async () => {
    render(
      <CollectionsBubble
        albumCollectionIds={['col-1']}
        collections={COLLECTIONS}
        onToggle={() => {}}
        onCreate={() => {}}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /collections/i }))
    const rows = screen.getAllByRole('menuitemcheckbox')
    // first row (col-1) is checked — aria-checked true and checkmark present
    expect(rows[0]).toHaveAttribute('aria-checked', 'true')
    expect(rows[0].querySelector('[aria-hidden="true"]')).toHaveTextContent('✓')
    // second row (col-2) is not checked — aria-checked false and no checkmark
    expect(rows[1]).toHaveAttribute('aria-checked', 'false')
    expect(rows[1].querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('calls onToggle with collectionId and true when an unchecked row is clicked', async () => {
    const onToggle = vi.fn()
    render(
      <CollectionsBubble
        albumCollectionIds={[]}
        collections={COLLECTIONS}
        onToggle={onToggle}
        onCreate={() => {}}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /add to collection/i }))
    await userEvent.click(screen.getAllByRole('menuitemcheckbox')[0])
    expect(onToggle).toHaveBeenCalledWith('col-1', true)
  })

  it('calls onToggle with collectionId and false when a checked row is clicked', async () => {
    const onToggle = vi.fn()
    render(
      <CollectionsBubble
        albumCollectionIds={['col-1']}
        collections={COLLECTIONS}
        onToggle={onToggle}
        onCreate={() => {}}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /collections/i }))
    await userEvent.click(screen.getAllByRole('menuitemcheckbox')[0])
    expect(onToggle).toHaveBeenCalledWith('col-1', false)
  })

  // --- Create new collection ---

  it('has a text input at the top of the popover for creating a new collection', async () => {
    render(
      <CollectionsBubble
        albumCollectionIds={[]}
        collections={COLLECTIONS}
        onToggle={() => {}}
        onCreate={() => {}}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /add to collection/i }))
    expect(screen.getByPlaceholderText(/new collection/i)).toBeInTheDocument()
  })

  it('calls onCreate with the new name when Enter is pressed in the input', async () => {
    const onCreate = vi.fn()
    render(
      <CollectionsBubble
        albumCollectionIds={[]}
        collections={COLLECTIONS}
        onToggle={() => {}}
        onCreate={onCreate}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /add to collection/i }))
    await userEvent.type(screen.getByPlaceholderText(/new collection/i), 'Chill vibes{Enter}')
    expect(onCreate).toHaveBeenCalledWith('Chill vibes')
  })

  it('clears the input after creating a collection', async () => {
    render(
      <CollectionsBubble
        albumCollectionIds={[]}
        collections={COLLECTIONS}
        onToggle={() => {}}
        onCreate={() => {}}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /add to collection/i }))
    const input = screen.getByPlaceholderText(/new collection/i)
    await userEvent.type(input, 'Chill vibes{Enter}')
    expect(input).toHaveValue('')
  })

  it('shows empty state when no collections exist yet', async () => {
    render(
      <CollectionsBubble
        albumCollectionIds={[]}
        collections={[]}
        onToggle={() => {}}
        onCreate={() => {}}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /add to collection/i }))
    expect(screen.getByText(/no collections/i)).toBeInTheDocument()
  })
})
