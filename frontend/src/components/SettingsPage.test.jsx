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
})
