import { useState } from 'react'
import supabase from '../supabaseClient'

const API = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

export default function SignupScreen() {
  const [inviteCode, setInviteCode] = useState('')
  const [isReturnUser, setIsReturnUser] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleGoogleSignIn(e) {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')
    try {
      if (!isReturnUser) {
        const res = await fetch(`${API}/auth/redeem-invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invite_code: inviteCode }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.detail ?? 'Something went wrong')
      }
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
      <p className="text-gray-400">Your music library, organized.</p>
      <form onSubmit={handleGoogleSignIn} className="flex flex-col gap-4 w-full max-w-sm">
        {!isReturnUser && (
          <input type="text" placeholder="Invite code" value={inviteCode}
            onChange={e => setInviteCode(e.target.value.toUpperCase())} required
            className="bg-gray-800 rounded-lg px-4 py-2 text-white border border-gray-700 focus:outline-none focus:border-white font-mono tracking-widest" />
        )}
        {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}
        <button type="submit" disabled={loading}
          className="bg-white text-black font-semibold rounded-lg px-4 py-2 hover:bg-gray-200 disabled:opacity-50">
          {loading ? 'Signing in…' : 'Sign in with Google'}
        </button>
      </form>
      <button onClick={() => setIsReturnUser(r => !r)}
        className="text-gray-500 text-sm hover:text-gray-300">
        {isReturnUser ? 'Have an invite code? Sign up' : 'Already have an account? Sign in'}
      </button>
    </div>
  )
}
