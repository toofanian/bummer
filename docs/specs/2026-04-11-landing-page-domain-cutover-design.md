# Landing Page + Domain Cutover — Design Spec

**Date:** 2026-04-11
**Scope:** Introduce a public marketing landing page at `thedeathofshuffle.com`, move the Crate app to `app.thedeathofshuffle.com`, and coordinate the OAuth redirect URI cutover without breaking existing logins.

**Related:** Backlog item "Landing page + domain cutover" (Platform column). Depends on (but does not block on) the "App logo + link preview" backlog item for final logo assets — a placeholder image is acceptable for initial launch.

---

## Problem

Crate is currently reachable only at its Vercel preview URL. An unauthenticated visitor lands directly on the Google OAuth sign-in screen with no context for what Crate is, what it does, or why they'd want to use it. This is a bad first impression for a product with a strong point of view.

Additionally:

- The newly-acquired domain `thedeathofshuffle.com` is a manifesto-style brand anchor that wants an essay/landing page behind it, not a login gate.
- Link previews shared via iMessage, Slack, etc. currently show no preview card or a default Vercel one (see the separate "App logo + link preview" task).
- The app is invisible to search engines because everything meaningful lives behind authentication.
- The product thesis ("the album is the unit of listening; curation is not randomization; the death of shuffle") has no public surface area.

## Goals

1. Host a static, pitchable landing page at `thedeathofshuffle.com` containing the product manifesto, a handful of screenshots, and a clear CTA into the app.
2. Host the existing Crate app at `app.thedeathofshuffle.com`.
3. Complete the cutover **without breaking any currently working Spotify OAuth flow** for existing users.
4. Keep the codebase in a single repo (single `frontend/` package) so branding assets, color tokens, and typography can be shared.
5. Preserve the existing current Vercel preview URL as a working fallback for a grace period, in case DNS or OAuth misconfiguration requires a rollback.

## Non-goals

- Final logo design. A placeholder wordmark is acceptable for launch; the real logo is tracked separately in the "App logo + link preview" backlog item.
- SEO beyond basic Open Graph + `<title>` + `<meta description>`. No sitemap, analytics beacons, or structured data in v1.
- Blog, docs, or pricing pages. This is a single-page marketing site.
- Multi-user signup flows beyond what already exists. This spec does not touch auth logic — only redirect URI configuration.
- Apple Music onboarding flow changes (tracked separately under Apple Music integration).

---

## User-facing design

### URL shape after cutover

| URL | Purpose |
| --- | --- |
| `https://thedeathofshuffle.com` | Static marketing landing page |
| `https://app.thedeathofshuffle.com` | Crate web app (authenticated experience) |
| `https://<existing-vercel-url>.vercel.app` | Kept alive as fallback for ~30 days post-cutover, then redirects to `app.thedeathofshuffle.com` |

### Landing page content (v1)

A single scrollable page, dark theme matching Crate's visual language, roughly this structure:

1. **Hero**
   - Wordmark / logo (placeholder initially)
   - Headline: **"the death of shuffle."**
   - Subhead: *Your music library deserves better.*
   - Primary CTA button: **Try Crate** → links to `https://app.thedeathofshuffle.com`
2. **The thesis** (3 short paragraphs, each on its own row)
   - Shuffle culture flattens music into a bottomless feed.
   - The album is the unit of listening — artists sequenced those tracks on purpose.
   - Curation is a human act. Your library is not an algorithm's playground.
3. **What Crate does** (3 screenshots with one-line captions)
   - Collections that mean something.
   - Artists grouped the way an artist would group them.
   - Play an album, front to back.
4. **Secondary CTA** (repeats the "Try Crate" button)
5. **Footer** — minimal: © year, link to source repo (if repo is public at that point), maybe a one-line author credit.

### Interaction model

- No client-side routing. Pure HTML + CSS with one or two small JS interactions at most (e.g., smooth-scroll to anchors). Landing page should weigh < 100 KB uncompressed including fonts.
- No login / signup on the landing page itself — the CTA simply navigates to the app, where the existing Google OAuth flow takes over.
- Mobile-first layout. Should render nicely at 375px width.

---

## Technical architecture

### Repo structure

Introduce a Vite multi-page setup inside the existing `frontend/` package. No new packages, no new build tools.

