import { Alert, Loader } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'

import { loadGoogleIdentity } from '../api/google'

interface Props {
  clientId: string
  onCredential: (credential: string) => void
}

export function GoogleSignInButton({ clientId, onCredential }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const callback = useRef(onCredential)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')

  useEffect(() => {
    callback.current = onCredential
  }, [onCredential])

  useEffect(() => {
    let cancelled = false
    loadGoogleIdentity()
      .then(() => {
        if (cancelled || !container.current) return
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => callback.current(response.credential),
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
