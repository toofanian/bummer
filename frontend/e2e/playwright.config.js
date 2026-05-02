import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: {
    // NOTE: The VITE_VERCEL_ENV=preview env var no longer triggers an
    // auth bypass (the preview dummy-account bypass was removed). E2E
    // tests that need authentication will need a real Supabase session.
    // Stub Supabase env vars so supabaseClient.createClient() doesn't
    // warn about missing creds — the client instance is constructed
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
