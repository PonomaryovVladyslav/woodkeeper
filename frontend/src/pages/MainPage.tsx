import {
  Alert,
  AppShell,
  Avatar,
  Button,
  Center,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useSearchParams } from 'react-router'

import { useLogout, useMe, useProjects } from '../api/queries'
import { ProjectTabs } from '../components/ProjectTabs'
import type { Project } from '../lib/types'

/** Selected project lives in ?project=<id>, so reload and back/forward keep it. */
function useActiveProject(projects: Project[] | undefined) {
  const [params, setParams] = useSearchParams()
  const requested = Number(params.get('project'))
  const active = projects?.find((project) => project.id === requested) ?? projects?.[0] ?? null
  const select = (id: number) => setParams({ project: String(id) }, { replace: true })
  return [active, select] as const
}

export function MainPage() {
  const { data: user } = useMe()
  const logout = useLogout()
  const projects = useProjects()
  const [active, select] = useActiveProject(projects.data)

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
            <Button
              variant="subtle"
              size="xs"
              loading={logout.isPending}
              onClick={() => logout.mutate()}
            >
              Выйти
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        {projects.isPending && (
          <Center py="xl">
            <Loader />
          </Center>
        )}
        {projects.isError && (
          <Alert color="red" title="Не удалось загрузить подпроекты">
            <Button variant="light" color="red" mt="sm" onClick={() => void projects.refetch()}>
              Повторить
            </Button>
          </Alert>
        )}
        {projects.data && (
          <Stack>
            <ProjectTabs projects={projects.data} activeId={active?.id ?? null} onSelect={select} />
            {active ? (
              <Stack gap="xs">
                {active.description && (
                  <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
                    {active.description}
                  </Text>
                )}
                <Text c="dimmed">Доски появятся здесь.</Text>
              </Stack>
            ) : (
              <Center py="xl">
                <Text c="dimmed">Создайте первый подпроект, например «Шкаф в прихожей».</Text>
              </Center>
            )}
          </Stack>
        )}
      </AppShell.Main>
    </AppShell>
  )
}
