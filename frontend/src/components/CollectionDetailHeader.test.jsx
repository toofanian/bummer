import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import CollectionDetailHeader from './CollectionDetailHeader'

describe('CollectionDetailHeader', () => {
  it('shows collection name and description', () => {
    render(
      <CollectionDetailHeader
        name="Late Night"
        description="low energy vibes"
        albumCount={5}
        onBack={() => {}}
        onDescriptionChange={() => {}}
      />
    )
    expect(screen.getByDisplayValue('Late Night')).toBeInTheDocument()
    expect(screen.getByDisplayValue('low energy vibes')).toBeInTheDocument()
  })

  it('shows empty placeholder when no description', () => {
    render(
      <CollectionDetailHeader
        name="Late Night"
        description={null}
        albumCount={5}
        onBack={() => {}}
        onDescriptionChange={() => {}}
      />
    )
    expect(screen.getByPlaceholderText(/add a description/i)).toBeInTheDocument()
  })

  it('calls onDescriptionChange on blur after editing', async () => {
    const onChange = vi.fn()
    render(
      <CollectionDetailHeader
        name="Late Night"
        description=""
        albumCount={5}
        onBack={() => {}}
        onDescriptionChange={onChange}
      />
    )
    const input = screen.getByPlaceholderText(/add a description/i)
    await userEvent.type(input, 'chill beats')
    await userEvent.tab() // triggers blur
    expect(onChange).toHaveBeenCalledWith('chill beats')
  })

  it('shows album count', () => {
    render(
      <CollectionDetailHeader
        name="Late Night"
        description={null}
        albumCount={5}
        onBack={() => {}}
        onDescriptionChange={() => {}}
      />
    )
    expect(screen.getByText('5 albums')).toBeInTheDocument()
  })

  it('calls onBack when back button is clicked', async () => {
    const onBack = vi.fn()
    render(
      <CollectionDetailHeader
        name="Late Night"
        description={null}
        albumCount={5}
        onBack={onBack}
        onDescriptionChange={() => {}}
      />
    )
    await userEvent.click(screen.getByText(/back/i))
    expect(onBack).toHaveBeenCalled()
  })

  it('does not show play button', () => {
    render(
      <CollectionDetailHeader
        name="Late Night"
        description={null}
        albumCount={5}
        onBack={() => {}}
        onDescriptionChange={() => {}}
      />
    )
    expect(screen.queryByRole('button', { name: /play collection/i })).not.toBeInTheDocument()
  })

  it('allows editing collection name inline', async () => {
    const onRename = vi.fn()
    render(
      <CollectionDetailHeader
        name="Late Night"
        description={null}
        albumCount={5}
        onBack={() => {}}
        onDescriptionChange={() => {}}
        onRename={onRename}
      />
    )
    const input = screen.getByDisplayValue('Late Night')
    await userEvent.clear(input)
    await userEvent.type(input, 'Early Morning')
    await userEvent.tab()
    expect(onRename).toHaveBeenCalledWith('Early Morning')
  })

  it('does not call onRename when name is unchanged', async () => {
    const onRename = vi.fn()
    render(
      <CollectionDetailHeader
        name="Late Night"
        description={null}
        albumCount={5}
        onBack={() => {}}
        onDescriptionChange={() => {}}
        onRename={onRename}
      />
    )
    const input = screen.getByDisplayValue('Late Night')
    await userEvent.tab()
    expect(onRename).not.toHaveBeenCalled()
  })

  it('does not call onRename when name is empty', async () => {
    const onRename = vi.fn()
    render(
      <CollectionDetailHeader
        name="Late Night"
        description={null}
        albumCount={5}
        onBack={() => {}}
        onDescriptionChange={() => {}}
        onRename={onRename}
      />
    )
    const input = screen.getByDisplayValue('Late Night')
    await userEvent.clear(input)
    await userEvent.tab()
    expect(onRename).not.toHaveBeenCalled()
  })

  it('submits name on Enter key', async () => {
    const onRename = vi.fn()
    render(
      <CollectionDetailHeader
        name="Late Night"
        description={null}
        albumCount={5}
        onBack={() => {}}
        onDescriptionChange={() => {}}
        onRename={onRename}
      />
    )
    const input = screen.getByDisplayValue('Late Night')
    await userEvent.clear(input)
    await userEvent.type(input, 'Sunrise{Enter}')
    expect(onRename).toHaveBeenCalledWith('Sunrise')
  })
})
