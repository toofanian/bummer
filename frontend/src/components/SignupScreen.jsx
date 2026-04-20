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
    <div className="flex flex-col items-center justify-center min-h-screen p-8 relative overflow-hidden">
      {/* Noise overlay */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '256px 256px',
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-col items-center gap-8">
        <div className="text-center">
          <h1 className="text-5xl md:text-7xl font-black tracking-tight uppercase mb-3">
            Bummer
          </h1>
          <p className="text-[var(--color-text-dim)] text-sm tracking-[0.04em]"
            style={{ fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', ui-monospace, monospace" }}>
            The Death of Shuffle.
          </p>
        </div>

        <div className="w-full max-w-xs h-px bg-[var(--color-border)]" />

        <form onSubmit={handleGoogleSignIn} className="flex flex-col items-center gap-4">
          {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}
          <button type="submit" disabled={loading}
            className="flex items-center justify-center gap-3 w-full max-w-xs bg-black text-white font-medium text-sm px-5 py-2.5 rounded-lg border border-[#333] transition-all duration-200 hover:bg-[#191919] hover:border-[#555] disabled:opacity-50"
            style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
            <svg width="16" height="16" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.0 24.0 0 0 0 0 21.56l7.98-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            {loading ? 'Signing in…' : 'Continue with Google'}
          </button>
        </form>
      </div>
    </div>
  )
}
