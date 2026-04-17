import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BulkAddBar from './BulkAddBar'

const SELECTED_ALBUMS = [
  { service_id: 'id1', name: 'Love Deluxe', image_url: 'https://example.com/cover1.jpg' },
  { service_id: 'id2', name: 'Room On Fire', image_url: 'https://example.com/cover2.jpg' },
]

describe('BulkAddBar', () => {
  it('calls onOpenPicker when "Add to Collection" is clicked', async () => {
    const onOpenPicker = vi.fn()
    render(
      <BulkAddBar
        selectedAlbums={SELECTED_ALBUMS}
        onOpenPicker={onOpenPicker}
        onClear={() => {}}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /add to collection/i }))
    expect(onOpenPicker).toHaveBeenCalled()
  })

  it('shows album art for each selected album', () => {
    render(
      <BulkAddBar
        selectedAlbums={SELECTED_ALBUMS}
        onOpenPicker={() => {}}
        onClear={() => {}}
      />
    )
    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(2)
    expect(images[0]).toHaveAttribute('src', 'https://example.com/cover1.jpg')
    expect(images[1]).toHaveAttribute('src', 'https://example.com/cover2.jpg')
  })

  it('calls onClear when clear button is clicked', async () => {
    const onClear = vi.fn()
    render(
      <BulkAddBar
        selectedAlbums={SELECTED_ALBUMS}
        onOpenPicker={() => {}}
        onClear={onClear}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(onClear).toHaveBeenCalled()
  })
})
