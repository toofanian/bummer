import { render, screen } from '@testing-library/react'
import AlbumArtStrip from './AlbumArtStrip'

const ALBUMS = [
  { service_id: 'a1', name: 'Album One', image_url: 'http://img/1.jpg' },
  { service_id: 'a2', name: 'Album Two', image_url: 'http://img/2.jpg' },
  { service_id: 'a3', name: 'Album Three', image_url: null },
]

describe('AlbumArtStrip', () => {
  it('renders an img for each album with an image_url', () => {
    render(<AlbumArtStrip albums={ALBUMS} />)
    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(2)
    expect(images[0]).toHaveAttribute('src', 'http://img/1.jpg')
    expect(images[1]).toHaveAttribute('src', 'http://img/2.jpg')
  })

  it('renders a placeholder div for albums without image_url', () => {
    render(<AlbumArtStrip albums={ALBUMS} />)
    const placeholders = document.querySelectorAll('[aria-hidden="true"]')
    expect(placeholders).toHaveLength(1)
  })

  it('renders nothing when albums is empty', () => {
    const { container } = render(<AlbumArtStrip albums={[]} />)
    expect(container.querySelectorAll('img')).toHaveLength(0)
  })

  it('applies custom size to images', () => {
    render(<AlbumArtStrip albums={[ALBUMS[0]]} size={32} />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('width', '32')
    expect(img).toHaveAttribute('height', '32')
  })

  it('defaults to 40px size', () => {
    render(<AlbumArtStrip albums={[ALBUMS[0]]} />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('width', '40')
    expect(img).toHaveAttribute('height', '40')
  })
})
