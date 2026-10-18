import { Alert, Center, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import { Navigate, useSearchParams } from 'react-router'

import { useConfig, useMe } from '../api/queries'
import { GoogleSignInButton } from '../components/GoogleSignInButton'

export function LoginPage() {
  const me = useMe()
  const config = useConfig()
  // The backend sends a failed Google login back here with ?error=google.
  const [params] = useSearchParams()
  const loginFailed = params.has('error')

  if (me.data) {
    return <Navigate to="/" replace />
  }

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder shadow="sm" p="xl" radius="md" w={360} maw="100%">
        <Stack align="center" gap="md">
          <Title order={1}>Woodkeeper</Title>
          <Text c="dimmed" ta="center">
            Планирование досок для мебели
          </Text>

          {config.isPending && <Loader size="sm" />}
          {config.isError && (
            <Alert color="red" title="Сервер недоступен">
              Не удалось получить настройки входа.
            </Alert>
          )}
          {config.data && !config.data.google_client_id && (
            <Alert color="orange" title="Вход не настроен">
              На сервере не задан GOOGLE_CLIENT_ID.
            </Alert>
          )}
          {config.data?.google_client_id && (
            <GoogleSignInButton clientId={config.data.google_client_id} />
          )}

          {loginFailed && (
            <Alert color="red" title="Не удалось войти">
              Попробуйте ещё раз.
            </Alert>
          )}
        </Stack>
      </Paper>
    </Center>
  )
}
