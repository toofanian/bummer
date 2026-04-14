import { test, expect } from '@playwright/test'

const mockDigestData = {
  start_date: '2024-03-18',
  end_date: '2024-03-25',
  added: [
    { spotify_id: 'd1', name: 'New Album', artists: ['New Artist'], image_url: 'https://example.com/d1.jpg' },
  ],
  removed: [
    { spotify_id: 'd2', name: 'Old Album', artists: ['Old Artist'], image_url: 'https://example.com/d2.jpg' },
  ],
  listened: [],
  total_start: 100,
  total_end: 100,
  net_change: 0,
}

async function mockBasicRoutes(page) {
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
  await page.route('**/home**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ today: [], this_week: [], rediscover: [], recommended: [] }) })
  )
  await page.route('**/digest/ensure-snapshot', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  )
}

test.describe('Digest panel - Desktop', () => {
  test('Digest button opens panel', async ({ page }) => {
    await mockBasicRoutes(page)
    await page.route('**/digest?**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDigestData) })
    )

    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Library digest' })).toBeVisible({ timeout: 5000 })

    await page.getByRole('button', { name: 'Library digest' }).click()

    const panel = page.getByRole('complementary', { name: 'Library digest' })
    await expect(panel).not.toHaveAttribute('aria-hidden', 'true', { timeout: 3000 })
    await expect(panel.getByText('Library Digest')).toBeVisible({ timeout: 3000 })
  })

  test('Digest panel shows loading then data', async ({ page }) => {
    await mockBasicRoutes(page)
    // Delay the digest response so we can observe loading state
    await page.route('**/digest?**', route =>
      setTimeout(() => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDigestData) }), 500)
    )

    await page.goto('/')
    await page.getByRole('button', { name: 'Library digest' }).click({ timeout: 5000 })

    const panel = page.getByRole('complementary', { name: 'Library digest' })
    await expect(panel.getByText('Loading digest...')).toBeVisible({ timeout: 3000 })

    // After data loads
    await expect(panel.getByText('New Album')).toBeVisible({ timeout: 5000 })
    await expect(panel.getByText('New Artist')).toBeVisible()
    await expect(panel.getByText('Old Album')).toBeVisible()
    await expect(panel.getByText('Old Artist')).toBeVisible()
  })

  test('Digest panel shows no-snapshots message on 404', async ({ page }) => {
    await mockBasicRoutes(page)
    await page.route('**/digest?**', route =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'No snapshots' }) })
    )

    await page.goto('/')
    await page.getByRole('button', { name: 'Library digest' }).click({ timeout: 5000 })

    const panel = page.getByRole('complementary', { name: 'Library digest' })
    await expect(panel.getByText('Digests will appear after your library has been tracked for at least a day.')).toBeVisible({ timeout: 5000 })
  })

  test('Digest panel can be closed', async ({ page }) => {
    await mockBasicRoutes(page)
    await page.route('**/digest?**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDigestData) })
    )

    await page.goto('/')
    await page.getByRole('button', { name: 'Library digest' }).click({ timeout: 5000 })

    const panel = page.getByRole('complementary', { name: 'Library digest' })
    await expect(panel).not.toHaveAttribute('aria-hidden', 'true', { timeout: 3000 })

    await panel.getByRole('button', { name: 'Close digest' }).click()
    await expect(panel).not.toBeVisible({ timeout: 3000 })
  })
})

test.describe('Digest panel - Mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('Digest accessible via bottom tab', async ({ page }) => {
    await mockBasicRoutes(page)
    await page.route('**/digest?**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDigestData) })
    )

    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Digest' })).toBeVisible({ timeout: 5000 })

    await page.getByRole('button', { name: 'Digest' }).click()

    const panel = page.getByRole('complementary', { name: 'Library digest' })
    await expect(panel).not.toHaveAttribute('aria-hidden', 'true', { timeout: 3000 })
    await expect(panel.getByText('New Album')).toBeVisible({ timeout: 5000 })
  })

  test('Digest full-screen overlay on mobile', async ({ page }) => {
    await mockBasicRoutes(page)
    await page.route('**/digest?**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDigestData) })
    )

    await page.goto('/')
    await page.getByRole('button', { name: 'Digest' }).click({ timeout: 5000 })

    const panel = page.getByRole('complementary', { name: 'Library digest' })
    await expect(panel).not.toHaveAttribute('aria-hidden', 'true', { timeout: 3000 })

    // Verify full-screen overlay: panel should have fixed positioning and cover the viewport
    const box = await panel.boundingBox()
    expect(box).toBeTruthy()
    expect(box.width).toBeGreaterThanOrEqual(390)
    expect(box.height).toBeGreaterThanOrEqual(800)
  })
})
