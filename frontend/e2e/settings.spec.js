import { test, expect } from '@playwright/test'

// Shared API mocks — preview mode auto-logs in, but the app still
// fetches library/collections/playback on mount.
function mockAPIs(page) {
  return Promise.all([
    page.route('**/library/sync', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ synced_this_page: 0, total_in_cache: 0, spotify_total: 0, next_offset: 0, done: true }) })
    ),
    page.route('**/library/albums', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ albums: [] }) })
    ),
    page.route('**/collections', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    ),
    page.route('**/playback/state', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ is_playing: false, track: null, device: null }) })
    ),
    page.route('**/home**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ today: [], this_week: [], rediscover: [], recommended: [] }) })
    ),
  ])
}

test.describe('Settings page', () => {
  test('gear icon navigates to settings, back returns home', async ({ page }) => {
    await mockAPIs(page)
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible({ timeout: 5000 })

    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(page.getByText('Install App')).toBeVisible()
    await expect(page.getByRole('link', { name: /send feedback/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /log out/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /delete account/i })).toBeVisible()

    // Back button returns to home
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).not.toBeVisible()
  })

  test('feedback links to GitHub Discussions', async ({ page }) => {
    await mockAPIs(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Settings' }).click({ timeout: 5000 })

    const link = page.getByRole('link', { name: /send feedback/i })
    await expect(link).toHaveAttribute('href', 'https://github.com/toofanian/bummer/discussions')
  })

  test('settings page does not show collection content', async ({ page }) => {
    await mockAPIs(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Settings' }).click({ timeout: 5000 })

    // Should NOT show collection-related content
    await expect(page.getByText('No albums found')).not.toBeVisible()
    await expect(page.getByText('No collections yet')).not.toBeVisible()
  })
})

test.describe('Settings page (mobile)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('gear icon opens settings, hides mobile header', async ({ page }) => {
    await mockAPIs(page)
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible({ timeout: 5000 })

    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    // The mobile header bar should be hidden — only the in-page heading shows
    const headings = await page.getByRole('heading', { name: 'Settings' }).all()
    expect(headings).toHaveLength(1)
  })
})
