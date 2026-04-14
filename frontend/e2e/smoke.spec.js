import { test, expect } from '@playwright/test'

test.describe('App smoke tests', () => {
  test('app HTML loads and root element exists', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#root')).toBeAttached()
  })

  test('unauthenticated: app triggers auth/login redirect', async ({ page }) => {
    await page.route('**/auth/status', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: false }) })
    )

    const [, loginRequest] = await Promise.all([
      page.goto('/'),
      page.waitForRequest('**/auth/login'),
    ])
    expect(loginRequest.url()).toContain('/auth/login')
  })

  test('authenticated: library heading is visible', async ({ page }) => {
    // Mock all required API calls
    await page.route('**/auth/status', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true }) })
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
    await expect(page.locator('text=Library')).toBeVisible({ timeout: 5000 })
  })
})
