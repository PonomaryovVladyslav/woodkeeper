import { AppShell, Avatar, Button, Group, Text, Title } from '@mantine/core'

import { useLogout, useMe } from '../api/queries'

export function MainPage() {
  const { data: user } = useMe()
  const logout = useLogout()

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Title order={3}>Woodkeeper</Title>
          <Group gap="sm" wrap="nowrap">
            <Avatar src={user?.avatar_url} name={user?.name ?? user?.email} size="sm" />
            <Text size="sm" visibleFrom="xs" truncate>
              {user?.name ?? user?.email}
            </Text>
            <Button variant="subtle" size="xs" loading={logout.isPending} onClick={() => logout.mutate()}>
              Выйти
            </Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Text c="dimmed">Подпроекты появятся здесь.</Text>
      </AppShell.Main>
    </AppShell>
  )
}
