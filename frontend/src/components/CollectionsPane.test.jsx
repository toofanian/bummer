import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CollectionsPane, { filterCollectionsByTag } from './CollectionsPane'
import { useIsMobile } from '../hooks/useIsMobile'

// Mock apiFetch so AlbumPromptBar's home-data fetch doesn't fail
vi.mock('../api', () => ({
  apiFetch: vi.fn(() => Promise.resolve({
    json: () => Promise.resolve({ recently_added: [], recently_played: [] }),
  })),
}))

vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: vi.fn().mockReturnValue(false),
}))

const COLLECTIONS = [
  { id: 'col-1', name: 'Road trip', album_count: 5 },
  { id: 'col-2', name: '90s classics', album_count: 12 },
]

const ALBUMS = [
  { service_id: 'alb-1', name: 'In Rainbows', artists: ['Radiohead'], image_url: 'http://img/1.jpg' },
  { service_id: 'alb-2', name: 'OK Computer', artists: ['Radiohead'], image_url: null },
]

const TAGS = [
  { id: 'tag-root', name: 'Mood', parent_tag_id: null, position: 0 },
  { id: 'tag-child', name: 'Chill', parent_tag_id: 'tag-root', position: 0 },
  { id: 'tag-other', name: 'Genre', parent_tag_id: null, position: 1 },
]

const baseDesktopProps = {
  collections: COLLECTIONS,
  onEnter: vi.fn(),
  onDelete: vi.fn(),
  onRename: vi.fn(),
  onCreate: vi.fn(),
  onFetchAlbums: () => Promise.resolve([]),
  tags: [],
  selectedTagId: null,
  onSelectTag: vi.fn(),
  viewMode: 'list',
  onViewModeChange: vi.fn(),
  onManageTags: vi.fn(),
  onOpenTagManager: vi.fn(),
  collectionTagsMap: {},
}

describe('CollectionsPane (desktop) — list view rendering', () => {
  it('renders all collection names', () => {
    render(<CollectionsPane {...baseDesktopProps} />)
    expect(screen.getByText('Road trip')).toBeInTheDocument()
    expect(screen.getByText('90s classics')).toBeInTheDocument()
  })

  it('shows empty state when no collections', () => {
    render(<CollectionsPane {...baseDesktopProps} collections={[]} />)
    expect(screen.getByText(/no collections/i)).toBeInTheDocument()
  })

  it('calls onEnter with collection when row is clicked', async () => {
    const onEnter = vi.fn()
    render(<CollectionsPane {...baseDesktopProps} onEnter={onEnter} />)
    await userEvent.click(screen.getByText('Road trip'))
    expect(onEnter).toHaveBeenCalledWith(COLLECTIONS[0])
  })

  it('fetches albums for each collection on mount (powers thumbnails)', async () => {
    const onFetchAlbums = vi.fn().mockResolvedValue(ALBUMS)
    render(<CollectionsPane {...baseDesktopProps} onFetchAlbums={onFetchAlbums} />)
    await waitFor(() => {
      expect(onFetchAlbums).toHaveBeenCalledWith('col-1')
      expect(onFetchAlbums).toHaveBeenCalledWith('col-2')
    })
  })

  it('does not show inline album list by default', () => {
    render(<CollectionsPane {...baseDesktopProps} />)
    expect(screen.queryByText('In Rainbows')).not.toBeInTheDocument()
  })

  it('renders + New Collection button which fires onCreate', async () => {
    const onCreate = vi.fn()
    render(<CollectionsPane {...baseDesktopProps} onCreate={onCreate} />)
    const btn = screen.getByRole('button', { name: /new collection/i })
    await userEvent.click(btn)
    expect(onCreate).toHaveBeenCalled()
  })

  it('renders the AlbumPromptBar', async () => {
    render(<CollectionsPane {...baseDesktopProps} session={{ access_token: 't' }} />)
    await waitFor(() => {
      expect(screen.getByTestId('album-prompt-bar')).toBeInTheDocument()
    })
  })

  it('renders the TagTreeSidebar with All entry', () => {
    render(<CollectionsPane {...baseDesktopProps} />)
    expect(screen.getByText('All')).toBeInTheDocument()
  })
})

describe('CollectionsPane (desktop) — view toggle', () => {
  it('renders CollectionList rows when viewMode is list', () => {
    render(<CollectionsPane {...baseDesktopProps} viewMode="list" />)
    const rows = screen.getAllByTestId('collection-list-row')
    expect(rows).toHaveLength(2)
  })

  it('switches to grid when viewMode is grid', () => {
    render(<CollectionsPane {...baseDesktopProps} viewMode="grid" />)
    // Grid view renders no list rows.
    expect(screen.queryByTestId('collection-list-row')).not.toBeInTheDocument()
    // Names still visible (rendered as cards instead).
    expect(screen.getByText('Road trip')).toBeInTheDocument()
    expect(screen.getByText('90s classics')).toBeInTheDocument()
  })

  it('clicking grid icon in toggle calls onViewModeChange("grid")', async () => {
    const onViewModeChange = vi.fn()
    render(<CollectionsPane {...baseDesktopProps} viewMode="list" onViewModeChange={onViewModeChange} />)
    await userEvent.click(screen.getByRole('button', { name: /grid view/i }))
    expect(onViewModeChange).toHaveBeenCalledWith('grid')
  })
})

