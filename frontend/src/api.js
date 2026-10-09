const API = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

// Fired on window when the backend answers 401 { code: 'spotify_reauth_required' }:
// the stored Spotify token is missing or dead and the user has to reconnect.
export const SPOTIFY_REAUTH_EVENT = 'spotify-reauth-required'

async function signalIfReauthRequired(res) {
  if (res?.status !== 401 || typeof res.clone !== 'function') return
  try {
    const body = await res.clone().json()
    if (body?.code === 'spotify_reauth_required') {
      window.dispatchEvent(new Event(SPOTIFY_REAUTH_EVENT))
    }
  } catch { /* non-JSON 401 — not ours */ }
}

export function apiFetch(path, options = {}, session = null) {
  const headers = {
    'Content-Type': 'application/json',
    ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...(options.headers ?? {}),
  }
  return fetch(`${API}${path}`, { ...options, headers }).then(res => {
    signalIfReauthRequired(res)
    return res
  })
}
