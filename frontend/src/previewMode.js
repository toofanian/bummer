/**
 * Preview-mode detection for Vercel preview deploys.
 *
 * Vercel injects VERCEL_ENV=preview into preview deploys and
 * VERCEL_ENV=production into production. We expose it to the client
 * bundle via VITE_VERCEL_ENV (set in the Vercel dashboard env vars).
 *
 * When IS_PREVIEW is true, the frontend synthesizes a fake Supabase
 * session for the seeded preview user and skips the Spotify onboarding
 * flow. The backend does the corresponding short-circuit in
 * auth_middleware.py.
 *
 * The hardcoded UUID matches:
 *   - `supabase/seed.sql` (the auth.users row)
 *   - `backend/auth_middleware.py` PREVIEW_USER_ID constant
 */
export const IS_PREVIEW = import.meta.env.VITE_VERCEL_ENV === 'preview'

export const PREVIEW_USER_ID = '00000000-0000-0000-0000-000000000001'

export const PREVIEW_USER_EMAIL = 'preview@crate.local'
