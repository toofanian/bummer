import { test, expect } from '@playwright/test'

const mockAlbums = [
  { service_id: 'album1', name: 'Kind of Blue', artists: ['Miles Davis'], image_url: 'https://example.com/1.jpg', added_at: '2024-01-15' },
  { service_id: 'album2', name: 'A Love Supreme', artists: ['John Coltrane'], image_url: 'https://example.com/2.jpg', added_at: '2024-02-20' },
  { service_id: 'album3', name: 'Head Hunters', artists: ['Herbie Hancock'], image_url: 'https://example.com/3.jpg', added_at: '2024-03-10' },
]

async function mockAuthenticatedWithAlbums(page) {
  await page.route('**/auth/status', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true }) })
  )
  await page.route('**/library/sync', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ synced_this_page: 0, total_in_cache: 0, spotify_total: 0, next_offset: 0, done: true }) })
  )
  await page.route('**/library/albums', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ albums: mockAlbums }) })
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
}

test.describe('Library view - Desktop', () => {
  test('Library tab shows album table with album data', async ({ page }) => {
    await mockAuthenticatedWithAlbums(page)
    await page.goto('/')

    // Click the Library nav button in the header
    await page.locator('nav button', { hasText: 'Library' }).click()

    // Verify all album names are visible
    await expect(page.getByText('Kind of Blue')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('A Love Supreme')).toBeVisible()
    await expect(page.getByText('Head Hunters')).toBeVisible()
  })

  test('Search filters albums by name', async ({ page }) => {
    await mockAuthenticatedWithAlbums(page)
    await page.goto('/')

    await page.locator('nav button', { hasText: 'Library' }).click()
    await expect(page.getByText('Kind of Blue')).toBeVisible({ timeout: 5000 })

    // Type in search box
    await page.getByPlaceholder('Search\u2026').fill('Kind of Blue')

    // Only the matching album should be visible
    await expect(page.getByText('Kind of Blue')).toBeVisible()
    await expect(page.getByText('A Love Supreme')).not.toBeVisible()
    await expect(page.getByText('Head Hunters')).not.toBeVisible()
  })

  test('Search filters albums by artist', async ({ page }) => {
    await mockAuthenticatedWithAlbums(page)
    await page.goto('/')

    await page.locator('nav button', { hasText: 'Library' }).click()
    await expect(page.getByText('Kind of Blue')).toBeVisible({ timeout: 5000 })

    // Search by artist name
    await page.getByPlaceholder('Search\u2026').fill('Coltrane')

    // Only Coltrane's album should be visible
    await expect(page.getByText('A Love Supreme')).toBeVisible()
    await expect(page.getByText('Kind of Blue')).not.toBeVisible()
    await expect(page.getByText('Head Hunters')).not.toBeVisible()
  })

  test('Library view toggle switches between Albums and Artists', async ({ page }) => {
    await mockAuthenticatedWithAlbums(page)
    await page.goto('/')

    await page.locator('nav button', { hasText: 'Library' }).click()
    await expect(page.getByText('Kind of Blue')).toBeVisible({ timeout: 5000 })

    // The toggle should show Albums tab as selected
    const albumsTab = page.getByRole('tab', { name: /Albums/ })
    await expect(albumsTab).toHaveAttribute('aria-selected', 'true')

    // Click Artists tab
    const artistsTab = page.getByRole('tab', { name: 'Artists' })
    await artistsTab.click()

    // Artists view groups by artist name — verify artist names appear
    await expect(artistsTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('Miles Davis')).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('John Coltrane')).toBeVisible()
    await expect(page.getByText('Herbie Hancock')).toBeVisible()
  })

  test('Empty search shows all albums', async ({ page }) => {
    await mockAuthenticatedWithAlbums(page)
    await page.goto('/')

    await page.locator('nav button', { hasText: 'Library' }).click()
    await expect(page.getByText('Kind of Blue')).toBeVisible({ timeout: 5000 })

    // Search for something
    const searchInput = page.getByPlaceholder('Search\u2026')
    await searchInput.fill('Kind')
    await expect(page.getByText('A Love Supreme')).not.toBeVisible()

    // Clear search
    await searchInput.fill('')

    // All albums should return
    await expect(page.getByText('Kind of Blue')).toBeVisible()
    await expect(page.getByText('A Love Supreme')).toBeVisible()
    await expect(page.getByText('Head Hunters')).toBeVisible()
  })
})

test.describe('Library view - Mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('Library tab accessible via bottom tab bar', async ({ page }) => {
    await mockAuthenticatedWithAlbums(page)
    await page.goto('/')

    // Wait for bottom tab bar to render
    await expect(page.getByRole('button', { name: 'Library' })).toBeVisible({ timeout: 5000 })

    // Tap Library in the BottomTabBar
    await page.getByRole('button', { name: 'Library' }).click()

    // Verify album data renders on mobile
    await expect(page.getByText('Kind of Blue')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('A Love Supreme')).toBeVisible()
    await expect(page.getByText('Head Hunters')).toBeVisible()
  })

  test('Search works on mobile', async ({ page }) => {
    await mockAuthenticatedWithAlbums(page)
    await page.goto('/')

    // Navigate to Library via bottom tab bar
    await expect(page.getByRole('button', { name: 'Library' })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'Library' }).click()
    await expect(page.getByText('Kind of Blue')).toBeVisible({ timeout: 5000 })

    // Type in the mobile search input
    await page.getByPlaceholder('Search\u2026').fill('Head Hunters')

    // Only matching album visible
    await expect(page.getByText('Head Hunters')).toBeVisible()
    await expect(page.getByText('Kind of Blue')).not.toBeVisible()
    await expect(page.getByText('A Love Supreme')).not.toBeVisible()
  })
})
