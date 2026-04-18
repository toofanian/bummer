import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CollectionsPane from './CollectionsPane'

const TWO_DAYS_AGO = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
const FIVE_DAYS_AGO = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()

const COLLECTIONS = [
  { id: 'col-1', name: 'Road trip', album_count: 5, updated_at: TWO_DAYS_AGO },
  { id: 'col-2', name: '90s classics', album_count: 12, updated_at: FIVE_DAYS_AGO },
]

const ALBUMS = [
  { service_id: 'alb-1', name: 'In Rainbows', artists: ['Radiohead'], image_url: 'http://img/1.jpg' },
  { service_id: 'alb-2', name: 'OK Computer', artists: ['Radiohead'], image_url: null },
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
    await userEvent.click(screen.getByText('Road trip'))
    expect(onEnter).toHaveBeenCalledWith(COLLECTIONS[0])
  })

  it('calls onDelete with collection id when Delete is confirmed (two-click flow)', async () => {
    const onDelete = vi.fn()
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={onDelete}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    await userEvent.click(screen.getAllByRole('button', { name: /^delete$/i })[0])
    await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
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
    expect(screen.queryByText('In Rainbows')).not.toBeInTheDocument()
  })

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

  it('renders AlbumArtStrip with 40px thumbnails for each collection', async () => {
    const albums = [
      { service_id: 'alb-1', name: 'In Rainbows', image_url: 'http://img/1.jpg' },
    ]
    const onFetchAlbums = vi.fn().mockResolvedValue(albums)
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
      expect(img).toHaveAttribute('width', '62')
    })
  })

  it('shows album count badge', () => {
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('shows description as subtitle on collection card', () => {
    const cols = [{ id: '1', name: 'Late Night', album_count: 5, description: 'low energy, headphone albums' }]
    render(<CollectionsPane collections={cols} onEnter={() => {}} onDelete={() => {}} onCreate={() => {}} onFetchAlbums={vi.fn().mockResolvedValue([])} />)
    expect(screen.getByText('low energy, headphone albums')).toBeInTheDocument()
  })

  it('does not show description when null', () => {
    const cols = [{ id: '1', name: 'Late Night', album_count: 5, description: null }]
    render(<CollectionsPane collections={cols} onEnter={() => {}} onDelete={() => {}} onCreate={() => {}} onFetchAlbums={vi.fn().mockResolvedValue([])} />)
    expect(screen.queryByText('low energy')).not.toBeInTheDocument()
  })

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
    expect(input.compareDocumentPosition(firstCollectionName)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('collection rows have a minimum height to prevent layout shift', () => {
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    const firstRow = screen.getByText('Road trip').closest('[data-testid="collection-row"]')
    expect(firstRow).toBeInTheDocument()
    expect(firstRow.style.minHeight).toBe('62px')
  })

  it('does not use a multi-column grid layout', () => {
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    const gridEl = document.querySelector('.grid')
    expect(gridEl).not.toBeInTheDocument()
  })

  // --- Delete confirmation ---

  it('delete button shows confirmation on first click', async () => {
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    const deleteBtns = screen.getAllByRole('button', { name: /^delete$/i })
    await userEvent.click(deleteBtns[0])
    expect(screen.getByRole('button', { name: /confirm delete/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('confirm delete calls onDelete', async () => {
    const onDelete = vi.fn()
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={onDelete}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    const deleteBtns = screen.getAllByRole('button', { name: /^delete$/i })
    await userEvent.click(deleteBtns[0])
    const confirmBtn = screen.getByRole('button', { name: /confirm delete/i })
    await userEvent.click(confirmBtn)
    expect(onDelete).toHaveBeenCalledWith('col-1')
  })

  it('cancel delete does not call onDelete', async () => {
    const onDelete = vi.fn()
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={onDelete}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    const deleteBtns = screen.getAllByRole('button', { name: /^delete$/i })
    await userEvent.click(deleteBtns[0])
    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    await userEvent.click(cancelBtn)
    expect(onDelete).not.toHaveBeenCalled()
  })
})
