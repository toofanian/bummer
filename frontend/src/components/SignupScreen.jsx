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
            className="bg-[var(--color-text)] text-[var(--color-bg)] font-bold text-sm tracking-[0.08em] uppercase px-8 py-3 border-2 border-[var(--color-text)] transition-all duration-200 hover:bg-transparent hover:text-[var(--color-text)] hover:shadow-[0_0_24px_rgba(255,255,255,0.08)] active:scale-[0.97] disabled:opacity-50"
            style={{ fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', ui-monospace, monospace" }}>
            {loading ? 'Signing in…' : 'Sign in with Google'}
          </button>
        </form>
      </div>
    </div>
  )
}
