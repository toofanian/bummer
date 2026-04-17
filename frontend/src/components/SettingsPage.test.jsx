import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn().mockResolvedValue({ error: null }) }))
vi.mock('../supabaseClient', () => ({
  default: { auth: { signOut } },
}))

vi.stubGlobal('fetch', vi.fn())

import SettingsPage from './SettingsPage'

const fakeSession = { access_token: 'supabase-jwt' }

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a heading', () => {
    render(<SettingsPage onLogout={vi.fn()} session={fakeSession} onBack={vi.fn()} />)
    expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument()
  })

  it('calls onBack when back button is clicked', () => {
    const onBack = vi.fn()
    render(<SettingsPage onLogout={vi.fn()} session={fakeSession} onBack={onBack} />)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalled()
  })

  it('shows install app section', () => {
    render(<SettingsPage onLogout={vi.fn()} session={fakeSession} onBack={vi.fn()} />)
    expect(screen.getByText(/install app/i)).toBeInTheDocument()
  })

  it('shows iOS instructions when user agent contains iPhone', () => {
    const original = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { value: 'iPhone', configurable: true })
    render(<SettingsPage onLogout={vi.fn()} session={fakeSession} onBack={vi.fn()} />)
    expect(screen.getByText(/add to home screen/i)).toBeInTheDocument()
    Object.defineProperty(navigator, 'userAgent', { value: original, configurable: true })
  })

  it('shows Chrome instructions when user agent contains Chrome', () => {
    const original = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { value: 'Chrome/100', configurable: true })
    render(<SettingsPage onLogout={vi.fn()} session={fakeSession} onBack={vi.fn()} />)
    expect(screen.getByText(/install.*address bar/i)).toBeInTheDocument()
    Object.defineProperty(navigator, 'userAgent', { value: original, configurable: true })
  })

  it('has a GitHub Discussions link for feedback', () => {
    render(<SettingsPage onLogout={vi.fn()} session={fakeSession} onBack={vi.fn()} />)
    const link = screen.getByRole('link', { name: /send feedback/i })
    expect(link).toHaveAttribute('href', 'https://github.com/toofanian/bummer/discussions')
  })

  it('calls onLogout when Log Out is clicked', () => {
    const onLogout = vi.fn()
    render(<SettingsPage onLogout={onLogout} session={fakeSession} onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /log out/i }))
    expect(onLogout).toHaveBeenCalled()
  })

  it('shows delete account button', () => {
    render(<SettingsPage onLogout={vi.fn()} session={fakeSession} onBack={vi.fn()} />)
    expect(screen.getByRole('button', { name: /delete account/i })).toBeInTheDocument()
  })

  it('opens delete confirmation modal and requires typing DELETE', () => {
    render(<SettingsPage onLogout={vi.fn()} session={fakeSession} onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /delete account/i }))
    const confirm = screen.getByRole('button', { name: /permanently delete/i })
    expect(confirm).toBeDisabled()
    const input = screen.getByPlaceholderText(/DELETE/)
    fireEvent.change(input, { target: { value: 'delete' } })
    expect(confirm).toBeDisabled()
    fireEvent.change(input, { target: { value: 'DELETE' } })
    expect(confirm).not.toBeDisabled()
  })

  it('calls DELETE /auth/account and signs out on confirm', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ok' }) })
    const origLocation = window.location
    delete window.location
    window.location = { ...origLocation, reload: vi.fn(), assign: vi.fn() }

    render(<SettingsPage onLogout={vi.fn()} session={fakeSession} onBack={vi.fn()} />)
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

  it('shows error when delete request fails', async () => {
    fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ detail: 'Server error' }) })
    render(<SettingsPage onLogout={vi.fn()} session={fakeSession} onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /delete account/i }))
    fireEvent.change(screen.getByPlaceholderText(/DELETE/), { target: { value: 'DELETE' } })
    fireEvent.click(screen.getByRole('button', { name: /permanently delete/i }))

    await waitFor(() => expect(screen.getByText(/server error/i)).toBeInTheDocument())
    expect(signOut).not.toHaveBeenCalled()
  })
})
