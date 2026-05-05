import { render, screen } from '@testing-library/react'
import CollectionGrid from './CollectionGrid'

const COLLECTIONS = [
  { id: 'c1', name: 'First' },
  { id: 'c2', name: 'Second' },
  { id: 'c3', name: 'Third' },
]

const ALBUMS_BY_COLLECTION = {
  c1: [
    { service_id: 'a1', name: 'A1', image_url: 'http://img/1.jpg' },
  ],
  c2: [
    { service_id: 'a2', name: 'A2', image_url: 'http://img/2.jpg' },
    { service_id: 'a3', name: 'A3', image_url: 'http://img/3.jpg' },
  ],
  c3: [],
}

describe('CollectionGrid', () => {
  it('renders one card per collection', () => {
    render(<CollectionGrid collections={COLLECTIONS} albumsByCollection={ALBUMS_BY_COLLECTION} onOpen={() => {}} />)
    const cards = screen.getAllByTestId('collection-card')
    expect(cards).toHaveLength(3)
  })

  it('shows empty state when collections empty', () => {
    render(<CollectionGrid collections={[]} albumsByCollection={{}} onOpen={() => {}} />)
    expect(screen.getByText('No collections yet')).toBeInTheDocument()
  })

  it('passes correct albums to each card from albumsByCollection', () => {
    render(<CollectionGrid collections={COLLECTIONS} albumsByCollection={ALBUMS_BY_COLLECTION} onOpen={() => {}} />)
    // c1 has 1 album, c2 has 2, c3 has 0 -> total 3 imgs across mosaics
    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(3)
    expect(images.map(i => i.getAttribute('src'))).toEqual([
      'http://img/1.jpg',
      'http://img/2.jpg',
      'http://img/3.jpg',
    ])
  })

  it('passes empty array when collection missing from albumsByCollection', () => {
    render(<CollectionGrid collections={[{ id: 'cx', name: 'X' }]} albumsByCollection={{}} onOpen={() => {}} />)
    const cards = screen.getAllByTestId('collection-card')
    expect(cards).toHaveLength(1)
    expect(screen.queryAllByRole('img')).toHaveLength(0)
  })
})
