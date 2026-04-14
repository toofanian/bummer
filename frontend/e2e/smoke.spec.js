import { test, expect } from '@playwright/test'

test.describe('App smoke tests', () => {
  test('app HTML loads and root element exists', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#root')).toBeAttached()
  })

  // Note: the former 'unauthenticated' test was deleted with the move
  // to preview-mode E2E (VITE_VERCEL_ENV=preview auto-logs in). There
  // is no longer an unauthenticated state to exercise in E2E — the
  // old /auth/status and /auth/login endpoints no longer exist on the
  // frontend (removed in the Google OAuth migration).

  test('authenticated: library heading is visible', async ({ page }) => {
    await page.route('**/library/sync', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ synced_this_page: 0, total_in_cache: 0, spotify_total: 0, next_offset: 0, done: true }) })
    )
    await page.route('**/library/albums', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ albums: [] }) })
    )
    await page.route('**/collections', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    )
    await page.route('**/playback/state', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ is_playing: false, track: null, device: null }) })
    )

    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Library', exact: true })).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Mobile viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('authenticated: bottom tab bar renders on mobile', async ({ page }) => {
    // Mock all required API calls
    await page.route('**/auth/status', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true }) })
    )
    await page.route('**/library/sync', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ synced_this_page: 0, total_in_cache: 0, spotify_total: 0, next_offset: 0, done: true }) })
    )
    await page.route('**/library/albums', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ albums: [] }) })
    )
    await page.route('**/collections', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    )
    await page.route('**/playback/state', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ is_playing: false, track: null, device: null }) })
    )

    await page.goto('/')
    // BottomTabBar renders a <nav> element fixed at the bottom — verify it is present
    await expect(page.locator('nav').last()).toBeVisible({ timeout: 5000 })
    // Each tab has an aria-label button plus a visible <span> with the label text
    await expect(page.getByRole('button', { name: 'Home' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Library' })).toBeVisible()
  })

  test('authenticated: tab navigation switches views on mobile', async ({ page }) => {
    await page.route('**/auth/status', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true }) })
    )
    await page.route('**/library/sync', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ synced_this_page: 0, total_in_cache: 0, spotify_total: 0, next_offset: 0, done: true }) })
    )
    await page.route('**/library/albums', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ albums: [] }) })
    )
    await page.route('**/collections', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    )
    await page.route('**/playback/state', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ is_playing: false, track: null, device: null }) })
    )
    await page.route('**/home**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ today: [], this_week: [], rediscover: [], recommended: [] }) })
    )

    await page.goto('/')
    // Wait for the bottom tab bar to appear (confirms authenticated render)
    await expect(page.getByRole('button', { name: 'Library' })).toBeVisible({ timeout: 5000 })

    // Click Collections tab — BottomTabBar button has aria-label="Collections"
    await page.getByRole('button', { name: 'Collections' }).click()
    await expect(page.getByText('No collections yet')).toBeVisible({ timeout: 3000 })
  })
})
