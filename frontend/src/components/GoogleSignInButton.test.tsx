import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../test/render'
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

  it('initializes Google with the client id and renders the button', async () => {
    const { initialize, renderButton } = installFakeGoogle()

    renderWithProviders(<GoogleSignInButton clientId="client-123" onCredential={() => {}} />)

    await waitFor(() => expect(renderButton).toHaveBeenCalledOnce())
    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ client_id: 'client-123' }))
    expect(renderButton.mock.calls[0]?.[0]).toBe(screen.getByTestId('google-signin'))
  })

  it('passes the credential from Google to onCredential', async () => {
    const { initialize } = installFakeGoogle()
    const onCredential = vi.fn<(credential: string) => void>()

    renderWithProviders(<GoogleSignInButton clientId="client-123" onCredential={onCredential} />)
    await waitFor(() => expect(initialize).toHaveBeenCalled())

    const config = initialize.mock.calls[0]?.[0]
    config?.callback?.({ credential: 'jwt-token' } as google.accounts.id.CredentialResponse)

    expect(onCredential).toHaveBeenCalledWith('jwt-token')
  })
})
