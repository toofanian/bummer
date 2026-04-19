import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AlbumPromptBar from './AlbumPromptBar'
import { vi } from 'vitest'

vi.mock('../api', () => ({
  apiFetch: vi.fn(),
}))

import { apiFetch } from '../api'

const COLLECTIONS = [
  { id: 'col1', name: 'Chill' },
  { id: 'col2', name: 'Workout' },
]

const HOME_DATA = {
  recently_added: [
    { service_id: 'ra1', name: 'New Album', image_url: 'https://example.com/new.jpg' },
  ],
  recently_played: [
    { service_id: 'rp1', name: 'Played Today', image_url: 'https://example.com/today.jpg' },
    { service_id: 'rp2', name: 'Played This Week', image_url: 'https://example.com/week.jpg' },
  ],
}

function renderBar(overrides = {}) {
  const defaults = {
    albumCollectionMap: {},
    collections: COLLECTIONS,
    session: { access_token: 'test-token' },
    onBulkAdd: vi.fn(),
    onCreate: vi.fn(),
  }
  return render(<AlbumPromptBar {...defaults} {...overrides} />)
}

describe('AlbumPromptBar', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({
      json: () => Promise.resolve(HOME_DATA),
    })
  })

  it('fetches home data and renders album thumbnails', async () => {
    renderBar()
    await waitFor(() => {
      expect(screen.getByAltText('New Album')).toBeInTheDocument()
      expect(screen.getByAltText('Played Today')).toBeInTheDocument()
    })
  })

  it('does not render action button when no albums selected', async () => {
    renderBar()
    await waitFor(() => {
      expect(screen.getByAltText('New Album')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /add to collection/i })).not.toBeInTheDocument()
  })

  it('shows action button after selecting an album', async () => {
    renderBar()
    await waitFor(() => {
      expect(screen.getByAltText('New Album')).toBeInTheDocument()
    })
    await userEvent.click(screen.getByRole('button', { name: /select new album/i }))
    expect(screen.getByRole('button', { name: /add to collection/i })).toBeInTheDocument()
  })

  it('opens CollectionPicker when action button clicked', async () => {
    renderBar()
    await waitFor(() => {
      expect(screen.getByAltText('New Album')).toBeInTheDocument()
    })
    await userEvent.click(screen.getByRole('button', { name: /select new album/i }))
    await userEvent.click(screen.getByRole('button', { name: /add to collection/i }))
    expect(screen.getByRole('listbox', { name: /collection picker/i })).toBeInTheDocument()
  })

  it('renders empty bar when home data has no albums', async () => {
    apiFetch.mockResolvedValue({
      json: () => Promise.resolve({
        recently_added: [],
        recently_played: [],
      }),
    })
    renderBar()
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(screen.getByTestId('album-prompt-bar')).toBeInTheDocument()
      expect(screen.queryAllByRole('button')).toHaveLength(0)
    })
  })

  it('shares selection state across rows for duplicate albums', async () => {
    apiFetch.mockResolvedValue({
      json: () => Promise.resolve({
        recently_added: [
          { service_id: 'shared1', name: 'Shared Album', image_url: 'https://example.com/s.jpg' },
        ],
        recently_played: [
          { service_id: 'shared1', name: 'Shared Album', image_url: 'https://example.com/s.jpg' },
        ],
      }),
    })
    renderBar()
    await waitFor(() => {
      expect(screen.getAllByAltText('Shared Album')).toHaveLength(2)
    })
    const buttons = screen.getAllByRole('button', { name: /select shared album/i })
    await userEvent.click(buttons[0])
    const overlays = screen.getAllByTestId('selected-overlay')
    expect(overlays).toHaveLength(2)
  })

  it('clears selection and closes picker after successful bulk add', async () => {
    const onBulkAdd = vi.fn().mockResolvedValue(undefined)
    renderBar({ onBulkAdd })
    await waitFor(() => {
      expect(screen.getByAltText('New Album')).toBeInTheDocument()
    })
    await userEvent.click(screen.getByRole('button', { name: /select new album/i }))
    await userEvent.click(screen.getByRole('button', { name: /add to collection/i }))
    await userEvent.click(screen.getByText('Chill'))
    expect(onBulkAdd).toHaveBeenCalledWith('col1', ['ra1'])
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /add to collection/i })).not.toBeInTheDocument()
    })
  })
})
