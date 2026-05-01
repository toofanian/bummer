import { useState, useCallback } from 'react'
const IS_PREVIEW = import.meta.env.VITE_VERCEL_ENV === 'preview'

const SCOPES = [
  'user-library-read',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
].join(' ')

const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI ?? 'http://localhost:5173/auth/spotify/callback'
const PROD_ORIGIN = import.meta.env.VITE_PROD_ORIGIN ?? 'https://thedeathofshuffle.com'
const API = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

function base64URLEncode(buffer) {
  const bytes = new Uint8Array(buffer)
  let str = ''
  for (const byte of bytes) str += String.fromCharCode(byte)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function generateCodeVerifier() {
  const array = new Uint8Array(64)
  crypto.getRandomValues(array)
  return base64URLEncode(array.buffer)
}

async function generateCodeChallenge(verifier) {
  const encoded = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return base64URLEncode(digest)
}

async function exchangeCode(code, verifier, clientId) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier,
    }).toString(),
  })
  if (!res.ok) throw new Error('Spotify token exchange failed')
  return res.json()
}

function getStoredToken() {
  const token = localStorage.getItem('spotify_access_token')
  const expiresAt = Number(localStorage.getItem('spotify_expires_at') ?? 0)
  if (!token || Date.now() > expiresAt - 60_000) return null
  return token
}

// H2: Do NOT store refresh_token in localStorage — it stays backend-only
function storeTokens({ access_token, expires_in }) {
  localStorage.setItem('spotify_access_token', access_token)
  localStorage.setItem('spotify_expires_at', String(Date.now() + expires_in * 1000))
  localStorage.setItem('spotify_expires_in', String(expires_in))
}

export function useSpotifyAuth() {
  const [accessToken, setAccessToken] = useState(() => getStoredToken())

  // M1: Preview login now uses POST to keep supabase_token out of URLs
  const initiateLogin = useCallback(async (supabaseToken) => {
    const clientId = localStorage.getItem('spotify_client_id')
    if (!clientId) throw new Error('No Spotify client_id set')

    if (IS_PREVIEW && supabaseToken) {
      // Preview mode: POST to prod's proxy endpoint (token in body, not URL)
      const res = await fetch(`${PROD_ORIGIN}/api/auth/preview-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: window.location.origin,
          client_id: clientId,
          supabase_token: supabaseToken,
        }),
      })
      if (!res.ok) throw new Error('Preview login failed')
      const { redirect_url } = await res.json()
      window.location.assign(redirect_url)
      return
    }

    // Prod mode: direct PKCE flow
    const verifier = generateCodeVerifier()
    const challenge = await generateCodeChallenge(verifier)
    localStorage.setItem('spotify_pkce_verifier', verifier)
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: challenge,
    })
    window.location.assign(`https://accounts.spotify.com/authorize?${params}`)
  }, [])

  const handleCallback = useCallback(async (code) => {
    const verifier = localStorage.getItem('spotify_pkce_verifier')
    const clientId = localStorage.getItem('spotify_client_id')
    const tokens = await exchangeCode(code, verifier, clientId)
    storeTokens(tokens)
    localStorage.removeItem('spotify_pkce_verifier')
    setAccessToken(tokens.access_token)
    return tokens
  }, [])

  // M2: Refresh tokens via backend instead of calling Spotify directly
  const getAccessToken = useCallback(async (supabaseSession) => {
    const stored = getStoredToken()
    if (stored) return stored
    if (!supabaseSession) return null
    const res = await fetch(`${API}/auth/refresh-spotify-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseSession.access_token}`,
      },
    })
    if (!res.ok) return null
    const { access_token, expires_at } = await res.json()
    localStorage.setItem('spotify_access_token', access_token)
    localStorage.setItem('spotify_expires_at', String(new Date(expires_at).getTime()))
    setAccessToken(access_token)
    return access_token
  }, [])

  const logout = useCallback(() => {
    ['spotify_access_token', 'spotify_expires_at',
     'spotify_expires_in', 'spotify_client_id', 'spotify_pkce_verifier'].forEach(k => localStorage.removeItem(k))
    setAccessToken(null)
  }, [])

  return { accessToken, initiateLogin, handleCallback, getAccessToken, logout }
}
