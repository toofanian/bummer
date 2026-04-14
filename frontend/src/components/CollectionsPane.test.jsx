import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CollectionsPane from './CollectionsPane'

const COLLECTIONS = [
  { id: 'col-1', name: 'Road trip', album_count: 5, updated_at: '2025-01-15T00:00:00Z' },
  { id: 'col-2', name: '90s classics', album_count: 12, updated_at: '2024-08-03T00:00:00Z' },
]

const ALBUMS = [
  { spotify_id: 'alb-1', name: 'In Rainbows', artists: ['Radiohead'], image_url: 'http://img/1.jpg' },
  { spotify_id: 'alb-2', name: 'OK Computer', artists: ['Radiohead'], image_url: null },
]

describe('CollectionsPane', () => {
  it('renders all collection names', () => {
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    expect(screen.getByText('Road trip')).toBeInTheDocument()
    expect(screen.getByText('90s classics')).toBeInTheDocument()
  })

  it('shows empty state when no collections', () => {
    render(
      <CollectionsPane
        collections={[]}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    expect(screen.getByText(/no collections/i)).toBeInTheDocument()
  })

  // --- Whole-row click navigates into collection ---

  it('calls onEnter with collection when collection row is clicked', async () => {
    const onEnter = vi.fn()
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={onEnter}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    // Click the row itself (the li element with role="button" or the row container)
    // We look for the collection row and click it
    const rows = screen.getAllByRole('listitem')
    await userEvent.click(rows[0])
    expect(onEnter).toHaveBeenCalledWith(COLLECTIONS[0])
  })

  it('calls onEnter when collection name text is clicked', async () => {
    const onEnter = vi.fn()
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={onEnter}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    await userEvent.click(screen.getByText('Road trip'))
    expect(onEnter).toHaveBeenCalledWith(COLLECTIONS[0])
  })

  it('calls onDelete with collection id when Delete is clicked', async () => {
    const onDelete = vi.fn()
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={onDelete}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    await userEvent.click(screen.getAllByRole('button', { name: /delete/i })[0])
    expect(onDelete).toHaveBeenCalledWith('col-1')
  })

  it('does not call onEnter when the delete button is clicked', async () => {
    const onEnter = vi.fn()
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={onEnter}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    await userEvent.click(screen.getAllByRole('button', { name: /delete/i })[0])
    expect(onEnter).not.toHaveBeenCalled()
  })

  // --- No expand/collapse pattern ---

  it('does not render expand arrow buttons', () => {
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    expect(screen.queryByRole('button', { name: /expand/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /collapse/i })).not.toBeInTheDocument()
  })

  it('does not show inline album list by default', () => {
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    // Should not render a vertical album list with names
    expect(screen.queryByText('In Rainbows')).not.toBeInTheDocument()
  })

  // --- Album art thumbnail strip ---

  it('fetches albums for each collection on mount and shows art thumbnails', async () => {
    const onFetchAlbums = vi.fn().mockResolvedValue(ALBUMS)
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={onFetchAlbums}
      />
    )
    await waitFor(() => {
      expect(onFetchAlbums).toHaveBeenCalledWith('col-1')
      expect(onFetchAlbums).toHaveBeenCalledWith('col-2')
    })
  })

  it('shows album art thumbnails in each collection row once loaded', async () => {
    const onFetchAlbums = vi.fn().mockResolvedValue(ALBUMS)
    render(
      <CollectionsPane
        collections={[COLLECTIONS[0]]}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={onFetchAlbums}
      />
    )
    await waitFor(() => {
      const img = screen.getByAltText('In Rainbows')
      expect(img).toBeInTheDocument()
      expect(img).toHaveAttribute('src', 'http://img/1.jpg')
    })
  })

  it('shows album count next to each collection name when album_count is provided', () => {
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    expect(screen.getByText('5 albums')).toBeInTheDocument()
    expect(screen.getByText('12 albums')).toBeInTheDocument()
  })

  it('shows formatted updated_at date for each collection', () => {
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    // '2025-01-15T00:00:00Z' -> 'Jan 2025'
    expect(screen.getByText(/Jan 2025/)).toBeInTheDocument()
    // '2024-08-03T00:00:00Z' -> 'Aug 2024'
    expect(screen.getByText(/Aug 2024/)).toBeInTheDocument()
  })

  it('shows metadata block with album count and date in a single combined span', () => {
    render(
      <CollectionsPane
        collections={[COLLECTIONS[0]]}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    // The metadata block should contain both the count and the date
    expect(screen.getByText(/5 albums/)).toBeInTheDocument()
    expect(screen.getByText(/Jan 2025/)).toBeInTheDocument()
  })

  // --- Sticky create-new-collection input at top ---

  it('has an input and button to create a new collection', () => {
    render(
      <CollectionsPane
        collections={[]}
        onEnter={() => {}}
        onDelete={() => {}}
        onCreate={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    expect(screen.getByPlaceholderText(/new collection/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
  })

  it('calls onCreate with name when form is submitted', async () => {
    const onCreate = vi.fn()
    render(
      <CollectionsPane
        collections={[]}
        onEnter={() => {}}
        onDelete={() => {}}
        onCreate={onCreate}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    await userEvent.type(screen.getByPlaceholderText(/new collection/i), 'Rainy day')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    expect(onCreate).toHaveBeenCalledWith('Rainy day')
  })

  it('clears the input after creating a collection', async () => {
    render(
      <CollectionsPane
        collections={[]}
        onEnter={() => {}}
        onDelete={() => {}}
        onCreate={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    const input = screen.getByPlaceholderText(/new collection/i)
    await userEvent.type(input, 'Rainy day')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    expect(input).toHaveValue('')
  })

  it('create input appears before the collection list in the DOM', () => {
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onCreate={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    const input = screen.getByPlaceholderText(/new collection/i)
    const firstCollectionName = screen.getByText('Road trip')
    // The input should appear before the collection list in DOM order
    expect(input.compareDocumentPosition(firstCollectionName)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })
})
