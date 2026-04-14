import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AlbumTable from './AlbumTable'

const ALBUMS = [
  {
    spotify_id: 'id1',
    name: 'Love Deluxe',
    artists: ['Sade'],
    release_date: '1992-09-14',
    total_tracks: 8,
    image_url: 'https://example.com/cover1.jpg',
    added_at: '2021-03-15T00:00:00Z',
  },
  {
    spotify_id: 'id2',
    name: 'Room On Fire',
    artists: ['The Strokes'],
    release_date: '2003-10-28',
    total_tracks: 11,
    image_url: 'https://example.com/cover2.jpg',
    added_at: '2020-07-04T00:00:00Z',
  },
]

describe('AlbumTable', () => {
  it('renders column headers', () => {
    render(<AlbumTable albums={ALBUMS} />)

    expect(screen.getByRole('columnheader', { name: /album/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /artist/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /year/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /date added/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /tracks/i })).toBeInTheDocument()
  })

  it('renders one row per album', () => {
    render(<AlbumTable albums={ALBUMS} />)

    expect(screen.getAllByRole('row')).toHaveLength(ALBUMS.length + 1) // +1 for header row
  })

  it('renders album name and artist in each row', () => {
    render(<AlbumTable albums={ALBUMS} />)

    expect(screen.getByText('Love Deluxe')).toBeInTheDocument()
    expect(screen.getByText('Sade')).toBeInTheDocument()
    expect(screen.getByText('Room On Fire')).toBeInTheDocument()
    expect(screen.getByText('The Strokes')).toBeInTheDocument()
  })

  it('shows release year not full date', () => {
    render(<AlbumTable albums={ALBUMS} />)

    expect(screen.getByText('1992')).toBeInTheDocument()
    expect(screen.getByText('2003')).toBeInTheDocument()
    expect(screen.queryByText('1992-09-14')).not.toBeInTheDocument()
  })

  it('formats date added as a readable date', () => {
    render(<AlbumTable albums={ALBUMS} />)

    expect(screen.getByText('Mar 15, 2021')).toBeInTheDocument()
    expect(screen.getByText('Jul 4, 2020')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    render(<AlbumTable albums={[]} loading={true} />)

    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows empty state when no albums', () => {
    render(<AlbumTable albums={[]} loading={false} />)

    expect(screen.getByText(/no albums/i)).toBeInTheDocument()
  })

  it('sorts by album name ascending when header is clicked', async () => {
    render(<AlbumTable albums={ALBUMS} />)

    await userEvent.click(screen.getByRole('columnheader', { name: /album/i }))

    const rows = screen.getAllByRole('row').slice(1) // skip header
    expect(rows[0]).toHaveTextContent('Love Deluxe')
    expect(rows[1]).toHaveTextContent('Room On Fire')
  })

  it('sorts by album name descending on second click', async () => {
    render(<AlbumTable albums={ALBUMS} />)

    const header = screen.getByRole('columnheader', { name: /album/i })
    await userEvent.click(header)
    await userEvent.click(header)

    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Room On Fire')
    expect(rows[1]).toHaveTextContent('Love Deluxe')
  })

  it('renders a Tier column header', () => {
    render(<AlbumTable albums={ALBUMS} onTierChange={() => {}} />)
    expect(screen.getByRole('columnheader', { name: /tier/i })).toBeInTheDocument()
  })

  it('renders a TierSelector for each row', () => {
    render(<AlbumTable albums={ALBUMS} onTierChange={() => {}} />)
    expect(screen.getAllByRole('combobox')).toHaveLength(ALBUMS.length)
  })

  it('shows correct tier for each album', () => {
    const metadata = { id1: { tier: 'S' }, id2: { tier: null } }
    render(<AlbumTable albums={ALBUMS} metadata={metadata} onTierChange={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    expect(selects[0]).toHaveValue('S')
    expect(selects[1]).toHaveValue('')
  })

  it('calls onTierChange with spotify_id and tier when tier is changed', async () => {
    const onTierChange = vi.fn()
    render(<AlbumTable albums={ALBUMS} metadata={{}} onTierChange={onTierChange} />)

    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], 'A')

    expect(onTierChange).toHaveBeenCalledWith('id1', 'A')
  })
})
