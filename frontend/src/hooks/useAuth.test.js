import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAuth } from './useAuth'

vi.mock('../supabaseClient', () => ({
  default: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } }
      })),
      signOut: vi.fn(),
    },
  },
}))

import supabase from '../supabaseClient'

describe('useAuth', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null session while loading', () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    const { result } = renderHook(() => useAuth())
    expect(result.current.session).toBeNull()
    expect(result.current.loading).toBe(true)
  })

  it('returns session when user is logged in', async () => {
    const fakeSession = { user: { id: 'user-123' }, access_token: 'tok' }
    supabase.auth.getSession.mockResolvedValue({ data: { session: fakeSession } })
    const { result } = renderHook(() => useAuth())
    await act(async () => {})
    expect(result.current.session).toEqual(fakeSession)
    expect(result.current.loading).toBe(false)
  })

  it('calls supabase.auth.signOut on logout()', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    supabase.auth.signOut.mockResolvedValue({})
    const { result } = renderHook(() => useAuth())
    await act(async () => { await result.current.logout() })
    expect(supabase.auth.signOut).toHaveBeenCalled()
  })
})
