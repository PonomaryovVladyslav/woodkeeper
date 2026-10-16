import createClient from 'openapi-fetch'

import type { paths } from './schema'

export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(status: number, detail: unknown) {
    super(`API request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}

export const api = createClient<paths>({
  baseUrl: window.location.origin,
  credentials: 'include',
  // Look up fetch per request instead of capturing it at import time,
  // so anything that wraps fetch later (MSW in tests) is respected.
  fetch: (request) => globalThis.fetch(request),
})

interface FetchResult<T> {
  data?: T
  error?: unknown
  response: Response
}

/** Resolves to the response body or throws ApiError, so TanStack Query sees failures. */
export async function unwrap<T>(request: Promise<FetchResult<T>>): Promise<T> {
  const { data, error, response } = await request
  if (!response.ok) {
    throw new ApiError(response.status, error)
  }
  return data as T
}
