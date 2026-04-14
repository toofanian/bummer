import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import BulkAddBar from './BulkAddBar'

const COLLECTIONS = [
  { id: 'col-1', name: 'Road trip' },
  { id: 'col-2', name: '90s classics' },
]

describe('BulkAddBar', () => {
  it('shows selected count text', () => {
    render(
      <BulkAddBar
        selectedCount={3}
        collections={COLLECTIONS}
        onAddToCollection={() => {}}
        onClear={() => {}}
      />
    )
    expect(screen.getByText('3 selected')).toBeInTheDocument()
  })

  it('calls onClear when × is clicked', async () => {
    const onClear = vi.fn()
    render(
      <BulkAddBar
        selectedCount={2}
        collections={COLLECTIONS}
        onAddToCollection={() => {}}
        onClear={onClear}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /clear selection/i }))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('shows collection picker and calls onAddToCollection when a collection is clicked', async () => {
    const onAddToCollection = vi.fn()
    render(
      <BulkAddBar
        selectedCount={1}
        collections={COLLECTIONS}
        onAddToCollection={onAddToCollection}
        onClear={() => {}}
      />
    )
    // Picker should not be visible initially
    expect(screen.queryByText('Road trip')).not.toBeInTheDocument()

    // Open the picker
    await userEvent.click(screen.getByRole('button', { name: /add to collection/i }))
    expect(screen.getByText('Road trip')).toBeInTheDocument()
    expect(screen.getByText('90s classics')).toBeInTheDocument()

    // Click a collection
    await userEvent.click(screen.getByText('Road trip'))
    expect(onAddToCollection).toHaveBeenCalledWith('col-1')

    // Picker should close after selection
    expect(screen.queryByText('Road trip')).not.toBeInTheDocument()
  })
})
