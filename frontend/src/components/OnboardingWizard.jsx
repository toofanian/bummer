import { useState, useEffect } from 'react'
import { useSpotifyAuth } from '../hooks/useSpotifyAuth'

const API = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'
const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI ?? 'http://localhost:5173/auth/spotify/callback'

function ServiceSelector({ onSelect }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-8">
      <h1 className="text-2xl font-bold">Choose your music service</h1>
      <p className="text-gray-400 max-w-sm text-center">
        Crate works with your existing music library. Pick the service you use.
      </p>
      <div className="flex flex-col gap-3 w-full max-w-sm">
        <button
          onClick={() => onSelect('spotify')}
          className="flex items-center gap-4 bg-surface-2 border border-border rounded-xl px-5 py-4 text-left hover:bg-hover transition-colors duration-150"
        >
          <div className="w-10 h-10 rounded-lg bg-[#1DB954] flex items-center justify-center flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
            </svg>
          </div>
          <div>
            <div className="text-text font-semibold">Spotify</div>
            <div className="text-text-dim text-sm">Premium required for playback</div>
          </div>
        </button>
        <button
          onClick={() => onSelect('apple_music')}
          className="flex items-center gap-4 bg-surface-2 border border-border rounded-xl px-5 py-4 text-left hover:bg-hover transition-colors duration-150"
        >
          <div className="w-10 h-10 rounded-lg bg-[#FA243C] flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043A5.022 5.022 0 0019.7.28 10.588 10.588 0 0018.104.05 78.928 78.928 0 0016.12 0h-8.24c-.67 0-1.34.028-2.008.05A10.588 10.588 0 004.276.28a5.022 5.022 0 00-1.874.61C1.284 1.623.539 2.623.222 3.933a9.23 9.23 0 00-.24 2.19C-.018 6.8 0 7.475 0 8.15v7.7c0 .674-.018 1.35.017 2.025.024.744.092 1.475.24 2.19.317 1.31 1.062 2.31 2.18 3.042A5.022 5.022 0 004.3 23.72a10.588 10.588 0 001.596.23c.67.022 1.34.05 2.008.05h8.24c.67 0 1.34-.028 2.008-.05a10.588 10.588 0 001.596-.23 5.022 5.022 0 001.874-.612c1.118-.733 1.863-1.733 2.18-3.042a9.23 9.23 0 00.24-2.19c.036-.676.018-1.351.018-2.026V8.15c-.018-.675 0-1.35-.066-2.026zM16.95 16.562c0 .383-.072.72-.217 1.012a2.002 2.002 0 01-.592.723 2.372 2.372 0 01-.882.41 4.592 4.592 0 01-1.098.196c-.383.024-.724-.036-1.023-.18a1.584 1.584 0 01-.687-.61c-.168-.277-.24-.61-.216-1 .024-.383.126-.7.307-.952.18-.253.42-.46.72-.622.297-.16.63-.28.997-.359.365-.08.725-.147 1.08-.2.252-.04.462-.1.63-.18.168-.084.253-.21.253-.383V11.14a.452.452 0 00-.084-.27.327.327 0 00-.216-.133.944.944 0 00-.312-.012l-4.344.67a.551.551 0 00-.325.15.413.413 0 00-.107.297v6.162c0 .383-.072.72-.217 1.012a2.002 2.002 0 01-.592.723 2.372 2.372 0 01-.882.41 4.592 4.592 0 01-1.098.196c-.383.024-.724-.036-1.023-.18a1.584 1.584 0 01-.687-.61c-.168-.277-.24-.61-.216-1 .024-.383.126-.7.307-.952.18-.253.42-.46.72-.622.297-.16.63-.28.997-.359.365-.08.725-.147 1.08-.2.252-.04.462-.1.63-.18.168-.084.253-.21.253-.383V8.25c0-.253.06-.462.18-.625a.983.983 0 01.468-.36 2.47 2.47 0 01.672-.164l4.812-.738c.18-.024.348-.024.504 0a.663.663 0 01.384.18c.096.096.144.24.144.432v9.588z"/>
            </svg>
          </div>
          <div>
            <div className="text-text font-semibold">Apple Music</div>
            <div className="text-text-dim text-sm">Subscription required for playback</div>
          </div>
        </button>
      </div>
    </div>
  )
}

function AppleMusicSetup({ onBack }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-8">
      <h1 className="text-2xl font-bold">Apple Music Support</h1>
      <p className="text-gray-400 max-w-sm text-center">
        Apple Music integration is coming soon. We're working on it!
      </p>
      <p className="text-gray-500 max-w-sm text-center text-sm">
        In the meantime, if you also have a Spotify account you can connect with that instead.
      </p>
      <button
        onClick={onBack}
        className="bg-surface-2 border border-border text-text font-semibold rounded-lg px-4 py-2 hover:bg-hover transition-colors duration-150"
      >
        Back
      </button>
    </div>
  )
}

function SpotifySetup({ session, onComplete }) {
  const { initiateLogin, handleCallback, accessToken } = useSpotifyAuth()
  const [clientId, setClientId] = useState('')
  const [loading, setLoading] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return !!params.get('code')
  })
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
    localStorage.setItem('music_service_type', 'spotify')
    setLoading(true)
    try {
      await initiateLogin()
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Connecting Spotify...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-8">
      <h1 className="text-2xl font-bold">Connect Spotify</h1>
      <p className="text-gray-400 max-w-sm text-center">
        Crate uses your own Spotify developer app to sync your library and control playback. <span className="text-white">Spotify Premium is required.</span>
      </p>
      <p className="text-gray-500 max-w-sm text-center text-sm">
        Crate can read and modify your library, control playback, view your listening history and top artists, and manage playlists and followed artists. It cannot change your password, make purchases, or access any other Spotify data. Your tokens are stored to keep your library synced in the background. You can delete your account and all stored data anytime from Settings.
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
          {loading ? 'Redirecting...' : 'Connect Spotify'}
        </button>
      </form>
    </div>
  )
}

export default function OnboardingWizard({ session, onComplete }) {
  // If we're returning from Spotify OAuth callback, skip service selection
  const isSpotifyCallback = window.location.pathname === '/auth/spotify/callback'
  const hasLocalClientId = !!localStorage.getItem('spotify_client_id')

  const [selectedService, setSelectedService] = useState(() => {
    if (isSpotifyCallback || hasLocalClientId) return 'spotify'
    const stored = localStorage.getItem('music_service_type')
    if (stored === 'apple_music') return 'apple_music'
    if (stored === 'spotify') return 'spotify'
    return null
  })

  if (!selectedService) {
    return <ServiceSelector onSelect={setSelectedService} />
  }

  if (selectedService === 'apple_music') {
    return <AppleMusicSetup onBack={() => setSelectedService(null)} />
  }

  return <SpotifySetup session={session} onComplete={onComplete} />
}
