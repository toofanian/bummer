import { useState } from 'react'
import supabase from '../supabaseClient'

const API = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

// BYPASSED: invite code gate disabled (issue #79) — signup goes straight
// to Google OAuth without requiring an invite code. Original invite code
// UI and validation kept commented out for revertibility.
export default function SignupScreen() {
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleGoogleSignIn(e) {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
      if (error) throw new Error(error.message)
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-8">
      <h1 className="text-3xl font-bold">Bummer</h1>
      <p className="text-gray-400">the death of shuffle</p>
      <form onSubmit={handleGoogleSignIn} className="flex flex-col gap-4 w-full max-w-sm">
        {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}
        <button type="submit" disabled={loading}
          className="bg-white text-black font-semibold rounded-lg px-4 py-2 hover:bg-gray-200 disabled:opacity-50">
          {loading ? 'Signing in…' : 'Sign in with Google'}
        </button>
      </form>
    </div>
  )
}
