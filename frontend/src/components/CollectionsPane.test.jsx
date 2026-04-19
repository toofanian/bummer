import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CollectionsPane from './CollectionsPane'

// Mock apiFetch so AlbumPromptBar's home-data fetch doesn't fail
vi.mock('../api', () => ({
  apiFetch: vi.fn(() => Promise.resolve({
    json: () => Promise.resolve({ recently_added: [], today: [], this_week: [] }),
  })),
}))

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

  it('calls onDelete with collection id when Delete is confirmed (three-click flow)', async () => {
    const onDelete = vi.fn()
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={onDelete}
        onRename={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    await userEvent.click(screen.getAllByRole('button', { name: /more options/i })[0])
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    expect(onDelete).toHaveBeenCalledWith('col-1')
  })

  it('does not call onEnter when the menu button is clicked', async () => {
    const onEnter = vi.fn()
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={onEnter}
        onDelete={() => {}}
        onRename={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    await userEvent.click(screen.getAllByRole('button', { name: /more options/i })[0])
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
    expect(screen.getByText('5 albums')).toBeInTheDocument()
    expect(screen.getByText('12 albums')).toBeInTheDocument()
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

  it('does not render a create input or Create button', () => {
    render(
      <CollectionsPane
        collections={[]}
        onEnter={() => {}}
        onDelete={() => {}}
        onCreate={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    expect(screen.queryByPlaceholderText(/new collection/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create/i })).not.toBeInTheDocument()
  })

  it('art strip container has fixed height to prevent layout shift', () => {
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    const firstRow = screen.getByText('Road trip').closest('[data-testid="collection-row"]')
    // The inner layout container (desktop: flex row, mobile: strip wrapper) has a fixed height
    const fixedHeightEl = firstRow.querySelector('[style*="height: 62px"], [style*="height:62px"]')
    expect(fixedHeightEl).toBeInTheDocument()
  })

  it('always renders album art strip area even before albums load', () => {
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    // Strip container should exist immediately (not conditionally rendered)
    const firstRow = screen.getByText('Road trip').closest('[data-testid="collection-row"]')
    const fixedHeightEl = firstRow.querySelector('[style*="height: 62px"], [style*="height:62px"]')
    expect(fixedHeightEl).toBeInTheDocument()
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

  // --- Three-dot menu ---

  it('shows a three-dot menu button on each collection row', () => {
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onRename={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    const menuBtns = screen.getAllByRole('button', { name: /more options/i })
    expect(menuBtns).toHaveLength(2)
  })

  it('opens menu with Rename and Delete options on click', async () => {
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onRename={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    await userEvent.click(screen.getAllByRole('button', { name: /more options/i })[0])
    expect(screen.getByRole('button', { name: /^rename$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
  })

  it('enters inline rename mode when Rename is clicked from menu', async () => {
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onRename={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    await userEvent.click(screen.getAllByRole('button', { name: /more options/i })[0])
    await userEvent.click(screen.getByRole('button', { name: /^rename$/i }))
    expect(screen.getByDisplayValue('Road trip')).toBeInTheDocument()
  })

  it('calls onRename with new name on Enter', async () => {
    const onRename = vi.fn()
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onRename={onRename}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    await userEvent.click(screen.getAllByRole('button', { name: /more options/i })[0])
    await userEvent.click(screen.getByRole('button', { name: /^rename$/i }))
    const input = screen.getByDisplayValue('Road trip')
    await userEvent.clear(input)
    await userEvent.type(input, 'Summer vibes{Enter}')
    expect(onRename).toHaveBeenCalledWith('col-1', 'Summer vibes')
  })

  it('cancels rename on Escape without calling onRename', async () => {
    const onRename = vi.fn()
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onRename={onRename}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    await userEvent.click(screen.getAllByRole('button', { name: /more options/i })[0])
    await userEvent.click(screen.getByRole('button', { name: /^rename$/i }))
    await userEvent.keyboard('{Escape}')
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.getByText('Road trip')).toBeInTheDocument()
  })

  it('does not call onRename if name is unchanged', async () => {
    const onRename = vi.fn()
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onRename={onRename}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    await userEvent.click(screen.getAllByRole('button', { name: /more options/i })[0])
    await userEvent.click(screen.getByRole('button', { name: /^rename$/i }))
    await userEvent.keyboard('{Enter}')
    expect(onRename).not.toHaveBeenCalled()
  })

  it('does not call onRename if name is empty', async () => {
    const onRename = vi.fn()
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onRename={onRename}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    await userEvent.click(screen.getAllByRole('button', { name: /more options/i })[0])
    await userEvent.click(screen.getByRole('button', { name: /^rename$/i }))
    const input = screen.getByDisplayValue('Road trip')
    await userEvent.clear(input)
    await userEvent.keyboard('{Enter}')
    expect(onRename).not.toHaveBeenCalled()
  })

  // --- Delete confirmation ---

  it('delete button shows confirmation via menu', async () => {
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onRename={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    await userEvent.click(screen.getAllByRole('button', { name: /more options/i })[0])
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
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
        onRename={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    await userEvent.click(screen.getAllByRole('button', { name: /more options/i })[0])
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
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
        onRename={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    await userEvent.click(screen.getAllByRole('button', { name: /more options/i })[0])
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    await userEvent.click(cancelBtn)
    expect(onDelete).not.toHaveBeenCalled()
  })

  // --- Drag reorder ---

  it('renders drag handles when onReorder prop is provided', () => {
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
        onReorder={() => {}}
      />
    )
    const handles = screen.getAllByRole('button', { name: /drag to reorder/i })
    expect(handles).toHaveLength(2)
  })

  it('does not render drag handles when onReorder is not provided', () => {
    render(
      <CollectionsPane
        collections={COLLECTIONS}
        onEnter={() => {}}
        onDelete={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
      />
    )
    expect(screen.queryByRole('button', { name: /drag to reorder/i })).not.toBeInTheDocument()
  })

  it('renders AlbumPromptBar when prompt bar props are provided', async () => {
    const { apiFetch } = await import('../api')
    apiFetch.mockResolvedValue({
      json: () => Promise.resolve({
        recently_added: [{ service_id: 'ra1', name: 'New Album', image_url: 'https://example.com/new.jpg' }],
        today: [],
        this_week: [],
      }),
    })
    render(
      <CollectionsPane
        collections={[]}
        onEnter={() => {}}
        onDelete={() => {}}
        onCreate={() => {}}
        onFetchAlbums={() => Promise.resolve([])}
        albumCollectionMap={{}}
        collectionsForPicker={[]}
        session={{ access_token: 'test' }}
        onBulkAdd={() => {}}
        onCreateCollection={() => {}}
      />
    )
    await waitFor(() => {
      expect(screen.getByTestId('album-prompt-bar')).toBeInTheDocument()
    })
  })
})
