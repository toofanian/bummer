import { test, expect } from '@playwright/test'

const mockHomeData = {
  today: [
    { service_id: 'h1', name: 'Kind of Blue', artists: ['Miles Davis'], image_url: 'https://example.com/1.jpg' },
    { service_id: 'h2', name: 'Bitches Brew', artists: ['Miles Davis'], image_url: 'https://example.com/2.jpg' },
  ],
  this_week: [
    { service_id: 'h3', name: 'A Love Supreme', artists: ['John Coltrane'], image_url: 'https://example.com/3.jpg' },
  ],
  rediscover: [
    { service_id: 'h4', name: 'Maiden Voyage', artists: ['Herbie Hancock'], image_url: 'https://example.com/4.jpg' },
  ],
  recommended: [
    { service_id: 'h5', name: 'Speak No Evil', artists: ['Wayne Shorter'], image_url: 'https://example.com/5.jpg' },
  ],
}

const emptyHomeData = { today: [], this_week: [], rediscover: [], recommended: [] }

async function setupBaseMocks(page) {
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
  await page.route('**/digest/ensure-snapshot', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  )
}

test.describe('Home page', () => {
  test('Home page renders section headings with data', async ({ page }) => {
    await setupBaseMocks(page)
    await page.route('**/home**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockHomeData) })
    )

    await page.goto('/')
    await expect(page.locator('h2', { hasText: 'Recently Played' })).toBeVisible({ timeout: 5000 })
    await expect(page.locator('h2', { hasText: 'Recently Added' })).toBeVisible()
    await expect(page.locator('h2', { hasText: 'You Might Like' })).toBeVisible()
    await expect(page.locator('h2', { hasText: 'Rediscover' })).toBeVisible()
  })

  test('Home page shows album names in sections', async ({ page }) => {
    await setupBaseMocks(page)
    await page.route('**/home**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockHomeData) })
    )

    await page.goto('/')
    await expect(page.getByText('Kind of Blue')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('A Love Supreme')).toBeVisible()
    await expect(page.getByText('Maiden Voyage')).toBeVisible()
    await expect(page.getByText('Speak No Evil')).toBeVisible()
  })

  test('Empty home page shows empty state message', async ({ page }) => {
    await setupBaseMocks(page)
    await page.route('**/home**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(emptyHomeData) })
    )

    await page.goto('/')
    await expect(page.getByText('Start playing albums to see your listening history here.')).toBeVisible({ timeout: 5000 })
  })

  test('Home is the default view on load', async ({ page }) => {
    await setupBaseMocks(page)
    await page.route('**/home**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockHomeData) })
    )

    await page.goto('/')
    await expect(page.locator('h2', { hasText: 'Recently Played' })).toBeVisible({ timeout: 5000 })
  })

  test('Navigate to Home from Library returns to home view', async ({ page }) => {
    await setupBaseMocks(page)
    await page.route('**/home**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockHomeData) })
    )

    await page.goto('/')
    await expect(page.locator('h2', { hasText: 'Recently Played' })).toBeVisible({ timeout: 5000 })

    // Navigate to Library
    await page.getByRole('button', { name: 'Library', exact: true }).click()
    await expect(page.locator('h2', { hasText: 'Recently Played' })).not.toBeVisible({ timeout: 3000 })

    // Navigate back to Home
    await page.getByRole('button', { name: 'Home' }).click()
    await expect(page.locator('h2', { hasText: 'Recently Played' })).toBeVisible({ timeout: 5000 })
  })
})
