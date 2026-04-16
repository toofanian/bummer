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

const previewRealSpotify = IS_PREVIEW && import.meta.env.VITE_PREVIEW_REAL_SPOTIFY === 'true'
const usePreviewBypass = IS_PREVIEW && !previewRealSpotify

export function useAuth() {
  const [session, setSession] = useState(usePreviewBypass ? PREVIEW_SESSION : null)
  const [loading, setLoading] = useState(!usePreviewBypass)

  useEffect(() => {
    if (usePreviewBypass) return

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
    if (usePreviewBypass) return
    await supabase.auth.signOut()
  }

  return { session, loading, logout }
}
