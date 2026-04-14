import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('apiFetch', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  it('includes Authorization header when session provided', async () => {
    const { apiFetch } = await import('./api')
    const session = { access_token: 'my-jwt' }
    await apiFetch('/library/albums', {}, session)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/library/albums'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer my-jwt' }),
      })
    )
  })

  it('omits Authorization header when no session', async () => {
    const { apiFetch } = await import('./api')
    await apiFetch('/library/albums', {}, null)
    const call = fetch.mock.calls[0]
    expect(call[1].headers).not.toHaveProperty('Authorization')
  })

  it('merges custom headers with defaults', async () => {
    const { apiFetch } = await import('./api')
    const session = { access_token: 'tok' }
    await apiFetch('/test', { headers: { 'X-Custom': 'val' } }, session)
    const call = fetch.mock.calls[0]
    expect(call[1].headers).toHaveProperty('Authorization', 'Bearer tok')
    expect(call[1].headers).toHaveProperty('X-Custom', 'val')
    expect(call[1].headers).toHaveProperty('Content-Type', 'application/json')
  })

  it('passes through other options like method and body', async () => {
    const { apiFetch } = await import('./api')
    await apiFetch('/test', { method: 'POST', body: '{}' })
    const call = fetch.mock.calls[0]
    expect(call[1].method).toBe('POST')
    expect(call[1].body).toBe('{}')
  })

  it('prepends API base URL to path', async () => {
    const { apiFetch } = await import('./api')
    await apiFetch('/some/path')
    const call = fetch.mock.calls[0]
    expect(call[0]).toBe('http://127.0.0.1:8000/some/path')
  })
})
