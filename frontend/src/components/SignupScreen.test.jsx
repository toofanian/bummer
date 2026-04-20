import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SignupScreen from './SignupScreen'

vi.stubGlobal('fetch', vi.fn())
vi.mock('../supabaseClient', () => ({
  default: { auth: { signInWithOAuth: vi.fn() } }
}))

import supabase from '../supabaseClient'

describe('SignupScreen', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders Google sign-in button without invite code field (issue #79)', () => {
    render(<SignupScreen />)
    expect(screen.queryByPlaceholderText(/invite code/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument()
  })

  it('signup calls signInWithOAuth directly without redeem-invite (issue #79)', async () => {
    supabase.auth.signInWithOAuth.mockResolvedValueOnce({ error: null })
    render(<SignupScreen />)
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }))
    await waitFor(() => expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'google',
        options: expect.objectContaining({ redirectTo: window.location.origin }),
      })
    ))
    expect(fetch).not.toHaveBeenCalled()
  })

  // Original invite code validation tests removed — bypassed (issue #79).
  // See git history for original tests if re-enabling.
})
