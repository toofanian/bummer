import { useState, useEffect } from 'react'
import { useSpotifyAuth } from '../hooks/useSpotifyAuth'

const API = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'
const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI ?? 'http://localhost:5173/auth/spotify/callback'

export default function OnboardingWizard({ session, onComplete }) {
  const { initiateLogin, handleCallback, accessToken } = useSpotifyAuth()
  const [clientId, setClientId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copyStatus, setCopyStatus] = useState('')

  async function handleCopyRedirectUri() {
    try {
      await navigator.clipboard.writeText(REDIRECT_URI)
      setCopyStatus('Copied')
    } catch {
      setCopyStatus('Copy failed — select and copy manually')
    }
    setTimeout(() => setCopyStatus(''), 2000)
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (!code) return

    let cancelled = false
    async function finishCallback() {
      setLoading(true)
      try {
        const tokens = await handleCallback(code)
        const storedClientId = localStorage.getItem('spotify_client_id')
        const res = await fetch(`${API}/auth/spotify-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            client_id: storedClientId,
            access_token: tokens.access_token ?? accessToken ?? localStorage.getItem('spotify_access_token'),
            refresh_token: tokens.refresh_token ?? localStorage.getItem('spotify_refresh_token'),
            expires_in: tokens.expires_in ?? Number(localStorage.getItem('spotify_expires_in') ?? 3600),
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.detail ?? 'Failed to store Spotify credentials')
        }
        if (cancelled) return
        // Clean the URL before completing so the auth gate doesn't see the
        // callback path and re-enter onboarding.
        window.history.replaceState({}, '', '/')
        onComplete()
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      }
    }
    finishCallback()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleClientIdSubmit(e) {
    e.preventDefault()
    if (!clientId.trim()) return
    localStorage.setItem('spotify_client_id', clientId.trim())
    setLoading(true)
    try {
      await initiateLogin()
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-8">
      <h1 className="text-2xl font-bold">Connect Spotify</h1>
      <p className="text-gray-400 max-w-sm text-center">
        Crate uses your own Spotify developer app. You'll need a free Spotify developer account.
      </p>
      <p className="text-gray-500 max-w-sm text-center text-sm">
        By connecting Spotify, you agree that Crate stores your Spotify access and refresh tokens to keep your library synced in the background. You can delete your account and all stored data anytime from Settings.
      </p>
      <ol className="flex flex-col gap-3 w-full max-w-sm text-sm text-gray-400 list-decimal list-outside pl-5">
        <li>
          Go to the{' '}
          <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer"
            className="text-white underline hover:text-gray-300">
            Spotify developer dashboard
          </a>{' '}
          and log in with your Spotify account.
        </li>
        <li>Click <span className="text-white">Create app</span>.</li>
        <li>Give it any name and description (e.g., "My Crate").</li>
        <li>
          Paste this redirect URI:
          <div className="mt-2 flex items-stretch gap-2">
            <code className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white font-mono text-xs overflow-x-auto whitespace-nowrap">
              {REDIRECT_URI}
            </code>
            <button type="button" onClick={handleCopyRedirectUri}
              aria-label="Copy redirect URI"
              className="shrink-0 bg-gray-800 border border-gray-700 text-white text-xs font-semibold rounded-lg px-3 py-2 hover:bg-gray-700 flex items-center gap-1.5">
              {copyStatus === 'Copied' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
              )}
              {copyStatus === 'Copied' ? 'Copied' : 'Copy'}
            </button>
          </div>
          {copyStatus && (
            <p className="mt-1 text-xs text-gray-500">{copyStatus}</p>
          )}
        </li>
        <li>Check <span className="text-white">Web API</span> and <span className="text-white">Web Playback SDK</span> under APIs used.</li>
        <li>Agree to terms and click Save, then copy the Client ID from the app settings.</li>
      </ol>
      <form onSubmit={handleClientIdSubmit} className="flex flex-col gap-4 w-full max-w-sm">
        <input type="text" placeholder="Client ID" value={clientId}
          onChange={e => setClientId(e.target.value)} required
          className="bg-gray-800 rounded-lg px-4 py-2 text-white border border-gray-700 focus:outline-none focus:border-white font-mono" />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button type="submit" disabled={loading}
          className="bg-green-600 text-white font-semibold rounded-lg px-4 py-2 hover:bg-green-500 disabled:opacity-50">
          {loading ? 'Redirecting…' : 'Connect Spotify'}
        </button>
      </form>
    </div>
  )
}
