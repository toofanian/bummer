import { test, expect } from '@playwright/test'

async function mockAuthenticated(page, options = {}) {
  const { withPlayback = false } = options
  await page.route('**/auth/status', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true }) })
  )
  await page.route('**/library/sync', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ synced_this_page: 0, total_in_cache: 0, spotify_total: 0, next_offset: 0, done: true }) })
  )
  await page.route('**/library/albums', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ albums: [
      { service_id: 'a1', name: 'Kind of Blue', artists: ['Miles Davis'], image_url: 'https://example.com/1.jpg', added_at: '2024-01-15' },
    ] }) })
  )
  await page.route('**/collections', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  )
  await page.route('**/home**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ today: [], this_week: [], rediscover: [], recommended: [] }) })
  )
  if (withPlayback) {
    await page.route('**/playback/state', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        is_playing: true,
        track: { name: 'So What', artists: ['Miles Davis'], album: 'Kind of Blue', duration_ms: 562000, progress_ms: 120000 },
        device: { name: 'iPhone', type: 'Smartphone' },
      }) })
    )
    await page.route('**/playback/devices', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: 'dev1', name: 'iPhone', type: 'Smartphone', is_active: true },
      ]) })
    )
  } else {
    // Idle state: include a device so the "Connect a device" mini-bar
    // is NOT rendered (that bar only appears when there is no device
    // AND no track AND not playing). With a device but no track,
    // MiniPlaybackBar returns null → hidden, matching the test intent.
    await page.route('**/playback/state', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        is_playing: false,
        track: null,
        device: { name: 'iPhone', type: 'Smartphone' },
      }) })
    )
    await page.route('**/playback/devices', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: 'dev1', name: 'iPhone', type: 'Smartphone', is_active: true },
      ]) })
    )
  }
}

test.describe('Mobile experience', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('Bottom tab bar shows all tabs', async ({ page }) => {
    await mockAuthenticated(page)
    await page.goto('/')

    await expect(page.getByRole('button', { name: 'Home' })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: 'Library' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Collections' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Digest' })).toBeVisible()
  })

  test('Tab navigation switches views', async ({ page }) => {
    await mockAuthenticated(page)
    await page.goto('/')

    // Wait for initial render
    await expect(page.getByRole('button', { name: 'Home' })).toBeVisible({ timeout: 5000 })

    // Tap Library tab
    await page.getByRole('button', { name: 'Library' }).click()
    await expect(page.getByText('Kind of Blue')).toBeVisible({ timeout: 3000 })

    // Tap Collections tab
    await page.getByRole('button', { name: 'Collections' }).click()
    await expect(page.getByText('No collections yet')).toBeVisible({ timeout: 3000 })

    // Tap Home tab
    await page.getByRole('button', { name: 'Home' }).click()
    // Home view should be visible — look for a heading or section that indicates home content
    await expect(page.getByRole('button', { name: 'Home' })).toBeVisible()
  })

  test('MiniPlaybackBar shows track info when playing', async ({ page }) => {
    await mockAuthenticated(page, { withPlayback: true })
    await page.goto('/')

    const miniBar = page.getByTestId('mini-playback-bar')
    await expect(miniBar).toBeVisible({ timeout: 5000 })
    await expect(miniBar.getByText('So What')).toBeVisible()
    await expect(miniBar.getByText('Miles Davis')).toBeVisible()
  })

  test('MiniPlaybackBar is hidden when nothing playing', async ({ page }) => {
    await mockAuthenticated(page, { withPlayback: false })
    await page.goto('/')

    // Wait for app to fully load
    await expect(page.getByRole('button', { name: 'Home' })).toBeVisible({ timeout: 5000 })

    await expect(page.getByTestId('mini-playback-bar')).not.toBeVisible()
  })

  test('Tapping MiniPlaybackBar opens FullScreenNowPlaying', async ({ page }) => {
    await mockAuthenticated(page, { withPlayback: true })
    await page.goto('/')

    const miniBar = page.getByTestId('mini-playback-bar')
    await expect(miniBar).toBeVisible({ timeout: 5000 })

    // Click the bar itself (not the play button)
    await miniBar.click({ position: { x: 100, y: 20 } })

    // FullScreenNowPlaying renders as role="dialog"
    const dialog = page.getByRole('dialog', { name: 'Now playing' })
    await expect(dialog).toBeVisible({ timeout: 3000 })
    await expect(dialog.getByText('So What')).toBeVisible()
    await expect(dialog.getByText('Miles Davis')).toBeVisible()
  })

  test('FullScreenNowPlaying has close button', async ({ page }) => {
    await mockAuthenticated(page, { withPlayback: true })
    await page.goto('/')

    const miniBar = page.getByTestId('mini-playback-bar')
    await expect(miniBar).toBeVisible({ timeout: 5000 })

    // Open full-screen
    await miniBar.click({ position: { x: 100, y: 20 } })
    const dialog = page.getByRole('dialog', { name: 'Now playing' })
    await expect(dialog).toBeVisible({ timeout: 3000 })

    // Close via the close button
    await page.getByRole('button', { name: 'Close now playing' }).click()

    // Dialog should slide away — it becomes aria-hidden="true" when closed,
    // so getByRole won't find it (filters hidden elements by default)
    await expect(dialog).not.toBeVisible({ timeout: 3000 })

    // Mini bar should still be visible
    await expect(miniBar).toBeVisible()
  })

  test('FullScreenNowPlaying shows transport controls', async ({ page }) => {
    await mockAuthenticated(page, { withPlayback: true })
    await page.goto('/')

    const miniBar = page.getByTestId('mini-playback-bar')
    await expect(miniBar).toBeVisible({ timeout: 5000 })

    // Open full-screen
    await miniBar.click({ position: { x: 100, y: 20 } })
    const dialog = page.getByRole('dialog', { name: 'Now playing' })
    await expect(dialog).toBeVisible({ timeout: 3000 })

    // Verify transport controls
    await expect(dialog.getByRole('button', { name: 'Pause' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Previous track' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Next track' })).toBeVisible()
  })
})
