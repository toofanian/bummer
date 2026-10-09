import { render, screen, fireEvent } from '@testing-library/react'
import CollectionCard from './CollectionCard'

const ALBUMS = [
  { service_id: 'a1', name: 'Album One', image_url: 'http://img/1.jpg' },
  { service_id: 'a2', name: 'Album Two', image_url: 'http://img/2.jpg' },
  { service_id: 'a3', name: 'Album Three', image_url: 'http://img/3.jpg' },
  { service_id: 'a4', name: 'Album Four', image_url: 'http://img/4.jpg' },
  { service_id: 'a5', name: 'Album Five', image_url: 'http://img/5.jpg' },
]

const COLLECTION = { id: 'c1', name: 'My Collection', cover_album_id: null }

describe('CollectionCard', () => {
  it('renders 2x2 mosaic from first 4 albums', () => {
    render(<CollectionCard collection={COLLECTION} albums={ALBUMS} onOpen={() => {}} />)
    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(4)
    expect(images[0]).toHaveAttribute('src', 'http://img/1.jpg')
    expect(images[3]).toHaveAttribute('src', 'http://img/4.jpg')
  })

  it('renders single full-bleed cover when cover_album_id matches an album', () => {
    const collection = { ...COLLECTION, cover_album_id: 'a3' }
    render(<CollectionCard collection={collection} albums={ALBUMS} onOpen={() => {}} />)
    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(1)
    expect(images[0]).toHaveAttribute('src', 'http://img/3.jpg')
  })

  it('falls back to mosaic if cover_album_id does not match any album', () => {
    const collection = { ...COLLECTION, cover_album_id: 'missing' }
    render(<CollectionCard collection={collection} albums={ALBUMS} onOpen={() => {}} />)
    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(4)
  })

  it('renders gray placeholder when albums empty', () => {
    const { container } = render(<CollectionCard collection={COLLECTION} albums={[]} onOpen={() => {}} />)
    expect(container.querySelectorAll('img')).toHaveLength(0)
    const placeholder = container.querySelector('[data-testid="collection-card-placeholder"]')
    expect(placeholder).toBeTruthy()
  })

  it('click calls onOpen with collection object', () => {
    const onOpen = vi.fn()
    render(<CollectionCard collection={COLLECTION} albums={ALBUMS} onOpen={onOpen} />)
    fireEvent.click(screen.getByTestId('collection-card'))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith(COLLECTION)
  })

  it('renders collection name as text', () => {
    render(<CollectionCard collection={COLLECTION} albums={ALBUMS} onOpen={() => {}} />)
    expect(screen.getByText('My Collection')).toBeInTheDocument()
  })
})
