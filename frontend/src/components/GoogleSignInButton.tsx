import { Alert, Loader } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'

import { api, unwrap } from '../api/client'
import { loadGoogleIdentity } from '../api/google'

/** The backend endpoint Google posts the signed-in user's ID token to. */
const GOOGLE_LOGIN_PATH = '/api/auth/google/redirect'

interface Props {
  clientId: string
}

/**
 * Google's button in redirect mode: the whole page goes to Google and comes back
 * through the backend, which sets the session and redirects to the app. The popup
 * mode leaves iOS Safari on a blank page after the account is picked.
 */
export function GoogleSignInButton({ clientId }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')

  useEffect(() => {
    let cancelled = false
    Promise.all([loadGoogleIdentity(), unwrap(api.GET('/api/auth/google/nonce'))])
      .then(([, { nonce }]) => {
        if (cancelled || !container.current) return
        google.accounts.id.initialize({
          client_id: clientId,
          ux_mode: 'redirect',
          login_uri: new URL(GOOGLE_LOGIN_PATH, window.location.origin).href,
          nonce,
        })
        google.accounts.id.renderButton(container.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          locale: 'ru',
        })
        setState('ready')
      })
      .catch(() => {
        if (!cancelled) setState('failed')
      })
    return () => {
      cancelled = true
    }
  }, [clientId])

  return (
    <>
      {state === 'loading' && <Loader size="sm" />}
      {state === 'failed' && (
        <Alert color="red" title="Не удалось загрузить кнопку Google">
          Проверьте подключение к интернету и обновите страницу.
        </Alert>
      )}
      <div ref={container} data-testid="google-signin" />
    </>
  )
}
