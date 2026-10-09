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

describe('apiFetch spotify re-auth signal', () => {
  function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  async function callWith(response) {
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    const { apiFetch, SPOTIFY_REAUTH_EVENT } = await import('./api')
    const listener = vi.fn()
    window.addEventListener(SPOTIFY_REAUTH_EVENT, listener)
    const res = await apiFetch('/playback/state')
    await new Promise(resolve => setTimeout(resolve, 0))
    window.removeEventListener(SPOTIFY_REAUTH_EVENT, listener)
    return { res, listener }
  }

  it('dispatches the re-auth event on 401 spotify_reauth_required', async () => {
    const { listener } = await callWith(
      jsonResponse(401, { detail: 'expired', code: 'spotify_reauth_required' })
    )
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('leaves the response body readable for the caller', async () => {
    const { res } = await callWith(
      jsonResponse(401, { detail: 'expired', code: 'spotify_reauth_required' })
    )
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ detail: 'expired', code: 'spotify_reauth_required' })
  })

  it('ignores a 401 without the re-auth code', async () => {
    const { listener } = await callWith(jsonResponse(401, { detail: 'Invalid token' }))
    expect(listener).not.toHaveBeenCalled()
  })

  it('ignores the code on a non-401 status', async () => {
    const { listener } = await callWith(
      jsonResponse(500, { code: 'spotify_reauth_required' })
    )
    expect(listener).not.toHaveBeenCalled()
  })

  it('ignores a 401 with a non-JSON body', async () => {
    const { listener } = await callWith(new Response('nope', { status: 401 }))
    expect(listener).not.toHaveBeenCalled()
  })
})
