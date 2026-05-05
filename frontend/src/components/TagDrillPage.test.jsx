import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TagDrillPage from './TagDrillPage'

const TAGS = [
  { id: 'tag-mood', name: 'Mood', parent_tag_id: null, position: 0 },
  { id: 'tag-chill', name: 'Chill', parent_tag_id: 'tag-mood', position: 0 },
  { id: 'tag-hype', name: 'Hype', parent_tag_id: 'tag-mood', position: 1 },
  { id: 'tag-genre', name: 'Genre', parent_tag_id: null, position: 1 },
]

const COLLECTIONS = [
  { id: 'col-1', name: 'Road trip', album_count: 5 },
  { id: 'col-2', name: 'Chill nights', album_count: 7 },
  { id: 'col-3', name: 'Untagged', album_count: 3 },
]

const COLLECTION_TAGS_MAP = {
  'col-1': ['tag-genre'],
  'col-2': ['tag-chill'],
  // col-3 has no tags
}

const baseProps = {
  tags: TAGS,
  collections: COLLECTIONS,
  collectionTagsMap: COLLECTION_TAGS_MAP,
  albumsByCollection: {},
  currentTagId: null,
  onSelectTag: vi.fn(),
  onOpenCollection: vi.fn(),
  servingPlatter: <div data-testid="serving-platter">platter</div>,
}

describe('TagDrillPage — root view', () => {
  it('renders Collections header', () => {
    render(<TagDrillPage {...baseProps} />)
    expect(screen.getByText('Collections')).toBeInTheDocument()
  })

  it('renders root tags as rows', () => {
    render(<TagDrillPage {...baseProps} />)
    expect(screen.getByText('Mood')).toBeInTheDocument()
    expect(screen.getByText('Genre')).toBeInTheDocument()
    // Child tags not shown at root level
    expect(screen.queryByText('Chill')).not.toBeInTheDocument()
  })

  it('shows all collections in grid at root', () => {
    render(<TagDrillPage {...baseProps} />)
    expect(screen.getByText('Road trip')).toBeInTheDocument()
    expect(screen.getByText('Chill nights')).toBeInTheDocument()
    expect(screen.getByText('Untagged')).toBeInTheDocument()
  })

  it('renders serving platter at root', () => {
    render(<TagDrillPage {...baseProps} />)
    expect(screen.getByTestId('serving-platter')).toBeInTheDocument()
  })

  it('tapping a root tag calls onSelectTag(tagId)', async () => {
    const onSelectTag = vi.fn()
    render(<TagDrillPage {...baseProps} onSelectTag={onSelectTag} />)
    await userEvent.click(screen.getByText('Mood'))
    expect(onSelectTag).toHaveBeenCalledWith('tag-mood')
  })
})

describe('TagDrillPage — tag view', () => {
  it('shows tag name and back button', () => {
    render(<TagDrillPage {...baseProps} currentTagId="tag-mood" />)
    expect(screen.getByText('Mood')).toBeInTheDocument()
    expect(screen.getByLabelText(/back/i)).toBeInTheDocument()
  })

  it('shows child tags', () => {
    render(<TagDrillPage {...baseProps} currentTagId="tag-mood" />)
    expect(screen.getByText('Chill')).toBeInTheDocument()
    expect(screen.getByText('Hype')).toBeInTheDocument()
  })

  it('shows collections under this tag including descendants', () => {
    render(<TagDrillPage {...baseProps} currentTagId="tag-mood" />)
    // col-2 has tag-chill (descendant of tag-mood)
    expect(screen.getByText('Chill nights')).toBeInTheDocument()
    // col-1 has tag-genre, NOT descendant of mood
    expect(screen.queryByText('Road trip')).not.toBeInTheDocument()
    // col-3 untagged
    expect(screen.queryByText('Untagged')).not.toBeInTheDocument()
  })

  it('does NOT render serving platter when inside a tag', () => {
    render(<TagDrillPage {...baseProps} currentTagId="tag-mood" />)
    expect(screen.queryByTestId('serving-platter')).not.toBeInTheDocument()
  })

  it('back button at root tag (parent null) calls onSelectTag(null)', async () => {
    const onSelectTag = vi.fn()
    render(<TagDrillPage {...baseProps} currentTagId="tag-mood" onSelectTag={onSelectTag} />)
    await userEvent.click(screen.getByLabelText(/back/i))
    expect(onSelectTag).toHaveBeenCalledWith(null)
  })

  it('back button at child tag calls onSelectTag(parentId)', async () => {
    const onSelectTag = vi.fn()
    render(<TagDrillPage {...baseProps} currentTagId="tag-chill" onSelectTag={onSelectTag} />)
    await userEvent.click(screen.getByLabelText(/back/i))
    expect(onSelectTag).toHaveBeenCalledWith('tag-mood')
  })

  it('tapping a child tag drills deeper', async () => {
    const onSelectTag = vi.fn()
    render(<TagDrillPage {...baseProps} currentTagId="tag-mood" onSelectTag={onSelectTag} />)
    await userEvent.click(screen.getByText('Chill'))
    expect(onSelectTag).toHaveBeenCalledWith('tag-chill')
  })

  it('shows empty message when tag has no children and no collections', () => {
    render(<TagDrillPage {...baseProps} currentTagId="tag-hype" />)
    expect(screen.getByText(/no collections under this tag/i)).toBeInTheDocument()
  })
})
