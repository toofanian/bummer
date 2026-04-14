import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn().mockResolvedValue({ error: null }) }))
vi.mock('../supabaseClient', () => ({
  default: { auth: { signOut } },
}))

vi.stubGlobal('fetch', vi.fn())

import SettingsMenu from './SettingsMenu'

const fakeSession = { access_token: 'supabase-jwt' }

describe('SettingsMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a settings button', () => {
    render(<SettingsMenu onLogout={vi.fn()} />)
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument()
  })

  it('shows dropdown menu when clicked', () => {
    render(<SettingsMenu onLogout={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))
    expect(screen.getByText(/send feedback/i)).toBeInTheDocument()
    expect(screen.getByText(/log out/i)).toBeInTheDocument()
  })

  it('hides dropdown when clicked again', () => {
    render(<SettingsMenu onLogout={vi.fn()} />)
    const btn = screen.getByRole('button', { name: /settings/i })
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(screen.queryByText(/send feedback/i)).not.toBeInTheDocument()
  })

  it('calls onLogout when Log Out is clicked', () => {
    const onLogout = vi.fn()
    render(<SettingsMenu onLogout={onLogout} />)
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))
    fireEvent.click(screen.getByText(/log out/i))
    expect(onLogout).toHaveBeenCalled()
  })

  it('has a mailto link for feedback', () => {
    render(<SettingsMenu onLogout={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))
    const link = screen.getByText(/send feedback/i)
    expect(link.closest('a')).toHaveAttribute('href', expect.stringContaining('mailto:'))
  })

  it('shows a Delete account menu item when open', () => {
    render(<SettingsMenu onLogout={vi.fn()} session={fakeSession} />)
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))
    expect(screen.getByRole('button', { name: /delete account/i })).toBeInTheDocument()
  })

  it('opens a confirmation modal with a disabled confirm button until the user types DELETE', () => {
    render(<SettingsMenu onLogout={vi.fn()} session={fakeSession} />)
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))
    fireEvent.click(screen.getByRole('button', { name: /delete account/i }))
    const confirm = screen.getByRole('button', { name: /permanently delete/i })
    expect(confirm).toBeDisabled()
    const input = screen.getByPlaceholderText(/DELETE/)
    fireEvent.change(input, { target: { value: 'delete' } })
    expect(confirm).toBeDisabled() // case-sensitive
    fireEvent.change(input, { target: { value: 'DELETE' } })
    expect(confirm).not.toBeDisabled()
  })

  it('calls DELETE /auth/account and signs out on confirm', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ok' }) })
    // Stub reload to avoid jsdom nav
    const origLocation = window.location
    delete window.location
    window.location = { ...origLocation, reload: vi.fn(), assign: vi.fn() }

    render(<SettingsMenu onLogout={vi.fn()} session={fakeSession} />)
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))
    fireEvent.click(screen.getByRole('button', { name: /delete account/i }))
    fireEvent.change(screen.getByPlaceholderText(/DELETE/), { target: { value: 'DELETE' } })
    fireEvent.click(screen.getByRole('button', { name: /permanently delete/i }))

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toContain('/auth/account')
    expect(opts.method).toBe('DELETE')
    expect(opts.headers.Authorization).toBe('Bearer supabase-jwt')
    await waitFor(() => expect(signOut).toHaveBeenCalled())

    window.location = origLocation
  })

  it('shows error message and does not sign out when DELETE request fails', async () => {
    fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ detail: 'Server error' }) })
    render(<SettingsMenu onLogout={vi.fn()} session={fakeSession} />)
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))
    fireEvent.click(screen.getByRole('button', { name: /delete account/i }))
    fireEvent.change(screen.getByPlaceholderText(/DELETE/), { target: { value: 'DELETE' } })
    fireEvent.click(screen.getByRole('button', { name: /permanently delete/i }))

    await waitFor(() => expect(screen.getByText(/server error/i)).toBeInTheDocument())
    expect(signOut).not.toHaveBeenCalled()
  })
})
