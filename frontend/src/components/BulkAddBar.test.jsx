import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BulkAddBar from './BulkAddBar'

describe('BulkAddBar', () => {
  it('calls onOpenPicker when "Add to Collection" is clicked', async () => {
    const onOpenPicker = vi.fn()
    render(
      <BulkAddBar
        selectedCount={3}
        onOpenPicker={onOpenPicker}
        onClear={() => {}}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /add to collection/i }))
    expect(onOpenPicker).toHaveBeenCalled()
  })

  it('shows selected count', () => {
    render(
      <BulkAddBar
        selectedCount={5}
        onOpenPicker={() => {}}
        onClear={() => {}}
      />
    )
    expect(screen.getByText('5 selected')).toBeInTheDocument()
  })

  it('calls onClear when clear button is clicked', async () => {
    const onClear = vi.fn()
    render(
      <BulkAddBar
        selectedCount={3}
        onOpenPicker={() => {}}
        onClear={onClear}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(onClear).toHaveBeenCalled()
  })
})
