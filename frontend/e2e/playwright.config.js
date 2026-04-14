import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: {
    // Launch the Vite dev server with VITE_VERCEL_ENV=preview so the
    // app auto-logs in as the seeded preview user (see
    // frontend/src/previewMode.js + frontend/src/hooks/useAuth.js).
    // This replaces the old pattern of mocking /auth/status and
    // /auth/login, which became dead code after the Google OAuth
    // migration removed those endpoints from the frontend.
    // Stub Supabase env vars so supabaseClient.createClient() doesn't
    // warn about missing creds. In preview mode useAuth never calls
    // supabase.auth.*, but the client instance is still constructed
    // at module-load time, so the URL/key must be non-empty strings.
    command:
      'VITE_VERCEL_ENV=preview ' +
      'VITE_SUPABASE_URL=http://localhost:54321 ' +
      'VITE_SUPABASE_ANON_KEY=preview-stub ' +
      'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
