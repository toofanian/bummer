import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import LibraryViewToggle from './LibraryViewToggle'

describe('LibraryViewToggle', () => {
  it('renders Albums and Artists tabs', () => {
    render(<LibraryViewToggle activeView="albums" onViewChange={() => {}} albumCount={42} />)
    expect(screen.getByRole('tab', { name: /albums/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /artists/i })).toBeInTheDocument()
  })

  it('shows album count in Albums label', () => {
    render(<LibraryViewToggle activeView="albums" onViewChange={() => {}} albumCount={342} />)
    expect(screen.getByRole('tab', { name: /albums/i })).toHaveTextContent('Albums (342)')
  })

  it('marks the active tab as selected', () => {
    render(<LibraryViewToggle activeView="artists" onViewChange={() => {}} albumCount={10} />)
    expect(screen.getByRole('tab', { name: /artists/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /albums/i })).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onViewChange when a tab is clicked', async () => {
    const onChange = vi.fn()
    render(<LibraryViewToggle activeView="albums" onViewChange={onChange} albumCount={10} />)
    await userEvent.click(screen.getByRole('tab', { name: /artists/i }))
    expect(onChange).toHaveBeenCalledWith('artists')
  })

  it('shows artist count in Artists label when artistCount is provided', () => {
    render(<LibraryViewToggle activeView="artists" onViewChange={() => {}} albumCount={100} artistCount={47} />)
    expect(screen.getByRole('tab', { name: /artists/i })).toHaveTextContent('Artists (47)')
  })
})
