import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import HomePage from './HomePage'
import { useIsMobile } from '../hooks/useIsMobile'

vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false)
}))

const HOME_DATA = {
  today: [
    { service_id: 'a1', name: 'Today Album', artists: ['Artist A'], image_url: 'https://img/1.jpg' },
  ],
  this_week: [
    { service_id: 'a2', name: 'Week Album', artists: ['Artist B'], image_url: 'https://img/2.jpg' },
  ],
  recently_added: [
    { service_id: 'a5', name: 'New Album', artists: ['Artist D'], image_url: 'https://img/5.jpg' },
  ],
  rediscover: [
    { service_id: 'a3', name: 'Old Gem', artists: ['Artist C'], image_url: 'https://img/3.jpg' },
  ],
  recommended: [
    { service_id: 'a4', name: 'Try This', artists: ['Artist A'], image_url: 'https://img/4.jpg' },
  ],
}

beforeEach(() => {
  vi.restoreAllMocks()
  useIsMobile.mockReturnValue(false)
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(HOME_DATA) })
  )
})

describe('HomePage', () => {
  it('renders all four columns on desktop', async () => {
    useIsMobile.mockReturnValue(false)
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Recently Played')).toBeInTheDocument()
      expect(screen.getByText('Recently Added')).toBeInTheDocument()
      expect(screen.getByText('Related')).toBeInTheDocument()
      expect(screen.getByText('Rediscover')).toBeInTheDocument()
    })
  })

  it('renders album art in desktop columns', async () => {
    useIsMobile.mockReturnValue(false)
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByAltText('Today Album')).toBeInTheDocument()
      expect(screen.getByAltText('New Album')).toBeInTheDocument()
      expect(screen.getByAltText('Try This')).toBeInTheDocument()
      expect(screen.getByAltText('Old Gem')).toBeInTheDocument()
    })
  })

  it('renders tab switcher on mobile', async () => {
    useIsMobile.mockReturnValue(true)
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /recently played/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /recently added/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /related/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /rediscover/i })).toBeInTheDocument()
    })
  })

  it('defaults to Recently Played tab on mobile', async () => {
    useIsMobile.mockReturnValue(true)
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByAltText('Today Album')).toBeInTheDocument()
      expect(screen.queryByAltText('Old Gem')).not.toBeInTheDocument()
    })
  })

  it('switches tabs on mobile', async () => {
    useIsMobile.mockReturnValue(true)
    const user = userEvent.setup()
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByAltText('Today Album')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('tab', { name: /rediscover/i }))
    await waitFor(() => {
      expect(screen.getByAltText('Old Gem')).toBeInTheDocument()
      expect(screen.queryByAltText('Today Album')).not.toBeInTheDocument()
    })
  })

  it('deduplicates albums in Recently Played (keeps first occurrence)', async () => {
    const duped = {
      ...HOME_DATA,
      this_week: [
        { service_id: 'a1', name: 'Today Album', artists: ['Artist A'], image_url: 'https://img/1.jpg' },
        { service_id: 'a2', name: 'Week Album', artists: ['Artist B'], image_url: 'https://img/2.jpg' },
      ],
    }
    global.fetch.mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(duped) })
    )
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      const items = screen.getAllByAltText('Today Album')
      expect(items).toHaveLength(1)
    })
  })

  it('calls onPlay when an album is clicked', async () => {
    const onPlay = vi.fn()
    render(<HomePage onPlay={onPlay} />)
    await waitFor(() => {
      expect(screen.getByAltText('Today Album')).toBeInTheDocument()
    })
    screen.getByAltText('Today Album').closest('[data-testid]').click()
    expect(onPlay).toHaveBeenCalledWith('a1')
  })

  it('shows per-section empty state when a section has no albums', async () => {
    const sparse = {
      today: [], this_week: [], recently_added: [],
      rediscover: HOME_DATA.rediscover, recommended: [],
    }
    global.fetch.mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(sparse) })
    )
    useIsMobile.mockReturnValue(true)
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/nothing yet/i)).toBeInTheDocument()
    })
  })

  it('shows global empty state when all sections are empty', async () => {
    const empty = { today: [], this_week: [], recently_added: [], rediscover: [], recommended: [] }
    global.fetch.mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(empty) })
    )
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/start playing albums/i)).toBeInTheDocument()
    })
  })

  it('shows loading state initially', () => {
    global.fetch.mockReturnValueOnce(new Promise(() => {}))
    render(<HomePage onPlay={() => {}} />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })
})
