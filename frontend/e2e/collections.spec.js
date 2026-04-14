import { test, expect } from '@playwright/test'

const mockCollections = [
  { id: 'col1', name: 'Jazz Favorites', album_count: 3, updated_at: '2024-03-20T10:00:00Z', description: 'Best jazz albums' },
  { id: 'col2', name: 'Road Trip', album_count: 5, updated_at: '2024-03-15T10:00:00Z' },
]

const mockCollectionAlbums = {
  albums: [
    { service_id: 'alb1', name: 'Kind of Blue', artists: ['Miles Davis'], image_url: null },
    { service_id: 'alb2', name: 'A Love Supreme', artists: ['John Coltrane'], image_url: null },
  ],
}

/**
 * Set up all base mocks needed for an authenticated session with collections.
 * Options:
 *   collections  — array of collection objects to return from GET /collections
 *   onPost       — handler for POST /collections (receives route, should fulfill)
 *   onDelete     — handler for DELETE /collections/* (receives route, should fulfill)
 */
async function setupMocks(page, { collections = mockCollections, onPost, onDelete } = {}) {
  await page.route('**/auth/status', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true }) })
  )
  await page.route('**/library/sync', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ synced_this_page: 0, total_in_cache: 0, spotify_total: 0, next_offset: 0, done: true }) })
  )
  await page.route('**/library/albums', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ albums: [] }) })
  )
  await page.route('**/playback/state', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ is_playing: false, track: null, device: null }) })
  )
  await page.route('**/home**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ today: [], this_week: [], rediscover: [], recommended: [] }) })
  )
  // Match collection-specific sub-routes first (more specific patterns)
  await page.route('**/collections/*/albums', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCollectionAlbums) })
  )
  // Handle DELETE on /collections/{id}
  if (onDelete) {
    await page.route('**/collections/*', route => {
      // Avoid matching /collections/*/albums (already handled above)
      if (route.request().url().includes('/albums')) {
        return route.continue()
      }
      if (route.request().method() === 'DELETE') {
        return onDelete(route)
      }
      return route.continue()
    })
  }
  // Single handler for /collections — handles GET and optionally POST
  await page.route('**/collections', route => {
    const method = route.request().method()
    if (method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(collections) })
    }
    if (method === 'POST' && onPost) {
      return onPost(route)
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  })
}

test.describe('Collections - Desktop', () => {
  test('Collections view shows collection cards', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/')
    // Click the Collections nav button (includes count in parentheses)
    await page.locator('nav button', { hasText: 'Collections' }).click()
    await expect(page.getByText('Jazz Favorites')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Road Trip')).toBeVisible()
  })

  test('Create new collection', async ({ page }) => {
    const createdCollection = { id: 'col3', name: 'Workout Mix', album_count: 0, updated_at: '2024-03-25T10:00:00Z' }
    await setupMocks(page, {
      onPost: route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createdCollection),
      }),
    })

    await page.goto('/')
    await page.locator('nav button', { hasText: 'Collections' }).click()
    await expect(page.getByText('Jazz Favorites')).toBeVisible({ timeout: 5000 })

    // Type name and click Create
    await page.getByPlaceholder('New collection name').fill('Workout Mix')
    await page.getByRole('button', { name: 'Create' }).click()

    // The optimistic update should show the new collection immediately
    await expect(page.getByText('Workout Mix')).toBeVisible({ timeout: 3000 })
  })

  test('Enter a collection shows its albums', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/')
    await page.locator('nav button', { hasText: 'Collections' }).click()
    await expect(page.getByText('Jazz Favorites')).toBeVisible({ timeout: 5000 })

    // Click on the Jazz Favorites card
    await page.getByText('Jazz Favorites').click()

    // Should show CollectionDetailHeader with back button
    await expect(page.getByText('← Back')).toBeVisible({ timeout: 5000 })
  })

  test('Delete collection with confirmation', async ({ page }) => {
    await setupMocks(page, {
      onDelete: route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      }),
    })

    await page.goto('/')
    await page.locator('nav button', { hasText: 'Collections' }).click()
    await expect(page.getByText('Jazz Favorites')).toBeVisible({ timeout: 5000 })

    // Force click the delete button (hidden until hover via opacity-0)
    const deleteButtons = page.getByRole('button', { name: 'Delete' })
    await deleteButtons.first().click({ force: true })

    // Confirm and cancel buttons should appear
    await expect(page.getByRole('button', { name: 'Confirm delete' })).toBeVisible({ timeout: 3000 })
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()

    // Click confirm
    await page.getByRole('button', { name: 'Confirm delete' }).click()

    // Jazz Favorites should be removed (optimistic delete)
    await expect(page.getByText('Jazz Favorites')).not.toBeVisible({ timeout: 3000 })
    // Road Trip should still be there
    await expect(page.getByText('Road Trip')).toBeVisible()
  })

  test('Cancel delete keeps collection', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/')
    await page.locator('nav button', { hasText: 'Collections' }).click()
    await expect(page.getByText('Jazz Favorites')).toBeVisible({ timeout: 5000 })

    // Force click delete button (hidden until hover)
    const deleteButtons = page.getByRole('button', { name: 'Delete' })
    await deleteButtons.first().click({ force: true })

    // Confirm/cancel buttons appear
    await expect(page.getByRole('button', { name: 'Confirm delete' })).toBeVisible({ timeout: 3000 })

    // Click cancel
    await page.getByRole('button', { name: 'Cancel' }).click()

    // Collection should still be visible
    await expect(page.getByText('Jazz Favorites')).toBeVisible()
    await expect(page.getByText('Road Trip')).toBeVisible()
  })

  test('Empty collections shows message', async ({ page }) => {
    await setupMocks(page, { collections: [] })
    await page.goto('/')
    await page.locator('nav button', { hasText: 'Collections' }).click()
    await expect(page.getByText('No collections yet.')).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Collections - Mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('Collections accessible via bottom tab', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/')
    // Wait for bottom tab bar to render
    await expect(page.getByRole('button', { name: 'Collections' })).toBeVisible({ timeout: 5000 })

    // Tap Collections in BottomTabBar
    await page.getByRole('button', { name: 'Collections' }).click()

    // Verify collections view is shown
    await expect(page.getByText('Jazz Favorites')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Road Trip')).toBeVisible()
  })
})
