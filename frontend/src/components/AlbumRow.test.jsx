import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import AlbumRow from './AlbumRow'

const ALBUMS = [
  { spotify_id: 'a1', name: 'Album One', artists: ['Artist A'], image_url: 'https://img/1.jpg' },
  { spotify_id: 'a2', name: 'Album Two', artists: ['Artist B', 'Artist C'], image_url: 'https://img/2.jpg' },
]

describe('AlbumRow', () => {
  it('renders section title', () => {
    render(<AlbumRow title="Today" albums={ALBUMS} onPlay={() => {}} />)
    expect(screen.getByText('Today')).toBeInTheDocument()
  })

  it('renders album cards with name and artist', () => {
    render(<AlbumRow title="Today" albums={ALBUMS} onPlay={() => {}} />)
    expect(screen.getByText('Album One')).toBeInTheDocument()
    expect(screen.getByText('Artist A')).toBeInTheDocument()
    expect(screen.getByText('Album Two')).toBeInTheDocument()
    expect(screen.getByText('Artist B, Artist C')).toBeInTheDocument()
  })

  it('renders album art images', () => {
    render(<AlbumRow title="Today" albums={ALBUMS} onPlay={() => {}} />)
    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(2)
    expect(images[0]).toHaveAttribute('src', 'https://img/1.jpg')
  })

  it('calls onPlay with spotify_id on click', () => {
    const onPlay = vi.fn()
    render(<AlbumRow title="Today" albums={ALBUMS} onPlay={onPlay} />)
    fireEvent.click(screen.getByText('Album One').closest('[data-testid]'))
    expect(onPlay).toHaveBeenCalledWith('a1')
  })

  it('renders nothing when albums is empty', () => {
    const { container } = render(<AlbumRow title="Today" albums={[]} onPlay={() => {}} />)
    expect(container.innerHTML).toBe('')
  })

  it('uses grid layout classes on the container', () => {
    render(<AlbumRow title="Today" albums={ALBUMS} onPlay={() => {}} />)
    const container = screen.getByText('Album One').closest('[data-testid]').parentElement
    expect(container.className).toContain('md:grid')
  })

  it('applies hover scale class to album cards', () => {
    render(<AlbumRow title="Today" albums={ALBUMS} onPlay={() => {}} />)
    const card = screen.getByTestId('album-card-a1')
    expect(card.className).toContain('md:hover:scale-[1.03]')
  })

  it('applies two-row grid cap styles on the container', () => {
    render(<AlbumRow title="Today" albums={ALBUMS} onPlay={() => {}} />)
    const container = screen.getByText('Album One').closest('[data-testid]').parentElement
    expect(container.style.gridTemplateRows).toBe('repeat(2, auto)')
    expect(container.style.gridAutoRows).toBe('0px')
  })

  it('uses rounded-md on album images', () => {
    render(<AlbumRow title="Today" albums={ALBUMS} onPlay={() => {}} />)
    const img = screen.getAllByRole('img')[0]
    expect(img.className).toContain('rounded-md')
  })
})
