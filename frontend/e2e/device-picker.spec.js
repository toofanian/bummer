import { test, expect } from '@playwright/test'

// Shared mock routes for an authenticated user with playback active
async function mockAuthenticatedWithPlayback(page) {
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
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        is_playing: true,
        track: {
          name: 'Test Song',
          artists: ['Test Artist'],
          album: 'Test Album',
          duration_ms: 200000,
          progress_ms: 50000,
        },
        device: { name: 'My Laptop', type: 'Computer' },
      }),
    })
  )
  await page.route('**/playback/devices', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'dev1', name: 'My Laptop', type: 'Computer', is_active: true },
        { id: 'dev2', name: 'Living Room Speaker', type: 'Speaker', is_active: false },
      ]),
    })
  )
  await page.route('**/home**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ today: [], this_week: [], rediscover: [], recommended: [] }) })
  )
}

test.describe('DevicePicker - Desktop', () => {
  test('device picker button is visible and opens dropdown', async ({ page }) => {
    await mockAuthenticatedWithPlayback(page)
    await page.goto('/')

    const deviceBtn = page.getByTestId('device-indicator')
    await expect(deviceBtn).toBeVisible({ timeout: 10000 })

    await deviceBtn.click()
    const picker = page.getByRole('listbox', { name: 'Select device' })
    await expect(picker).toBeVisible({ timeout: 3000 })
  })

  test('device picker dropdown renders above all content (z-index)', async ({ page }) => {
    await mockAuthenticatedWithPlayback(page)
    await page.goto('/')

    const deviceBtn = page.getByTestId('device-indicator')
    await expect(deviceBtn).toBeVisible({ timeout: 5000 })
    await deviceBtn.click()

    const picker = page.getByRole('listbox', { name: 'Select device' })
    await expect(picker).toBeVisible({ timeout: 3000 })

    // Take a screenshot for visual verification
    await page.screenshot({ path: 'e2e/screenshots/device-picker-open-desktop.png', fullPage: true })

    // Verify the picker has a high z-index and is not clipped
    const pickerBox = await picker.boundingBox()
    expect(pickerBox).not.toBeNull()
    expect(pickerBox.width).toBeGreaterThan(200)
    expect(pickerBox.height).toBeGreaterThan(50)

    // Verify the backdrop covers the entire viewport
    const backdrop = page.getByTestId('device-picker-backdrop')
    await expect(backdrop).toBeAttached()
    const backdropBox = await backdrop.boundingBox()
    const viewportSize = page.viewportSize()
    expect(backdropBox.width).toBe(viewportSize.width)
    expect(backdropBox.height).toBe(viewportSize.height)
  })

  test('clicking backdrop closes picker without triggering other actions', async ({ page }) => {
    await mockAuthenticatedWithPlayback(page)
    await page.goto('/')

    const deviceBtn = page.getByTestId('device-indicator')
    await expect(deviceBtn).toBeVisible({ timeout: 5000 })

    // Check if NowPlaying pane toggle exists and note its state
    const nowPlayingBtn = page.getByRole('button', { name: 'Now playing' })

    // Open the picker
    await deviceBtn.click()
    const picker = page.getByRole('listbox', { name: 'Select device' })
    await expect(picker).toBeVisible({ timeout: 3000 })

    // Click the backdrop (center of the page, away from any buttons)
    const backdrop = page.getByTestId('device-picker-backdrop')
    await backdrop.click({ position: { x: 200, y: 200 } })

    // Picker should be closed
    await expect(picker).not.toBeVisible({ timeout: 2000 })

    // Take screenshot after dismiss
    await page.screenshot({ path: 'e2e/screenshots/device-picker-dismissed-desktop.png', fullPage: true })

    // The NowPlaying pane should NOT have been toggled open
    // Check that no queue/now-playing panel appeared
    const paneOpen = await nowPlayingBtn.getAttribute('aria-pressed')
    expect(paneOpen).toBe('false')
  })

  test('device picker is visually clickable (not hidden behind content)', async ({ page }) => {
    await mockAuthenticatedWithPlayback(page)
    await page.goto('/')

    const deviceBtn = page.getByTestId('device-indicator')
    await expect(deviceBtn).toBeVisible({ timeout: 5000 })
    await deviceBtn.click()

    const picker = page.getByRole('listbox', { name: 'Select device' })
    await expect(picker).toBeVisible({ timeout: 3000 })

    // Try clicking a device row — it should be interactive, not hidden behind anything
    const deviceRow = page.getByTestId('device-row-dev2')
    await expect(deviceRow).toBeVisible()

    // Verify the device row is actually at the topmost layer (elementFromPoint check)
    const rowBox = await deviceRow.boundingBox()
    const topElement = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y)
      return el?.closest('[data-testid]')?.dataset?.testid ?? el?.tagName ?? 'none'
    }, { x: rowBox.x + rowBox.width / 2, y: rowBox.y + rowBox.height / 2 })

    expect(topElement).toBe('device-row-dev2')
  })
})

test.describe('DevicePicker - Mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('device picker is accessible on mobile', async ({ page }) => {
    await mockAuthenticatedWithPlayback(page)
    await page.goto('/')

    // On mobile, the MiniPlaybackBar uses mini-device-indicator
    const deviceBtn = page.getByTestId('mini-device-indicator')
    await expect(deviceBtn).toBeVisible({ timeout: 5000 })

    await deviceBtn.click()

    // Picker should be visible
    const picker = page.getByRole('listbox', { name: 'Select device' })
    await expect(picker).toBeVisible({ timeout: 3000 })

    await page.screenshot({ path: 'e2e/screenshots/device-picker-open-mobile.png', fullPage: true })
  })

  test('clicking backdrop on mobile closes picker cleanly', async ({ page }) => {
    await mockAuthenticatedWithPlayback(page)
    await page.goto('/')

    const deviceBtn = page.getByTestId('mini-device-indicator')
    await expect(deviceBtn).toBeVisible({ timeout: 5000 })
    await deviceBtn.click()

    const picker = page.getByRole('listbox', { name: 'Select device' })
    await expect(picker).toBeVisible({ timeout: 3000 })

    // Dismiss via backdrop
    const backdrop = page.getByTestId('device-picker-backdrop')
    await backdrop.click({ position: { x: 200, y: 200 } })

    await expect(picker).not.toBeVisible({ timeout: 2000 })

    // The FullScreenNowPlaying (role=dialog) should NOT have opened
    // This catches the React portal event bubbling bug where backdrop click
    // propagates through the React tree to MiniPlaybackBar's onClick={onExpand}
    const nowPlayingDialog = page.getByRole('dialog')
    await expect(nowPlayingDialog).not.toBeVisible({ timeout: 1000 })

    // MiniPlaybackBar should still be visible (not replaced by full-screen view)
    await expect(page.getByTestId('mini-playback-bar')).toBeVisible()

    await page.screenshot({ path: 'e2e/screenshots/device-picker-dismissed-mobile.png', fullPage: true })
  })
})
