import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AlbumPromptRow from './AlbumPromptRow'

const ALBUMS = [
  { service_id: 'a1', name: 'Album One', image_url: 'https://example.com/1.jpg' },
  { service_id: 'a2', name: 'Album Two', image_url: 'https://example.com/2.jpg' },
  { service_id: 'a3', name: 'Album Three', image_url: null },
]

const COLLECTION_MAP = {
  a1: ['col1', 'col2'],
}

describe('AlbumPromptRow', () => {
  it('renders label and album thumbnails', () => {
    render(
      <AlbumPromptRow
        label="Recently Added"
        albums={ALBUMS}
        albumCollectionMap={{}}
        selectedIds={new Set()}
        onToggleSelect={() => {}}
      />
    )
    expect(screen.getByText('Recently Added')).toBeInTheDocument()
    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(2)
    expect(images[0]).toHaveAttribute('src', 'https://example.com/1.jpg')
  })

  it('shows collection count overlay for albums in collections', () => {
    render(
      <AlbumPromptRow
        label="Recently Added"
        albums={ALBUMS}
        albumCollectionMap={COLLECTION_MAP}
        selectedIds={new Set()}
        onToggleSelect={() => {}}
      />
    )
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('does not show overlay for albums not in any collection', () => {
    render(
      <AlbumPromptRow
        label="Recently Added"
        albums={ALBUMS}
        albumCollectionMap={COLLECTION_MAP}
        selectedIds={new Set()}
        onToggleSelect={() => {}}
      />
    )
    const overlays = screen.queryAllByTestId('collection-count-overlay')
    expect(overlays).toHaveLength(1)
  })

  it('renders placeholder for albums without image_url', () => {
    render(
      <AlbumPromptRow
        label="Recently Added"
        albums={ALBUMS}
        albumCollectionMap={{}}
        selectedIds={new Set()}
        onToggleSelect={() => {}}
      />
    )
    const placeholders = screen.getAllByTestId('album-placeholder')
    expect(placeholders).toHaveLength(1)
  })

  it('shows empty state when albums array is empty', () => {
    render(
      <AlbumPromptRow
        label="Recently Added"
        albums={[]}
        albumCollectionMap={{}}
        selectedIds={new Set()}
        onToggleSelect={() => {}}
      />
    )
    expect(screen.getByText('Recently Added')).toBeInTheDocument()
    expect(screen.getByText('Nothing yet')).toBeInTheDocument()
  })

  it('shows checkmark overlay when album is selected', () => {
    render(
      <AlbumPromptRow
        label="Recently Added"
        albums={ALBUMS}
        albumCollectionMap={{}}
        selectedIds={new Set(['a1'])}
        onToggleSelect={() => {}}
      />
    )
    const overlay = screen.getByTestId('selected-overlay')
    expect(overlay).toBeInTheDocument()
  })

  it('calls onToggleSelect with album service_id on click', async () => {
    const onToggleSelect = vi.fn()
    render(
      <AlbumPromptRow
        label="Recently Added"
        albums={ALBUMS}
        albumCollectionMap={{}}
        selectedIds={new Set()}
        onToggleSelect={onToggleSelect}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /select album one/i }))
    expect(onToggleSelect).toHaveBeenCalledWith('a1')
  })

  it('shows both checkmark and collection count when selected and in collections', () => {
    render(
      <AlbumPromptRow
        label="Recently Added"
        albums={ALBUMS}
        albumCollectionMap={COLLECTION_MAP}
        selectedIds={new Set(['a1'])}
        onToggleSelect={() => {}}
      />
    )
    expect(screen.getByTestId('selected-overlay')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})
