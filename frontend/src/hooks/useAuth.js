import { useState, useEffect } from 'react'
import supabase from '../supabaseClient'
import { IS_PREVIEW, PREVIEW_USER_ID, PREVIEW_USER_EMAIL } from '../previewMode'

const PREVIEW_SESSION = {
  access_token: 'PREVIEW_FAKE',
  refresh_token: 'PREVIEW_FAKE',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: PREVIEW_USER_ID,
    email: PREVIEW_USER_EMAIL,
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  },
}

export function useAuth() {
  const [session, setSession] = useState(IS_PREVIEW ? PREVIEW_SESSION : null)
  const [loading, setLoading] = useState(!IS_PREVIEW)

  useEffect(() => {
    if (IS_PREVIEW) return

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function logout() {
    if (IS_PREVIEW) return
    await supabase.auth.signOut()
  }

  return { session, loading, logout }
}
