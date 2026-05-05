import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ViewToggle } from './ViewToggle'

describe('ViewToggle', () => {
  it('renders two buttons with list and grid aria labels', () => {
    render(<ViewToggle value="list" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /list view/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /grid view/i })).toBeInTheDocument()
  })

  it('marks the active button as pressed based on value', () => {
    render(<ViewToggle value="list" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /list view/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: /grid view/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('reflects grid value as the pressed button', () => {
    render(<ViewToggle value="grid" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /grid view/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('calls onChange with new value when inactive button is clicked', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ViewToggle value="list" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /grid view/i }))
    expect(onChange).toHaveBeenCalledWith('grid')
  })

  it('does not call onChange when the already-active button is clicked', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ViewToggle value="list" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /list view/i }))
    // Base UI ToggleGroup with multiple=false guarantees one item stays
    // pressed; clicking the active button does not fire onValueChange with a
    // different selection. Document this behavior here.
    expect(onChange).not.toHaveBeenCalled()
  })
})
