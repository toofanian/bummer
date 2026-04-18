// BottomTabBar.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BottomTabBar from './BottomTabBar'

describe('BottomTabBar', () => {
  const defaultProps = {
    activeTab: 'home',
    onTabChange: vi.fn(),
  }

  it('renders all four tabs', () => {
    render(<BottomTabBar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /library/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /collections/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /changelog/i })).toBeInTheDocument()
  })

  it('highlights the active tab', () => {
    render(<BottomTabBar {...defaultProps} activeTab="library" />)
    const libraryBtn = screen.getByRole('button', { name: /library/i })
    expect(libraryBtn.className).toContain('text-text')
  })

  it('calls onTabChange when a tab is clicked', async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()
    render(<BottomTabBar {...defaultProps} onTabChange={onTabChange} />)
    await user.click(screen.getByRole('button', { name: /collections/i }))
    expect(onTabChange).toHaveBeenCalledWith('collections')
  })

  it('applies animate-pulse to Library label when syncing is true', () => {
    render(<BottomTabBar {...defaultProps} syncing={true} />)
    const libraryBtn = screen.getByRole('button', { name: /library/i })
    const libraryLabel = libraryBtn.querySelector('span')
    expect(libraryLabel.className).toContain('animate-pulse')
  })

  it('does not apply animate-pulse to Library label when syncing is false', () => {
    render(<BottomTabBar {...defaultProps} syncing={false} />)
    const libraryBtn = screen.getByRole('button', { name: /library/i })
    const libraryLabel = libraryBtn.querySelector('span')
    expect(libraryLabel.className).not.toContain('animate-pulse')
  })

  it('does not apply animate-pulse to Library label when syncing prop is absent', () => {
    render(<BottomTabBar {...defaultProps} />)
    const libraryBtn = screen.getByRole('button', { name: /library/i })
    const libraryLabel = libraryBtn.querySelector('span')
    expect(libraryLabel.className).not.toContain('animate-pulse')
  })
})
