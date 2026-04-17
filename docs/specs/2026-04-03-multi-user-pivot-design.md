# Multi-User Pivot Design

**Date:** 2026-04-03
**Status:** Approved

## Overview

Transform Crate from a single-user app into a multi-user app supporting invited friends. Each user brings their own Spotify developer app credentials (BYOK) to sidestep Spotify's dev mode user cap. Supabase Auth handles Crate login; Spotify OAuth (PKCE) is driven by the frontend using each user's own `client_id`.

Target: ~4 users (Alex + 3 friends) initially, invite-only.

---

## 1. Database Schema

### New tables

**`invite_codes`**
```sql
id          uuid primary key default gen_random_uuid()
code        text unique not null
created_at  timestamptz default now()
redeemed_by uuid references auth.users(id)
redeemed_at timestamptz
```

**`profiles`** (thin extension of `auth.users`)
```sql
id                uuid primary key references auth.users(id)
invite_code_used  text references invite_codes(code)
created_at        timestamptz default now()
```

**`spotify_tokens`** (replaces `.spotify_cache` file)
```sql
user_id       uuid primary key references auth.users(id)
client_id     text not null
access_token  text
refresh_token text
expires_at    timestamptz
updated_at    timestamptz default now()
```

### Existing tables

Add `user_id UUID NOT NULL REFERENCES auth.users(id)` to:
- `album_metadata`
- `collections`
- `collection_albums`
- `library_cache`
- `library_snapshots`
- `play_history`

Existing data is wiped (no migration). Tables start fresh; library re-syncs from Spotify after first login.

### RLS policies

Every table gets the same policy pattern:
```sql
CREATE POLICY "user_isolation" ON <table>
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

`spotify_tokens` uses `id = auth.uid()` (primary key is user_id).

---

## 2. Authentication — Crate Login

**Method:** Supabase Auth with magic link (email, no password).

**Signup flow (new user with invite code):**
1. User navigates to Crate
2. Enters email + invite code on the signup screen
3. Backend `POST /auth/redeem-invite` validates the code (unused, exists), calls Supabase Auth to send magic link, marks code as redeemed
4. User clicks magic link → Supabase Auth session established
5. Redirect to BYOK onboarding

**Return login:**
- Enter email → magic link → session restored. No invite code on subsequent logins.

**Invite code generation:**
- Alex runs a backend script (`python scripts/generate_invite.py`) to insert rows into `invite_codes`
- No admin UI needed yet

---

## 3. BYOK Spotify Credential Flow

Client secret is **not needed**. PKCE eliminates the requirement for a client secret entirely — users only provide their `client_id`.

**Onboarding (one-time, after first Crate login):**
1. User is prompted: "Enter your Spotify app's Client ID"
2. `client_id` stored in `localStorage`
3. Frontend drives Spotify OAuth via PKCE:
   - Generate `code_verifier` + `code_challenge`
   - Redirect to `accounts.spotify.com/authorize` with `client_id`, scopes, PKCE params
   - Handle callback, exchange code for access + refresh tokens (no secret needed)
4. Access token used immediately for library sync
5. Consent prompt: "Allow Crate to store your refresh token server-side for background sync?"
   - If yes: `POST /auth/spotify-token` stores `(client_id, refresh_token, expires_at)` in `spotify_tokens`
   - If no: tokens stay in `localStorage` only (background sync disabled for this user)

**Token refresh:**
- Frontend: refreshes using `client_id` (from localStorage) + `refresh_token` (from localStorage or DB)
- Backend: for background sync, refreshes using `client_id` + `refresh_token` from `spotify_tokens` table — PKCE refresh requires only `client_id`, no secret

---

## 4. Backend Changes

### JWT validation middleware

Every protected endpoint validates the Supabase Auth JWT:
- Extract from `Authorization: Bearer <token>` header
- Verify with `SUPABASE_JWT_SECRET` (already in `.env`)
- Extract `sub` claim as `user_id`
- Create a per-request Supabase client authenticated as that user (so RLS is enforced automatically)

### Per-request Supabase client

Replace the global Supabase client with a factory that accepts the user's JWT:
```python
def get_supabase_client(token: str) -> Client:
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY, options=ClientOptions(
        headers={"Authorization": f"Bearer {token}"}
    ))
```

RLS then scopes all queries automatically — no `WHERE user_id = ?` needed in application code.

### spotify_client.py rewrite

- Remove `SpotifyOAuth`, `.spotify_cache`, single-user assumptions
- New `get_spotify(user_id)`: loads tokens from `spotify_tokens` table, refreshes if expired, returns `spotipy.Spotify(auth=access_token)`
- Background sync routes use this to act on behalf of each user

### New endpoints

- `POST /auth/redeem-invite` — public; validates invite code, triggers magic link, marks code redeemed
- `POST /auth/spotify-token` — authenticated; stores Spotify tokens in `spotify_tokens`
- `DELETE /auth/spotify-token` — authenticated; removes stored tokens (revoke consent)

---

## 5. Frontend Changes

### `useSpotifyAuth` hook

Owns the PKCE flow:
- `initiateLogin()`: generates verifier/challenge, redirects to Spotify
- `handleCallback(code)`: exchanges code for tokens, stores in localStorage + optionally backend
- `getAccessToken()`: returns valid token, refreshing if needed
- `logout()`: clears localStorage tokens

### Auth wiring

All API calls send one header:
- `Authorization: Bearer <supabase-jwt>` (Crate session)

Backend resolves the Spotify access token from `spotify_tokens` for every user. Frontend never passes Spotify tokens to the backend — it only uses them directly for frontend-driven PKCE operations.

### Onboarding wizard

Post-login screen (shown only on first login, detects missing `client_id` in localStorage):
1. "Welcome to Crate" — brief intro
2. "Enter your Spotify Client ID" — text field, link to Spotify Developer Dashboard
3. Spotify OAuth redirect (automatic after client_id entered)
4. Consent screen for refresh token storage
5. Library sync initiated → redirect to main app

### Signup screen

Replaces current unauthenticated state:
- Email field + invite code field
- "Send magic link" button
- Error states: invalid code, already used, email send failure

---

## 6. Data Wipe & Fresh Start

No migration. On deploy:
1. Drop and recreate tables with `user_id NOT NULL` columns
2. Enable RLS policies
3. Alex signs in via magic link, enters client_id, runs Spotify OAuth
4. Library syncs fresh from Spotify

All existing Supabase data (library cache, collections, etc.) is discarded.

---

## 7. Testing

**Backend (pytest):**
- JWT validation middleware: valid token, expired token, missing token, wrong secret
- `POST /auth/redeem-invite`: valid code, already-redeemed code, nonexistent code
- `POST /auth/spotify-token`: stores tokens, overwrites existing
- `get_spotify(user_id)`: token refresh logic, missing token error
- RLS enforcement: user A cannot read user B's data

**Frontend (Vitest):**
- `useSpotifyAuth`: PKCE flow initiation, callback handling, token refresh, logout
- Onboarding wizard: renders on missing client_id, skips if present
- Signup screen: form validation, error states

**E2E (Playwright):**
- Full signup flow: invite code → magic link → BYOK setup → library sync
- Return login: email → magic link → main app
- Data isolation: two test users cannot see each other's data

---

## Out of Scope

- Admin UI for invite code generation (use script)
- Custom email sender domain (use Supabase default mailer)
- Phase 2+ (onboarding polish, scaling, monetization)
- Apple Music support
