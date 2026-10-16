import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

import type { User } from '../lib/types'

const unauthorized = () => HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 })

/** Default: API is up, nobody is signed in. Override per test with `server.use(...)`. */
export const handlers = [
  http.get('*/api/health', () => HttpResponse.json({ status: 'ok' })),
  http.get('*/api/config', () => HttpResponse.json({ google_client_id: 'test-client-id' })),
  http.get('*/api/auth/me', unauthorized),
  http.post('*/api/auth/logout', () => new HttpResponse(null, { status: 204 })),
]

export const server = setupServer(...handlers)

export function signIn(user: User) {
  server.use(http.get('*/api/auth/me', () => HttpResponse.json(user)))
}

export function signOut() {
  server.use(http.get('*/api/auth/me', unauthorized))
}