```
frontend/
├── index.html           ← UNCHANGED: app SPA entry (stays at / for dev + Playwright)
├── landing.html         ← NEW: landing page entry
├── src/
│   ├── landing/         ← NEW: landing page React components
│   │   ├── main.jsx
│   │   └── Landing.jsx
│   ├── shared/          ← NEW: tokens, logo, typography shared between landing + app
│   └── (existing app code at src/ root stays put)
└── vite.config.js       ← updated: declare multiple rollupOptions.input entries
```

**Key choice:** `index.html` remains the app entry, and the landing page gets a new `landing.html`. Reversing the naming (making landing the default at `/`) would force every Playwright e2e test's `page.goto('/')` to be rewritten and would conflict with dev-mode muscle memory. The production Vercel rewrite (below) is what makes the *landing* page the root of `thedeathofshuffle.com`, so the local file name is just an implementation detail.

### Vite multi-page configuration

Vite supports multi-page applications natively via `rollupOptions.input`. In `vite.config.js`:

```js
import { resolve } from 'path'
// ...
export default defineConfig({
  // ...existing config
  build: {
    rollupOptions: {
      input: {
        app: resolve(__dirname, 'index.html'),
        landing: resolve(__dirname, 'landing.html'),
      },
    },
  },
})
```

Both HTML entries will be emitted to `dist/` on build. Each bundles only the JS it imports, so the landing page ships a much smaller bundle than the app.

### Vercel routing

Both the frontend and the backend Python function already live in the **same Vercel project** (post–sub-project C cutover). The root `vercel.json` currently carves out `/api/*` for the ASGI backend and sends everything else to the SPA. We extend it with host-based rewrites for the landing host, keeping the `/api/*` rule first so the backend route is never shadowed.

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "cd frontend && npm install && npm run build",
  "outputDirectory": "frontend/dist",
  "framework": null,
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
  ],
  "functions": {
    "api/index.py": { "runtime": "@vercel/python@4.3.0", "maxDuration": 60 }
  }
}
```

The `/api/(.*)` rule comes first so backend calls from either domain continue to hit `api/index.py` untouched. The apex and `www` landing-page hosts rewrite the non-API traffic to `/landing.html`; everything else (including `app.thedeathofshuffle.com` and the existing Vercel preview URL) falls through to the SPA rewrite at `/index.html`. This preserves the old Vercel preview URL as a working app fallback for free.

**Note:** `vercel.json` lives at the **repo root** (not `frontend/`) since the sub-project C cutover. Previously it was `frontend/vercel.json`, which was removed during the Vercel Python migration. The full `functions` and `excludeFiles` config already on main must be preserved when applying this patch.

### DNS (configured in Vercel Domains panel)

- `thedeathofshuffle.com` (apex) → Vercel automatic A record
- `app.thedeathofshuffle.com` → CNAME `cname.vercel-dns.com`
- SSL auto-provisioned by Vercel for both

### Shared assets

Logo SVG, color tokens, and typography live in `src/shared/` and are imported by both entries. This ensures the landing page and the app stay visually coherent without manual duplication.

---

## Auth cutover (the thorny part)

Crate has **two separate OAuth flows**, and they behave differently with respect to domain changes.

### Flow 1: Supabase Google OAuth (user authentication into Crate)

Used for "who is logged in to Crate itself." Configured in the Supabase dashboard and at Google Cloud Console.

**Places that need updating before cutover:**

1. **Supabase dashboard** → Authentication → URL Configuration:
   - Site URL: set to `https://app.thedeathofshuffle.com`
   - Redirect URLs: add `https://app.thedeathofshuffle.com/**` (keep the existing Vercel URL in the list as well during the grace period)
2. **Google Cloud Console** → OAuth 2.0 Client ID → Authorized JavaScript origins + Authorized redirect URIs:
   - Add `https://app.thedeathofshuffle.com` (keep existing entries)
   - Supabase's callback URL (e.g. `https://<project>.supabase.co/auth/v1/callback`) should already be present and unchanged
