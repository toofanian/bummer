import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import HomePage from './HomePage'

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
  global.fetch = vi.fn()
})

describe('HomePage', () => {
  it('renders merged Recently Played section instead of Today/This Week', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(HOME_DATA) })
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Recently Played')).toBeInTheDocument()
      expect(screen.queryByText('Today')).not.toBeInTheDocument()
      expect(screen.queryByText('This Week')).not.toBeInTheDocument()
    })
  })

  it('deduplicates albums in Recently Played (keeps first occurrence)', async () => {
    const duped = {
      ...HOME_DATA,
      today: [
        { service_id: 'a1', name: 'Today Album', artists: ['Artist A'], image_url: 'https://img/1.jpg' },
      ],
      this_week: [
        { service_id: 'a1', name: 'Today Album', artists: ['Artist A'], image_url: 'https://img/1.jpg' },
        { service_id: 'a2', name: 'Week Album', artists: ['Artist B'], image_url: 'https://img/2.jpg' },
      ],
    }
    global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(duped) })
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      const cards = screen.getAllByTestId(/^album-card-a1$/)
      expect(cards).toHaveLength(1)
    })
  })

  it('renders Recently Added section', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(HOME_DATA) })
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Recently Added')).toBeInTheDocument()
      expect(screen.getByText('New Album')).toBeInTheDocument()
    })
  })

  it('renders sections in correct order', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(HOME_DATA) })
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      const headings = screen.getAllByRole('heading')
      const titles = headings.map(h => h.textContent)
      expect(titles).toEqual(['Recently Played', 'Recently Added', 'You Might Like', 'Rediscover'])
    })
  })

  it('always shows Recently Played and Recently Added even when empty', async () => {
    const sparse = {
      today: [], this_week: [], recently_added: [],
      rediscover: HOME_DATA.rediscover, recommended: [],
    }
    global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(sparse) })
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Recently Played')).toBeInTheDocument()
      expect(screen.getByText('Recently Added')).toBeInTheDocument()
      expect(screen.queryByText('You Might Like')).not.toBeInTheDocument()
    })
  })

  it('shows empty state when all sections are empty', async () => {
    const empty = { today: [], this_week: [], recently_added: [], rediscover: [], recommended: [] }
    global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(empty) })
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
