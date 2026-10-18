import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { http, HttpResponse } from 'msw'

import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { GoogleSignInButton } from './GoogleSignInButton'

type Initialize = (config: google.accounts.id.IdConfiguration) => void
type RenderButton = (parent: HTMLElement, options: google.accounts.id.GsiButtonConfiguration) => void

function installFakeGoogle() {
  const initialize = vi.fn<Initialize>()
  const renderButton = vi.fn<RenderButton>()
  vi.stubGlobal('google', { accounts: { id: { initialize, renderButton } } })
  return { initialize, renderButton }
}

describe('GoogleSignInButton', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('initializes Google in redirect mode with the nonce and renders the button', async () => {
    const { initialize, renderButton } = installFakeGoogle()

    renderWithProviders(<GoogleSignInButton clientId="client-123" />)

    await waitFor(() => expect(renderButton).toHaveBeenCalledOnce())
    expect(initialize).toHaveBeenCalledWith({
      client_id: 'client-123',
      ux_mode: 'redirect',
      login_uri: `${window.location.origin}/api/auth/google/redirect`,
      nonce: 'test-nonce',
    })
    expect(renderButton.mock.calls[0]?.[0]).toBe(screen.getByTestId('google-signin'))
  })

  it('shows an error when the nonce cannot be fetched', async () => {
    const { renderButton } = installFakeGoogle()
    server.use(http.get('*/api/auth/google/nonce', () => new HttpResponse(null, { status: 502 })))

    renderWithProviders(<GoogleSignInButton clientId="client-123" />)

    expect(await screen.findByText('Не удалось загрузить кнопку Google')).toBeInTheDocument()
    expect(renderButton).not.toHaveBeenCalled()
  })
})
