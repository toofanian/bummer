# Landing Page + Domain Cutover — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a static marketing landing page at `thedeathofshuffle.com` and move the Crate app to `app.thedeathofshuffle.com` without breaking existing Spotify OAuth for the current user.

**Architecture:** Convert the Vite build to multi-page mode with two HTML entries (`index.html` = app, `landing.html` = landing). Host-based rewrites in `vercel.json` route each domain to the right entry. Auth cutover is a sequenced manual checklist that adds new OAuth redirect URIs alongside existing ones, then flips env vars, with the old Vercel URL kept live as a rollback safety net.

**Tech Stack:** React 19, Vite 7, Vitest 4, Tailwind 4, Vercel rewrites, Supabase Auth, Spotify OAuth PKCE.

**Spec:** `docs/specs/2026-04-11-landing-page-domain-cutover-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/landing.html` | Create | Landing page HTML entry; loads `/src/landing/main.jsx` and carries `og:*` meta tags |
| `frontend/src/landing/main.jsx` | Create | Landing React entrypoint (mounts `<Landing />`) |
| `frontend/src/landing/Landing.jsx` | Create | Hero, thesis, screenshots, CTA — all static JSX |
| `frontend/src/landing/Landing.test.jsx` | Create | Render, CTA href, thesis paragraphs, headline text |
| `frontend/src/landing/landing.css` | Create | Scoped CSS (or Tailwind classes; see Chunk 1 Task 2) |
| `frontend/src/shared/` | Create | Placeholder logo SVG + any tokens shared between landing and app |
| `frontend/public/screenshots/` | Create | Placeholder PNGs committed for landing screenshots |
| `frontend/public/og.png` | Create | 1200×630 placeholder for link previews |
| `frontend/vite.config.js` | Modify | Add `build.rollupOptions.input` with `app` + `landing` entries |
| `vercel.json` (repo root) | Modify | Extend existing `/api/*` + SPA rewrites with host-based landing page rewrites. Preserve all existing `functions` / `buildCommand` / `outputDirectory` config. |
| `frontend/index.html` | Modify | Add minimal `og:*` meta tags for link previews when app URL is shared directly |

---

## Chunk 1: Landing page scaffolding (code only, no infra)

### Task 1: Vite multi-page build

**Files:** `frontend/vite.config.js`, `frontend/landing.html`, `frontend/src/landing/main.jsx`, `frontend/src/landing/Landing.jsx`

- [ ] **Step 1: Create a stub landing entry that Vite can resolve**

  Create `frontend/src/landing/Landing.jsx`:

  ```jsx
  export default function Landing() {
    return <main><h1>the death of shuffle.</h1></main>
  }
  ```

  Create `frontend/src/landing/main.jsx`:

  ```jsx
  import { StrictMode } from 'react'
  import { createRoot } from 'react-dom/client'
  import Landing from './Landing'
  import '../tailwind.css'

  createRoot(document.getElementById('root')).render(
    <StrictMode><Landing /></StrictMode>
  )
  ```

  Create `frontend/landing.html` (clone of `frontend/index.html` but pointed at the landing entry and with a distinct `<title>`):

  ```html
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
      <meta name="theme-color" content="#111111" />
      <title>the death of shuffle.</title>
    </head>
    <body>
      <div id="root"></div>
      <script type="module" src="/src/landing/main.jsx"></script>
    </body>
  </html>
  ```

- [ ] **Step 2: Update `vite.config.js` with multi-page input**

  Add imports and `build.rollupOptions.input`:

  ```js
  import { resolve } from 'path'
  import { fileURLToPath } from 'url'
  // ...
  const __dirname = fileURLToPath(new URL('.', import.meta.url))

  export default defineConfig({
    plugins: [react(), tailwindcss()],
    define: { /* existing */ },
    build: {
      rollupOptions: {
        input: {
          app: resolve(__dirname, 'index.html'),
          landing: resolve(__dirname, 'landing.html'),
        },
      },
    },
    test: { /* existing */ },
  })
  ```

- [ ] **Step 3: Build smoke test**

  ```bash
  cd frontend && npm run build
  ls dist/index.html dist/landing.html
  ```

  Expected: both files exist. If either is missing, the multi-page config is wrong.

