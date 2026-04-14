import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RowMenu from './RowMenu'

const COLLECTIONS = [
  { id: 'col-1', name: 'Road trip' },
  { id: 'col-2', name: '90s classics' },
]

describe('RowMenu', () => {
  it('renders a ... button', () => {
    render(<RowMenu collections={COLLECTIONS} onAdd={() => {}} onCreate={() => {}} />)
    expect(screen.getByRole('button', { name: '...' })).toBeInTheDocument()
  })

  it('is closed by default', () => {
    render(<RowMenu collections={COLLECTIONS} onAdd={() => {}} onCreate={() => {}} />)
    expect(screen.queryByText('Road trip')).not.toBeInTheDocument()
  })

  it('opens when ... is clicked', async () => {
    render(<RowMenu collections={COLLECTIONS} onAdd={() => {}} onCreate={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: '...' }))
    expect(screen.getByText('Road trip')).toBeInTheDocument()
    expect(screen.getByText('90s classics')).toBeInTheDocument()
  })

  it('closes when ... is clicked again', async () => {
    render(<RowMenu collections={COLLECTIONS} onAdd={() => {}} onCreate={() => {}} />)
    const btn = screen.getByRole('button', { name: '...' })
    await userEvent.click(btn)
    await userEvent.click(btn)
    expect(screen.queryByText('Road trip')).not.toBeInTheDocument()
  })

  it('calls onAdd with collection id when a collection is clicked', async () => {
    const onAdd = vi.fn()
    render(<RowMenu collections={COLLECTIONS} onAdd={onAdd} onCreate={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: '...' }))
    await userEvent.click(screen.getByText('Road trip'))
    expect(onAdd).toHaveBeenCalledWith('col-1')
  })

  it('closes after adding to a collection', async () => {
    render(<RowMenu collections={COLLECTIONS} onAdd={() => {}} onCreate={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: '...' }))
    await userEvent.click(screen.getByText('Road trip'))
    expect(screen.queryByText('Road trip')).not.toBeInTheDocument()
  })

  it('shows a new collection input when open', async () => {
    render(<RowMenu collections={COLLECTIONS} onAdd={() => {}} onCreate={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: '...' }))
    expect(screen.getByPlaceholderText(/new collection/i)).toBeInTheDocument()
  })

  it('calls onCreate and closes when new collection name is submitted', async () => {
    const onCreate = vi.fn()
    render(<RowMenu collections={COLLECTIONS} onAdd={() => {}} onCreate={onCreate} />)
    await userEvent.click(screen.getByRole('button', { name: '...' }))
    await userEvent.type(screen.getByPlaceholderText(/new collection/i), 'Rainy day{Enter}')
    expect(onCreate).toHaveBeenCalledWith('Rainy day')
    expect(screen.queryByPlaceholderText(/new collection/i)).not.toBeInTheDocument()
  })

  it('shows empty state when no collections exist', async () => {
    render(<RowMenu collections={[]} onAdd={() => {}} onCreate={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: '...' }))
    expect(screen.getByText(/no collections/i)).toBeInTheDocument()
  })
})
