import { useState, useCallback } from 'react'
import { apiFetch } from '../api'

/**
 * Hook for Apple Music authentication via MusicKit JS.
 *
 * Flow:
 * 1. Fetch developer token from backend
 * 2. Load MusicKit JS SDK with developer token
 * 3. User authorizes → MusicKit JS returns Music User Token
 * 4. Send Music User Token to backend for storage
 */

let musicKitInstance = null

async function loadMusicKitJS() {
  if (window.MusicKit) return window.MusicKit

  return new Promise((resolve, reject) => {
    // Check if script is already loading
    const existing = document.querySelector('script[src*="musickit"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.MusicKit))
      existing.addEventListener('error', () => reject(new Error('Failed to load MusicKit JS')))
      return
    }

    const script = document.createElement('script')
    script.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js'
    script.async = true
    script.crossOrigin = 'anonymous'
    script.addEventListener('load', () => resolve(window.MusicKit))
    script.addEventListener('error', () => reject(new Error('Failed to load MusicKit JS')))
    document.head.appendChild(script)
  })
}

export function useAppleMusicAuth() {
  const [musicUserToken, setMusicUserToken] = useState(
    () => localStorage.getItem('apple_music_user_token')
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const authorize = useCallback(async (session) => {
    setLoading(true)
    setError(null)

    try {
      // 1. Get developer token from backend
      const tokenRes = await apiFetch('/auth/apple-music/developer-token', {}, session)
      if (!tokenRes.ok) {
        const data = await tokenRes.json().catch(() => ({}))
        throw new Error(data.detail ?? 'Failed to get Apple Music developer token')
      }
      const { developer_token } = await tokenRes.json()

      // 2. Load MusicKit JS
      const MusicKit = await loadMusicKitJS()

      // 3. Configure and get instance
      if (!musicKitInstance) {
        await MusicKit.configure({
          developerToken: developer_token,
          app: {
            name: 'Bummer',
            build: '1.0.0',
          },
        })
        musicKitInstance = MusicKit.getInstance()
      }

      // 4. Authorize user
      const userToken = await musicKitInstance.authorize()
      if (!userToken) {
        throw new Error('Apple Music authorization was cancelled')
      }

      // 5. Store token on backend
      const storeRes = await apiFetch('/auth/apple-music/token', {
        method: 'POST',
        body: JSON.stringify({ music_user_token: userToken }),
      }, session)

      if (!storeRes.ok) {
        throw new Error('Failed to store Apple Music credentials')
      }

      // 6. Store locally
      localStorage.setItem('apple_music_user_token', userToken)
      localStorage.setItem('music_service_type', 'apple_music')
      setMusicUserToken(userToken)
      setLoading(false)
      return userToken
    } catch (err) {
      setError(err.message)
      setLoading(false)
      throw err
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('apple_music_user_token')
    localStorage.removeItem('music_service_type')
    setMusicUserToken(null)
    musicKitInstance = null
  }, [])

  return { musicUserToken, authorize, logout, loading, error }
}
