import { Alert, Button, Center, Loader } from '@mantine/core'
import { Navigate, Outlet } from 'react-router'

import { useMe } from '../api/queries'

export function RequireAuth() {
  const me = useMe()

  if (me.isPending) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )
  }
  if (me.isError) {
    return (
      <Center h="100vh" p="md">
        <Alert color="red" title="Сервер недоступен">
          <Button variant="light" color="red" mt="sm" onClick={() => void me.refetch()}>
            Повторить
          </Button>
        </Alert>
      </Center>
    )
  }
  if (me.data === null) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}
