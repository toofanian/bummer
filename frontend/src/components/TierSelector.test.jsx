import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TierSelector from './TierSelector'

describe('TierSelector', () => {
  it('shows current tier when set', () => {
    render(<TierSelector tier="A" onChange={() => {}} />)
    expect(screen.getByRole('combobox')).toHaveValue('A')
  })

  it('shows blank when no tier set', () => {
    render(<TierSelector tier={null} onChange={() => {}} />)
    expect(screen.getByRole('combobox')).toHaveValue('')
  })

  it('has options for all valid tiers plus blank', () => {
    render(<TierSelector tier={null} onChange={() => {}} />)
    const options = screen.getAllByRole('option').map(o => o.value)
    expect(options).toEqual(['', 'S', 'A', 'B', 'C', 'D'])
  })

  it('calls onChange with tier when a tier is selected', async () => {
    const onChange = vi.fn()
    render(<TierSelector tier={null} onChange={onChange} />)

    await userEvent.selectOptions(screen.getByRole('combobox'), 'S')

    expect(onChange).toHaveBeenCalledWith('S')
  })

  it('calls onChange with null when blank option is selected', async () => {
    const onChange = vi.fn()
    render(<TierSelector tier="A" onChange={onChange} />)

    await userEvent.selectOptions(screen.getByRole('combobox'), '')

    expect(onChange).toHaveBeenCalledWith(null)
  })
})
