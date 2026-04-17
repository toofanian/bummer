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
    expect(screen.getByText('Late Night')).toBeInTheDocument()
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
})
