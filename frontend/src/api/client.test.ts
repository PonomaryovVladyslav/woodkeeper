import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { server } from '../test/server'
import { api, ApiError, isUnauthorized, unwrap } from './client'

describe('unwrap', () => {
  it('returns the body of a successful response', async () => {
    await expect(unwrap(api.GET('/api/config'))).resolves.toEqual({
      google_client_id: 'test-client-id',
    })
  })

  it('throws ApiError with status and detail', async () => {
    server.use(
      http.get('*/api/config', () => HttpResponse.json({ detail: 'boom' }, { status: 503 })),
    )

    const error: unknown = await unwrap(api.GET('/api/config')).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(503)
    expect((error as ApiError).detail).toEqual({ detail: 'boom' })
    expect(isUnauthorized(error)).toBe(false)
  })

  it('recognises 401', async () => {
    const error: unknown = await unwrap(api.GET('/api/auth/me')).catch((e: unknown) => e)
    expect(isUnauthorized(error)).toBe(true)
  })

  it('sends cookies with requests', async () => {
    // Checked on the outgoing Request: MSW rebuilds requests and drops `credentials`.
    const spy = vi.spyOn(globalThis, 'fetch')

    await unwrap(api.GET('/api/config'))

    const request = spy.mock.calls[0]?.[0] as Request | undefined
    expect(request?.credentials).toBe('include')
    spy.mockRestore()
  })
})
