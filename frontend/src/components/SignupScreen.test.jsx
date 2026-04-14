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

  it('renders invite code field and Google sign-in button', () => {
    render(<SignupScreen />)
    expect(screen.getByPlaceholderText(/invite code/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument()
  })

  it('first-time signup: validates invite code then calls signInWithOAuth', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'Invite redeemed' }) })
    supabase.auth.signInWithOAuth.mockResolvedValueOnce({ error: null })
    render(<SignupScreen />)
    fireEvent.change(screen.getByPlaceholderText(/invite code/i), { target: { value: 'CODE123' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/redeem-invite'),
      expect.objectContaining({ method: 'POST' })
    ))
    await waitFor(() => expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'google',
        options: expect.objectContaining({ redirectTo: window.location.origin }),
      })
    ))
  })

  it('first-time signup: blocks Google OAuth if invite code invalid', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: 'Invite code not found' }),
    })
    render(<SignupScreen />)
    fireEvent.change(screen.getByPlaceholderText(/invite code/i), { target: { value: 'BADCODE' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }))
    await waitFor(() => expect(screen.getByText(/not found/i)).toBeInTheDocument())
    expect(supabase.auth.signInWithOAuth).not.toHaveBeenCalled()
  })

  it('return login: skips invite validation and calls signInWithOAuth directly', async () => {
    supabase.auth.signInWithOAuth.mockResolvedValueOnce({ error: null })
    render(<SignupScreen />)
    fireEvent.click(screen.getByText(/already have an account/i))
    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }))
    await waitFor(() => expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'google',
        options: expect.objectContaining({ redirectTo: window.location.origin }),
      })
    ))
    expect(fetch).not.toHaveBeenCalled()
  })
})