- [ ] **Step 4: Dev server smoke test**

  ```bash
  cd frontend && npm run dev
  ```

  Expected: `/` serves the app (unchanged), `/landing.html` serves the landing stub. Kill dev server after verifying.

- [ ] **Step 5: Run existing test suite — nothing should regress**

  ```bash
  cd frontend && npx vitest run
  cd frontend && npx playwright test --config e2e/playwright.config.js
  ```

  Expected: all existing tests pass. Playwright still hits `/` which is still the app.

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/vite.config.js frontend/landing.html frontend/src/landing
  git commit -m "chore: enable Vite multi-page build for landing page

  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
  ```

---

### Task 2: Landing page content + tests (TDD)

**Files:** `frontend/src/landing/Landing.jsx`, `frontend/src/landing/Landing.test.jsx`, `frontend/public/screenshots/*.png`, `frontend/src/shared/logo.svg`

- [ ] **Step 1: Write failing test — headline, thesis, CTA**

  Create `frontend/src/landing/Landing.test.jsx`:

  ```jsx
  import { render, screen } from '@testing-library/react'
  import { describe, it, expect } from 'vitest'
  import Landing from './Landing'

  describe('Landing page', () => {
    it('renders the headline', () => {
      render(<Landing />)
      expect(screen.getByRole('heading', { level: 1, name: /the death of shuffle/i })).toBeInTheDocument()
    })

    it('renders the three thesis statements', () => {
      render(<Landing />)
      expect(screen.getByText(/shuffle culture flattens/i)).toBeInTheDocument()
      expect(screen.getByText(/album is the unit of listening/i)).toBeInTheDocument()
      expect(screen.getByText(/curation is a human act/i)).toBeInTheDocument()
    })

    it('renders a Try Crate CTA pointing at the app subdomain', () => {
      render(<Landing />)
      const ctas = screen.getAllByRole('link', { name: /try crate/i })
      expect(ctas.length).toBeGreaterThanOrEqual(1)
      ctas.forEach(cta => {
        expect(cta).toHaveAttribute('href', 'https://app.thedeathofshuffle.com')
      })
    })

    it('renders three screenshot captions', () => {
      render(<Landing />)
      expect(screen.getByText(/collections that mean something/i)).toBeInTheDocument()
      expect(screen.getByText(/artists grouped the way an artist would group them/i)).toBeInTheDocument()
      expect(screen.getByText(/play an album, front to back/i)).toBeInTheDocument()
    })
  })
  ```

- [ ] **Step 2: Run test, confirm it fails**

  ```bash
  cd frontend && npx vitest run src/landing/Landing.test.jsx
  ```

  Expected: FAIL.

- [ ] **Step 3: Implement `Landing.jsx`**

  Use Tailwind classes for layout. Structure:
  - Hero section: dark background, centered wordmark placeholder, `<h1>` headline, subhead, primary CTA `<a href="https://app.thedeathofshuffle.com">` styled as a button.
  - Thesis section: three `<p>` blocks with the three thesis statements from the spec.
  - Screenshots section: three `<figure>` elements, each with `<img src="/screenshots/collections.png">` (etc.) and a `<figcaption>` with the caption text from the test.
  - Secondary CTA (same `href`).
  - Footer: copyright line.

  Use placeholder images: commit three 1x1 PNGs at `frontend/public/screenshots/collections.png`, `artists.png`, `play.png`. Real screenshots come later.

- [ ] **Step 4: Run test, confirm pass**

  ```bash
  cd frontend && npx vitest run src/landing/Landing.test.jsx
  ```

  Expected: PASS.

- [ ] **Step 5: Manual visual check**

  ```bash
  cd frontend && npm run dev
  ```

  Open `http://localhost:5173/landing.html`. Verify the page scrolls, the CTA looks like a button, and mobile (375px viewport via devtools) renders nicely.

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/src/landing frontend/public/screenshots
  git commit -m "feat(landing): hero, thesis, screenshots, CTA

  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
  ```

---

## Chunk 2: Open Graph + link previews

### Task 1: Add og:* meta tags to both HTML entries

**Files:** `frontend/landing.html`, `frontend/index.html`, `frontend/public/og.png`

- [ ] **Step 1: Create placeholder `frontend/public/og.png`**

  1200×630 PNG. For the first pass, any dark-background image with "the death of shuffle." in a readable typeface is sufficient. Can be replaced when the real logo lands.

- [ ] **Step 2: Add og:* tags to `frontend/landing.html`**

  Inside `<head>`:

  ```html
  <meta property="og:title" content="the death of shuffle." />
  <meta property="og:description" content="Your music library deserves better. Album-first, curation-first music library for Spotify." />
  <meta property="og:url" content="https://thedeathofshuffle.com" />
  <meta property="og:type" content="website" />
  <meta property="og:image" content="https://thedeathofshuffle.com/og.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="https://thedeathofshuffle.com/og.png" />
  <meta name="description" content="Your music library deserves better. Album-first, curation-first music library for Spotify." />
  ```

- [ ] **Step 3: Add minimal og:* tags to `frontend/index.html`**

  Same tags but with `og:url` set to `https://app.thedeathofshuffle.com` and a slightly different title/description that reflects the app. Keeps link previews credible even if someone shares the app URL directly.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/landing.html frontend/index.html frontend/public/og.png
  git commit -m "feat(landing): Open Graph + Twitter Card meta tags

  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
  ```

- [ ] **Step 5: (Manual, post-deploy)** Verify iMessage preview by sending the URL to yourself after cutover. Verify with Facebook / Twitter debuggers.

---

## Chunk 3: Vercel rewrites

### Task 1: Update the root `vercel.json`

**Files:** `vercel.json` (at the repo root — NOT `frontend/vercel.json`, which was removed during sub-project C)

**Context:** Post-sub-project-C, `vercel.json` lives at the repo root and carves out `/api/*` for the Vercel Python backend function at `api/index.py`. Any new rewrites MUST:
1. Keep the `/api/(.*)` rule first so backend routes are never shadowed by SPA/landing rewrites.
2. Use a negative-lookahead source pattern (`/((?!api/).*)`) on all SPA/landing rewrites so they never match API paths.
3. Preserve all existing top-level config (`buildCommand`, `outputDirectory`, `framework`, `functions`, `excludeFiles`).

- [ ] **Step 1: Read current root `vercel.json`**

  ```bash
  cat vercel.json
  ```

  Expected: you see the existing `/api/(.*)` → `/api/index` rule and a `/((?!api/).*)` → `/index.html` rule, plus `functions` and `excludeFiles` for the Python function.

- [ ] **Step 2: Edit `vercel.json` to add host-based landing rewrites**

  Replace the single non-API rewrite with three host-gated rewrites. Final `rewrites` array:

  ```json
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index" },
    {
      "source": "/((?!api/).*)",
      "has": [{ "type": "host", "value": "thedeathofshuffle.com" }],
      "destination": "/landing.html"
    },
    {
      "source": "/((?!api/).*)",
      "has": [{ "type": "host", "value": "www.thedeathofshuffle.com" }],
      "destination": "/landing.html"
    },
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
  ```

  Leave `buildCommand`, `outputDirectory`, `framework`, `functions`, and `excludeFiles` untouched.

- [ ] **Step 3: Commit**

  ```bash
  git add vercel.json
  git commit -m "chore(vercel): host-based rewrites for landing + app

  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
  ```

- [ ] **Step 4: Push branch and verify Vercel preview deploy**

  Vercel builds a preview. The preview URL won't exercise the host-based rewrite (the host doesn't match `thedeathofshuffle.com`), so it'll fall through to `/index.html` and serve the app. That's the expected behavior — preview = app. The landing entry can be verified by visiting `<preview-url>/landing.html` directly. `/api/*` paths must still return JSON from the Python function; verify with `curl -sI <preview-url>/api/health`.

---

## Chunk 4: Domain attach (manual, in Vercel dashboard)

**All steps in this chunk are manual UI actions in the Vercel dashboard. No commits.**

- [ ] **Step 1:** Vercel dashboard → Crate project → Settings → Domains → Add `thedeathofshuffle.com`. Follow Vercel's DNS instructions (A record on apex or nameservers if using Vercel DNS).

- [ ] **Step 2:** Add `app.thedeathofshuffle.com` → CNAME to `cname.vercel-dns.com`.

- [ ] **Step 3:** Add `www.thedeathofshuffle.com` → configure as redirect to `https://thedeathofshuffle.com`.

- [ ] **Step 4:** Wait for SSL provisioning (usually < 2 minutes).

- [ ] **Step 5: Validation**

  ```bash
  curl -sI https://thedeathofshuffle.com | head -5
  curl -sI https://app.thedeathofshuffle.com | head -5
  ```

  Expected: `200 OK` from both. The apex should serve the landing `<title>`; the app subdomain should serve the app HTML.

  ```bash
  curl -s https://thedeathofshuffle.com | grep -o '<title>[^<]*</title>'
  curl -s https://app.thedeathofshuffle.com | grep -o '<title>[^<]*</title>'
  ```

  Expected: `the death of shuffle.` and `Crate` respectively.

---

## Chunk 5: Auth cutover (manual, sequenced — follow exactly)

**This is the critical chunk. Each step is gated on the previous one succeeding. If any step fails, STOP and roll back per the Rollback section at the bottom.**

### Task 1: Pre-add new redirect URIs (nothing user-facing changes yet)

- [ ] **Step 1: Spotify Developer Dashboard**

  1. Log in to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard).
  2. Open your Crate app.
  3. Edit Settings → Redirect URIs → **add** `https://app.thedeathofshuffle.com/auth/spotify/callback` (keep the existing Vercel-URL entry).
  4. Save. Verify both URIs appear in the list.

- [ ] **Step 2: Supabase dashboard**

  1. Supabase project → Authentication → URL Configuration.
  2. Add `https://app.thedeathofshuffle.com/**` to Redirect URLs (keep existing entries).
  3. Leave Site URL as-is for now; flip in Task 3.

- [ ] **Step 3: Google Cloud Console** (only if Google OAuth client is managed there rather than purely via Supabase)

  1. Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Client.
  2. Authorized JavaScript origins → add `https://app.thedeathofshuffle.com`.
  3. Authorized redirect URIs → verify Supabase's `https://<project>.supabase.co/auth/v1/callback` is present (no change needed).
  4. Save.

- [ ] **Step 4: Backend env vars (same Vercel project)**

  Post-sub-project-C, there is no Railway/Render backend — the FastAPI app is served by `api/index.py` in the same Vercel project. Update `ALLOWED_ORIGINS` in Vercel's Project → Settings → Environment Variables (Production scope) to include all three origins (comma-separated):

  ```
  https://thedeathofshuffle.com,https://app.thedeathofshuffle.com,https://<existing-vercel-url>.vercel.app
  ```

  A single project redeploy (Chunk 5 Task 2 Step 2) picks this up along with `VITE_SPOTIFY_REDIRECT_URI`. After deploy, verify CORS from the new origin:

  ```bash
  curl -sI -H "Origin: https://app.thedeathofshuffle.com" https://app.thedeathofshuffle.com/api/health
  ```

  Expected: 200 with an `access-control-allow-origin` header echoing the request origin.

### Task 2: Flip the frontend env var

- [ ] **Step 1: Vercel → Project → Settings → Environment Variables**

  Update `VITE_SPOTIFY_REDIRECT_URI` (Production) to:

  ```
  https://app.thedeathofshuffle.com/auth/spotify/callback
  ```

- [ ] **Step 2: Trigger a production redeploy**

  Vercel dashboard → Deployments → Redeploy latest production deployment (or push an empty commit). A single redeploy picks up both the frontend `VITE_SPOTIFY_REDIRECT_URI` change and the backend `ALLOWED_ORIGINS` change since they share one project.

- [ ] **Step 3: Verify the new URI is live**

  Open `https://app.thedeathofshuffle.com` in an incognito window. In devtools → Sources, find the built JS for `OnboardingWizard` or `useSpotifyAuth` and search for `auth/spotify/callback`. Confirm it's the new URL.

### Task 3: End-to-end sanity (real login)

- [ ] **Step 1: Supabase Site URL flip**

  Supabase → Authentication → URL Configuration → Site URL → set to `https://app.thedeathofshuffle.com`. Save.

- [ ] **Step 2: Fresh Google sign-in**

  Incognito → `https://app.thedeathofshuffle.com` → sign in with Google. Confirm the OAuth popup shows `app.thedeathofshuffle.com` and completes without errors.

- [ ] **Step 3: Fresh Spotify connect**

  Complete the Spotify onboarding flow with the new redirect URI. Confirm Spotify accepts the redirect (no `redirect_uri_mismatch` error) and library sync completes.

- [ ] **Step 4: Play an album**

  Start playback. Confirm the existing playback bar and polling work correctly.

- [ ] **Step 5: Landing → CTA → app**

  Open `https://thedeathofshuffle.com`, click "Try Crate", confirm you land on the app (same session carries over).

- [ ] **Step 6: Old URL still works**

  Open the old Vercel preview URL in another incognito window. Confirm the app still loads and a sign-in works there too. This is the rollback safety net.

### Rollback (if any step in this chunk fails)

1. Vercel → Environment Variables → revert `VITE_SPOTIFY_REDIRECT_URI` to the old Vercel URL.
2. Redeploy frontend.
3. Supabase → Site URL → revert.
4. The old URL still works because no allowlists were removed. You are safe.

---

## Chunk 6: Grace period cleanup (delayed ~30 days)

**Do NOT run this chunk immediately after cutover. Wait at least 30 days of stable operation on the new domains.**

- [ ] **Step 1:** Vercel dashboard → Redirects → add redirect from the old Vercel preview URL's apex to `https://app.thedeathofshuffle.com` (status 308).

- [ ] **Step 2:** Spotify Dev Dashboard → remove the old redirect URI from your Crate app's Redirect URIs list.

- [ ] **Step 3:** Supabase → Authentication → URL Configuration → remove the old Vercel URL from the Redirect URLs allowlist.

- [ ] **Step 4:** Vercel project env vars → `ALLOWED_ORIGINS` → remove the old Vercel URL entry. Redeploy (same Vercel project handles both frontend + backend).

- [ ] **Step 5:** Remove the third fallback rewrite rule from `vercel.json` (the `/(.*) → /index.html` catchall) IF AND ONLY IF you're also removing the old Vercel URL as a fallback target. Otherwise leave it — it's the app SPA rewrite and serves `app.thedeathofshuffle.com` too.

  **Important:** the third rule is still needed to make `app.thedeathofshuffle.com/some/path` SPA-route correctly. Do NOT remove it. Only remove it if Vercel's default catch-all behavior is sufficient (test first).

- [ ] **Step 6: Commit any vercel.json changes**

  ```bash
  git add vercel.json
  git commit -m "chore(vercel): post-grace-period cleanup

  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
  git push
  ```

---

## Implementation order

1. **Chunks 1 + 2** can be built and merged independently of any domain work. They produce a working landing page reachable at `/landing.html` with no infra dependencies. Ship these first.
2. **Chunk 3** (vercel.json rewrites) must land before the domains attach, but is a one-file change — squash with Chunk 1/2 or land separately.
3. **Chunk 4** (domain attach) is manual UI work. Do after Chunk 3 is deployed to production.
4. **Chunk 5** (auth cutover) happens immediately after Chunk 4 on the same day. Follow the exact sequence.
5. **Chunk 6** (grace period cleanup) happens ~30 days later.

Chunks 1 + 2 are code-only and reversible; Chunks 3 + 4 + 5 are one chained sequence. Plan a ~1 hour maintenance window for Chunks 4 + 5 together.

## Dependencies

No new npm packages. All infrastructure (Vercel, Supabase, Spotify Dashboard) already provisioned. Requires access to:

- Vercel project settings
- Spotify Developer Dashboard (for the user's own app)
- Supabase dashboard
- Google Cloud Console (only if Google OAuth client is managed there)
- Vercel project env vars (used by both frontend build and the Python function at `api/index.py`)
