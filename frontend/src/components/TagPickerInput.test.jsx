import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TagPickerInput from './TagPickerInput'

const TAGS = [
  { id: 'tag-1', name: 'rock', parent_tag_id: null, position: 0 },
  { id: 'tag-2', name: 'jazz', parent_tag_id: null, position: 1 },
  { id: 'tag-3', name: 'electronic', parent_tag_id: null, position: 2 },
]

function renderPicker(overrides = {}) {
  const props = {
    allTags: TAGS,
    selectedTagIds: ['tag-1'],
    onChange: vi.fn(),
    onCreate: vi.fn(async (name) => ({ id: `new-${name}` })),
    ...overrides,
  }
  return { ...render(<TagPickerInput {...props} />), props }
}

describe('TagPickerInput', () => {
  it('renders selected tag chips', () => {
    renderPicker({ selectedTagIds: ['tag-1', 'tag-2'] })
    expect(screen.getByText('rock')).toBeInTheDocument()
    expect(screen.getByText('jazz')).toBeInTheDocument()
  })

  it('removing a chip calls onChange without that tag id', async () => {
    const { props } = renderPicker({ selectedTagIds: ['tag-1', 'tag-2'] })
    const removeBtn = screen.getByRole('button', { name: /remove rock/i })
    await userEvent.click(removeBtn)
    expect(props.onChange).toHaveBeenCalledWith(['tag-2'])
  })

  it('typing filters dropdown to matching tags', async () => {
    renderPicker({ selectedTagIds: [] })
    const input = screen.getByRole('combobox')
    await userEvent.type(input, 'jaz')
    expect(screen.getByText('jazz')).toBeInTheDocument()
    expect(screen.queryByText('rock')).not.toBeInTheDocument()
    expect(screen.queryByText('electronic')).not.toBeInTheDocument()
  })

  it('selecting an option from the dropdown adds that tag id', async () => {
    const { props } = renderPicker({ selectedTagIds: [] })
    const input = screen.getByRole('combobox')
    await userEvent.type(input, 'jazz')
    await userEvent.click(screen.getByRole('option', { name: /jazz/i }))
    expect(props.onChange).toHaveBeenCalledWith(['tag-2'])
  })

  it('does not show already-selected tags in the dropdown', async () => {
    renderPicker({ selectedTagIds: ['tag-1'] })
    const input = screen.getByRole('combobox')
    await userEvent.type(input, 'rock')
    // rock chip is rendered, but it should not be in the dropdown options
    expect(screen.queryByRole('option', { name: /rock/i })).not.toBeInTheDocument()
  })

  it('pressing Enter on a novel name calls onCreate and adds the returned tag id', async () => {
    const onCreate = vi.fn(async () => ({ id: 'new-id' }))
    const { props } = renderPicker({ selectedTagIds: [], onCreate })
    const input = screen.getByRole('combobox')
    await userEvent.type(input, 'ambient')
    await userEvent.keyboard('{Enter}')
    expect(onCreate).toHaveBeenCalledWith('ambient')
    // wait for promise to resolve and onChange to be called
    await screen.findByRole('combobox')
    expect(props.onChange).toHaveBeenCalledWith(['new-id'])
  })

  it('pressing Enter when query exactly matches an existing tag selects it instead of creating', async () => {
    const onCreate = vi.fn()
    const { props } = renderPicker({ selectedTagIds: [], onCreate })
    const input = screen.getByRole('combobox')
    await userEvent.type(input, 'jazz')
    await userEvent.keyboard('{Enter}')
    expect(onCreate).not.toHaveBeenCalled()
    expect(props.onChange).toHaveBeenCalledWith(['tag-2'])
  })

  it('clears the query after a successful create', async () => {
    renderPicker({ selectedTagIds: [] })
    const input = screen.getByRole('combobox')
    await userEvent.type(input, 'ambient')
    await userEvent.keyboard('{Enter}')
    // re-find input after re-render
    const inputAfter = screen.getByRole('combobox')
    expect(inputAfter).toHaveValue('')
  })
})