3. **Frontend env on Vercel** (`VITE_*` vars): only update if any frontend code hard-codes a redirect origin (it should not — Supabase's `signInWithOAuth` derives it from the current `window.location.origin`)

**Risk:** Low. Supabase Google OAuth is origin-derived, so once the new domain is in the Supabase allowlist, it just works. Keep the old URL allowlisted during the grace period as a safety net.

### Flow 2: Spotify OAuth (BYOK — user supplies their own Spotify Developer app)

This is the critical one. Crate uses a bring-your-own-key model: each user creates a Spotify Developer app in their own Spotify Dashboard and pastes the Crate redirect URI into it during onboarding. The frontend reads this value from `VITE_SPOTIFY_REDIRECT_URI` (`frontend/src/components/OnboardingWizard.jsx:5`, `frontend/src/hooks/useSpotifyAuth.js:10`).

**Implication of a domain change:** every user's Spotify Developer app is currently configured with the old redirect URI (the existing Vercel URL). If the app moves to `app.thedeathofshuffle.com` and the frontend starts sending the new URI in its auth request, **Spotify will reject the login with a redirect_uri_mismatch error** until each user manually updates their own Spotify Developer app.

For today's single-user reality this is annoying but trivial — there's one Spotify dev app to update, owned by the primary user. For a future multi-user pivot this becomes a migration headache, but that's out of scope here.

**Cutover sequence (do these in order):**

1. **Pre-cutover (a day or two ahead):**
   a. In the user's Spotify Developer Dashboard, add `https://app.thedeathofshuffle.com/auth/spotify/callback` as an *additional* redirect URI alongside the existing Vercel one. Both URIs coexist.
   b. Verify in the Spotify Dashboard that both redirect URIs are saved.
2. **Domain attach & Vercel config:**
   a. Add both domains to the Vercel project.
   b. Deploy the multi-page build (`index.html` + `landing.html`) with the updated `vercel.json`.
   c. Verify the landing page loads at `https://thedeathofshuffle.com` and the app loads at `https://app.thedeathofshuffle.com` without touching env vars yet.
3. **Env var flip:**
   a. Update `VITE_SPOTIFY_REDIRECT_URI` on Vercel production → `https://app.thedeathofshuffle.com/auth/spotify/callback`
   b. Update `ALLOWED_ORIGINS` on the **same Vercel project** (the backend Python function at `api/index.py` reads it at runtime) to include `https://app.thedeathofshuffle.com` and `https://thedeathofshuffle.com` (keep the existing Vercel preview origin for fallback). Post-sub-project-C, the backend and frontend share one Vercel project and one env var scope — no separate Railway/Render deploy anymore.
   c. Redeploy the Vercel project (a single redeploy picks up both frontend and backend env changes).
4. **Validation:**
   a. Visit `https://app.thedeathofshuffle.com`, sign in with Google, connect Spotify, play an album.
   b. Visit the old Vercel URL, confirm it still serves the app (from the `vercel.json` fallback rule) and that a user with a session there still works.
   c. Visit `https://thedeathofshuffle.com`, click "Try Crate", land on the app with Google OAuth, sign in successfully.
5. **Grace period (~30 days):**
   a. Old Vercel URL stays live as a safety net.
   b. Old Spotify redirect URI stays registered in the user's Spotify Dev Dashboard.
6. **Post–grace period cleanup:**
   a. Set a redirect at the old Vercel URL to `https://app.thedeathofshuffle.com` (Vercel project → Redirects).
   b. Remove the old redirect URI from the user's Spotify Dev Dashboard.
   c. Remove the old Vercel URL from Supabase Redirect URLs allowlist.
   d. Remove fallback rewrite rules from `vercel.json`.

### Rollback procedure

If something breaks after cutover, rollback is straightforward because nothing is deleted during the cutover — only added:

1. Revert `VITE_SPOTIFY_REDIRECT_URI` on Vercel to the old Vercel URL
2. Redeploy
3. Old URL continues to work because no allowlists were removed

---

## Implementation phases

### Phase 1: Landing page scaffolding (can start immediately, no domain needed)

1. Add `src/landing/` with `Landing.jsx` and `main.jsx`.
2. Add `src/shared/` with logo placeholder and any tokens the landing page needs.
3. Add new `frontend/landing.html` wired to `/src/landing/main.jsx`.
4. Update `vite.config.js` with multi-page `rollupOptions.input` (entries: `app` → `index.html`, `landing` → `landing.html`).
5. Implement landing page content per the v1 structure above, using placeholder logo / screenshots.
6. `npm run build` produces both `dist/index.html` (app) and `dist/landing.html`. `npm run dev` serves the app at `/` and the landing page at `/landing.html`. Existing Playwright e2e tests continue to run unchanged.
7. Add Vitest coverage for the landing page (render test, CTA href, thesis paragraphs present).

**Exit criteria:** multi-page build works locally, landing page renders at `/landing.html`, existing app still runs at `/` with no regressions, all existing Vitest + Playwright tests pass.

### Phase 2: Vercel routing + domain attach

1. Update `vercel.json` with the host-based rewrite rules shown above.
2. In Vercel dashboard, add both `thedeathofshuffle.com` and `app.thedeathofshuffle.com` to the Crate project.
3. Deploy to production. Verify DNS propagates and SSL certs provision.
4. Visit both URLs and confirm correct entry renders from each host.
5. Confirm the old Vercel preview URL still serves the app.

**Exit criteria:** both domains serve the correct entry; old URL still works; no auth changes yet.

### Phase 3: Auth cutover

Follow the sequenced cutover steps in the "Auth cutover" section. Validate all flows before considering complete.

**Exit criteria:** sign-in works from `app.thedeathofshuffle.com`; sign-in still works from the old URL; Spotify playback works from both.

### Phase 4: Open Graph + link preview hookup (can overlap with "App logo + link preview" task)

1. Add `og:*` and `twitter:*` meta tags to `frontend/landing.html` with final copy and a placeholder or real og:image (1200×630 PNG in `frontend/public/og.png`).
2. Also add minimal `og:*` tags to `frontend/index.html` (the app) so sharing the app URL directly still renders a card.
3. Verify with Apple's rich-link preview (iMessage to yourself) and with the Facebook / Twitter debuggers.

**Exit criteria:** sharing `https://thedeathofshuffle.com` in iMessage renders a real preview card with the correct image and tagline.

### Phase 5: Grace period cleanup (~30 days later)

Remove fallback rules, old redirect URIs, and old allowlist entries per the cutover cleanup checklist.

---

## Testing strategy

- **Unit tests (Vitest):** the landing page has minimal logic, but any CTA click handlers or smooth-scroll functions get a small test.
- **Build smoke test:** `npm run build` succeeds and emits both `dist/index.html` and `dist/landing.html`.
- **Preview deploy validation:** Vercel preview deployments for this PR should serve both entries correctly based on host header simulation (Vercel preview URLs won't exercise the domain-based rewrite, so validation of the host-rewrite rule itself happens on production post-deploy).
- **Manual cutover checklist:** the exact sequence in "Auth cutover" is the test plan. Each step has a validation action.
- **Playwright E2E:** existing E2E suite should pass unchanged against `app.thedeathofshuffle.com` — it tests the app, not the landing page. Landing page doesn't need E2E coverage in v1.

---

## Open questions / decisions to make before implementation

1. **Landing page as React or as plain HTML?**
   - React + Vite reuses existing tooling and is familiar. Bundle is ~40–60 KB of React just to render a static page.
   - Plain HTML + CSS + a sprinkle of vanilla JS ships ~5 KB. Cleaner first paint.
   - **Recommendation:** React. The tooling is already set up, code style stays consistent, and the bundle size on a landing page with three screenshots isn't a meaningful constraint. Revisit if first-paint performance becomes a concern.
2. **Should screenshots be committed to the repo or hosted elsewhere?**
   - Committing to `frontend/public/screenshots/` is simplest. File size is fine for 3–5 PNGs.
   - **Recommendation:** commit to `frontend/public/screenshots/`.
3. **Does the landing page need dark/light mode?**
   - No — Crate's visual identity is dark-first. Landing page is dark-only in v1.
4. **Does the landing page need any analytics?**
   - Out of scope; tracked separately under the Observability backlog item. Do not add PostHog or any beacon in v1.
5. **What about the apex `thedeathofshuffle.com` when eventually someone visits `/some-path`?**
   - Phase 1: `vercel.json` rewrites `/(.*)` → `/landing.html` for the landing host, so every path on the apex renders the landing page. Good enough for launch.
   - Future: if we ever add `/manifesto`, `/press`, etc., revisit with a static router.
6. **Do we need `www.thedeathofshuffle.com`?**
   - Vercel supports adding `www.*` as an alias that redirects to the apex. Cheap to set up, avoids confusion.
   - **Recommendation:** yes, add `www.thedeathofshuffle.com` as a redirect to `https://thedeathofshuffle.com` during phase 2.

---

## Out of scope

- Real logo (tracked: "App logo + link preview")
- PostHog / analytics (tracked: "Observability & product telemetry")
- PWA install prompt on the landing page (tracked: "PWA install prompt")
- Multi-user onboarding UX changes (tracked: "Multi-user pivot")
- Backend refactor for serverless (tracked: "Prod + dev environment split — sub-project A")
- Apple Music onboarding redirect URI (Apple Music is not yet wired for OAuth; revisit when that feature lands)
