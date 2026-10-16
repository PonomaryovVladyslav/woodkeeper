import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { queryKeys } from './api/keys'
import { AppRoutes } from './AppRoutes'
import { ALICE } from './test/fixtures'
import { renderWithProviders } from './test/render'
import { server, signIn, signOut } from './test/server'

// The real button needs Google's script; here it just hands over a fake credential.
vi.mock('./components/GoogleSignInButton', () => ({
  GoogleSignInButton: ({ onCredential }: { onCredential: (credential: string) => void }) => (
    <button type="button" onClick={() => onCredential('google-credential')}>
      Войти через Google
    </button>
  ),
}))

const googleButton = () => screen.findByRole('button', { name: 'Войти через Google' })

describe('auth flow', () => {
  it('sends a signed-out user from / to the login page', async () => {
    renderWithProviders(<AppRoutes />, { route: '/' })

    expect(await googleButton()).toBeInTheDocument()
  })

  it('redirects unknown paths to / and then to login', async () => {
    renderWithProviders(<AppRoutes />, { route: '/no/such/page' })

    expect(await googleButton()).toBeInTheDocument()
  })

  it('shows the main page to a signed-in user', async () => {
    signIn(ALICE)
    renderWithProviders(<AppRoutes />, { route: '/' })

    expect(await screen.findByText('Alice')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument()
  })

  it('sends a signed-in user away from /login', async () => {
    signIn(ALICE)
    renderWithProviders(<AppRoutes />, { route: '/login' })

    expect(await screen.findByRole('button', { name: 'Выйти' })).toBeInTheDocument()
  })

  it('logs in with the Google credential', async () => {
    const received: unknown[] = []
    server.use(
      http.post('*/api/auth/google', async ({ request }) => {
        received.push(await request.json())
        signIn(ALICE) // the server sets the session cookie
        return HttpResponse.json(ALICE)
      }),
    )
    renderWithProviders(<AppRoutes />, { route: '/login' })

    await userEvent.click(await googleButton())

    expect(await screen.findByText('Alice')).toBeInTheDocument()
    expect(received).toEqual([{ credential: 'google-credential' }])
  })

  it('stays on the login page when Google login is rejected', async () => {
    server.use(
      http.post('*/api/auth/google', () =>
        HttpResponse.json({ detail: 'Invalid Google token' }, { status: 401 }),
      ),
    )
    renderWithProviders(<AppRoutes />, { route: '/login' })

    await userEvent.click(await googleButton())

    expect(await screen.findByText('Не удалось войти')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Войти через Google' })).toBeInTheDocument()
  })

  it('logs out and returns to the login page', async () => {
    signIn(ALICE)
    const { queryClient } = renderWithProviders(<AppRoutes />, { route: '/' })
    const logout = await screen.findByRole('button', { name: 'Выйти' })
    queryClient.setQueryData(['projects'], [{ id: 1 }])

    signOut() // the server clears the session cookie
    await userEvent.click(logout)

    expect(await googleButton()).toBeInTheDocument()
    expect(queryClient.getQueryData(['projects'])).toBeUndefined()
  })

  it('redirects to login when the session expires (API answers 401)', async () => {
    signIn(ALICE)
    const { queryClient } = renderWithProviders(<AppRoutes />, { route: '/' })
    expect(await screen.findByText('Alice')).toBeInTheDocument()

    signOut()
    await queryClient.invalidateQueries({ queryKey: queryKeys.me })

    expect(await googleButton()).toBeInTheDocument()
  })

  it('explains when Google login is not configured on the server', async () => {
    server.use(http.get('*/api/config', () => HttpResponse.json({ google_client_id: '' })))
    renderWithProviders(<AppRoutes />, { route: '/login' })

    expect(await screen.findByText('Вход не настроен')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Войти через Google' })).not.toBeInTheDocument()
  })

  it('offers a retry when the server is down', async () => {
    server.use(http.get('*/api/auth/me', () => new HttpResponse(null, { status: 502 })))
    renderWithProviders(<AppRoutes />, { route: '/' })

    expect(await screen.findByText('Сервер недоступен')).toBeInTheDocument()

    signIn(ALICE)
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument())
  })
})
