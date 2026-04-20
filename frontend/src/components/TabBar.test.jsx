import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TabBar from './TabBar'

describe('TabBar', () => {
  const tabs = [
    { id: 'one', label: 'One' },
    { id: 'two', label: 'Two' },
    { id: 'three', label: 'Three' },
  ]

  it('renders all tabs', () => {
    render(<TabBar tabs={tabs} activeTab="one" onTabChange={() => {}} />)
    expect(screen.getByRole('tab', { name: 'One' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Two' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Three' })).toBeInTheDocument()
  })

  it('marks active tab with aria-selected', () => {
    render(<TabBar tabs={tabs} activeTab="two" onTabChange={() => {}} />)
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onTabChange when tab clicked', async () => {
    const onChange = vi.fn()
    render(<TabBar tabs={tabs} activeTab="one" onTabChange={onChange} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Three' }))
    expect(onChange).toHaveBeenCalledWith('three')
  })
})
