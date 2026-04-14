import { test, expect } from '@playwright/test'

// Shared mock routes for an authenticated user with active playback
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
        track: { name: 'So What', artists: ['Miles Davis'], album: 'Kind of Blue', duration_ms: 562000, progress_ms: 120000 },
        device: { name: 'MacBook Pro', type: 'Computer' },
      }),
    })
  )
  await page.route('**/home**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ today: [], this_week: [], rediscover: [], recommended: [] }) })
  )
}

test.describe('PlaybackBar - Desktop', () => {
  test('PlaybackBar shows track info when playing', async ({ page }) => {
    await mockAuthenticatedWithPlayback(page)
    await page.goto('/')

    const playbackBar = page.getByRole('region', { name: 'Playback bar' })
    await expect(playbackBar).toBeVisible({ timeout: 10000 })

    await expect(playbackBar.getByText('So What')).toBeVisible()
    await expect(playbackBar.getByText('Miles Davis')).toBeVisible()
  })

  test('PlaybackBar shows Pause button when playing', async ({ page }) => {
    await mockAuthenticatedWithPlayback(page)
    await page.goto('/')

    const playbackBar = page.getByRole('region', { name: 'Playback bar' })
    await expect(playbackBar).toBeVisible({ timeout: 10000 })

    const pauseBtn = playbackBar.getByRole('button', { name: 'Pause' })
    await expect(pauseBtn).toBeVisible()
  })

  test('PlaybackBar shows Play button when paused', async ({ page }) => {
    // Override playback state to paused with track data
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
          is_playing: false,
          track: { name: 'So What', artists: ['Miles Davis'], album: 'Kind of Blue', duration_ms: 562000, progress_ms: 120000 },
          device: { name: 'MacBook Pro', type: 'Computer' },
        }),
      })
    )
    await page.route('**/home**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ today: [], this_week: [], rediscover: [], recommended: [] }) })
    )

    await page.goto('/')

    const playbackBar = page.getByRole('region', { name: 'Playback bar' })
    await expect(playbackBar).toBeVisible({ timeout: 10000 })

    const playBtn = playbackBar.getByRole('button', { name: 'Play', exact: true })
    await expect(playBtn).toBeVisible()
  })

  test('Nothing playing shows idle state', async ({ page }) => {
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
    // Idle-with-device state: a device exists but nothing is playing.
    // The "Connect a device" bar only renders when there is no device,
    // so including a device here triggers the classic "Nothing playing"
    // idle label that this test asserts.
    await page.route('**/playback/state', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          is_playing: false,
          track: null,
          device: { name: 'MacBook Pro', type: 'Computer' },
        }),
      })
    )
    await page.route('**/playback/devices', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: 'dev1', name: 'MacBook Pro', type: 'Computer', is_active: true },
      ]) })
    )
    await page.route('**/home**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ today: [], this_week: [], rediscover: [], recommended: [] }) })
    )

    await page.goto('/')

    const playbackBar = page.getByRole('region', { name: 'Playback bar' })
    await expect(playbackBar).toBeVisible({ timeout: 10000 })

    await expect(playbackBar.getByText('Nothing playing')).toBeVisible()
  })

  test('Previous and Next buttons are visible', async ({ page }) => {
    await mockAuthenticatedWithPlayback(page)
    await page.goto('/')

    const playbackBar = page.getByRole('region', { name: 'Playback bar' })
    await expect(playbackBar).toBeVisible({ timeout: 10000 })

    await expect(playbackBar.getByRole('button', { name: 'Previous track' })).toBeVisible()
    await expect(playbackBar.getByRole('button', { name: 'Next track' })).toBeVisible()
  })

  test('Progress bar shows current time', async ({ page }) => {
    await mockAuthenticatedWithPlayback(page)
    await page.goto('/')

    const playbackBar = page.getByRole('region', { name: 'Playback bar' })
    await expect(playbackBar).toBeVisible({ timeout: 10000 })

    const progressSlider = playbackBar.getByRole('slider', { name: 'Track progress' })
    await expect(progressSlider).toBeVisible()
  })

  test('Volume slider is present and interactive', async ({ page }) => {
    await mockAuthenticatedWithPlayback(page)
    await page.goto('/')

    const playbackBar = page.getByRole('region', { name: 'Playback bar' })
    await expect(playbackBar).toBeVisible({ timeout: 10000 })

    const volumeSlider = playbackBar.getByRole('slider', { name: 'Volume' })
    await expect(volumeSlider).toBeVisible()
  })

  test('Now Playing pane toggle button works', async ({ page }) => {
    await mockAuthenticatedWithPlayback(page)

    // Mock the track list endpoint for the Now Playing pane
    await page.route('**/playback/queue', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ queue: [] }) })
    )

    await page.goto('/')

    const playbackBar = page.getByRole('region', { name: 'Playback bar' })
    await expect(playbackBar).toBeVisible({ timeout: 10000 })

    const nowPlayingBtn = playbackBar.getByRole('button', { name: 'Now playing' })
    await expect(nowPlayingBtn).toBeVisible()

    // Check initial state
    const initialPressed = await nowPlayingBtn.getAttribute('aria-pressed')

    // Click to toggle
    await nowPlayingBtn.click()

    // Verify aria-pressed changed
    const newPressed = await nowPlayingBtn.getAttribute('aria-pressed')
    expect(newPressed).not.toBe(initialPressed)
  })

  test('Playback bar region is accessible', async ({ page }) => {
    await mockAuthenticatedWithPlayback(page)
    await page.goto('/')

    const playbackBar = page.getByRole('region', { name: 'Playback bar' })
    await expect(playbackBar).toBeVisible({ timeout: 10000 })

    // Verify it has the correct role and label
    await expect(playbackBar).toHaveAttribute('role', 'region')
    await expect(playbackBar).toHaveAttribute('aria-label', 'Playback bar')
  })
})
