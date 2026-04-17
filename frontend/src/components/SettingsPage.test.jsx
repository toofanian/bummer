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
})