describe('CollectionsPane (desktop) — tag filtering', () => {
  const filteredProps = {
    ...baseDesktopProps,
    tags: TAGS,
    collections: [
      { id: 'col-1', name: 'Road trip', album_count: 5 },
      { id: 'col-2', name: 'Chill nights', album_count: 7 },
      { id: 'col-3', name: 'Untagged', album_count: 3 },
    ],
    collectionTagsMap: {
      'col-1': ['tag-other'],
      'col-2': ['tag-child'],
      // col-3 has no tags
    },
  }

  it('shows all collections when selectedTagId is null', () => {
    render(<CollectionsPane {...filteredProps} selectedTagId={null} />)
    expect(screen.getByText('Road trip')).toBeInTheDocument()
    expect(screen.getByText('Chill nights')).toBeInTheDocument()
    expect(screen.getByText('Untagged')).toBeInTheDocument()
  })

  it('narrows to collections directly tagged with the selected tag', () => {
    render(<CollectionsPane {...filteredProps} selectedTagId="tag-other" />)
    expect(screen.getByText('Road trip')).toBeInTheDocument()
    expect(screen.queryByText('Chill nights')).not.toBeInTheDocument()
    expect(screen.queryByText('Untagged')).not.toBeInTheDocument()
  })

  it('includes descendants when a parent tag is selected', () => {
    // Selecting parent "Mood" should include collections tagged with "Chill"
    render(<CollectionsPane {...filteredProps} selectedTagId="tag-root" />)
    expect(screen.getByText('Chill nights')).toBeInTheDocument()
    expect(screen.queryByText('Road trip')).not.toBeInTheDocument()
  })
})

describe('filterCollectionsByTag (pure helper)', () => {
  it('returns all collections when selectedTagId is null', () => {
    const result = filterCollectionsByTag(
      [{ id: 'a' }, { id: 'b' }],
      [],
      null,
      {},
    )
    expect(result).toHaveLength(2)
  })

  it('returns only collections matching the selected tag', () => {
    const result = filterCollectionsByTag(
      [{ id: 'a' }, { id: 'b' }],
      [{ id: 't1', name: 'X', parent_tag_id: null, position: 0 }],
      't1',
      { a: ['t1'], b: [] },
    )
    expect(result).toEqual([{ id: 'a' }])
  })

  it('returns descendants when a parent tag is selected', () => {
    const result = filterCollectionsByTag(
      [{ id: 'a' }, { id: 'b' }],
      [
        { id: 't1', name: 'P', parent_tag_id: null, position: 0 },
        { id: 't2', name: 'C', parent_tag_id: 't1', position: 0 },
      ],
      't1',
      { a: ['t2'], b: [] },
    )
    expect(result).toEqual([{ id: 'a' }])
  })
})

describe('CollectionsPane mobile (legacy)', () => {
  beforeEach(() => {
    useIsMobile.mockReturnValue(true)
  })
  afterEach(() => {
    useIsMobile.mockReturnValue(false)
  })

  const mobileProps = {
    collections: [],
    onEnter: vi.fn(),
    onDelete: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onFetchAlbums: vi.fn().mockResolvedValue([]),
    albumCollectionMap: {},
    collectionsForPicker: [],
    session: { access_token: 'test' },
    onBulkAdd: vi.fn(),
    onCreateCollection: vi.fn(),
    onReorder: null,
    showCreate: false,
    onShowCreateChange: vi.fn(),
    createName: '',
    onCreateNameChange: vi.fn(),
    onCreateSubmit: vi.fn(),
  }

  it('renders create collection button when showCreate is false', () => {
    render(<CollectionsPane {...mobileProps} />)
    expect(screen.getByLabelText('Create collection')).toBeInTheDocument()
  })

  it('renders name input when showCreate is true', () => {
    render(<CollectionsPane {...mobileProps} showCreate={true} />)
    expect(screen.getByPlaceholderText(/collection name/i)).toBeInTheDocument()
  })

  it('renders mobile rows with collection-row testid', () => {
    render(<CollectionsPane {...mobileProps} collections={COLLECTIONS} />)
    expect(screen.getAllByTestId('collection-row')).toHaveLength(2)
  })

  it('does not render the desktop tag sidebar on mobile', () => {
    render(<CollectionsPane {...mobileProps} collections={COLLECTIONS} />)
    expect(screen.queryByText('All')).not.toBeInTheDocument()
  })
})
