import { Badge, Container, Group, Text, Title } from '@mantine/core'
import { useEffect, useState } from 'react'

type ApiStatus = 'checking' | 'ok' | 'down'

function useApiStatus(): ApiStatus {
  const [status, setStatus] = useState<ApiStatus>('checking')

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/health', { signal: controller.signal })
      .then((response) => setStatus(response.ok ? 'ok' : 'down'))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.warn('API health check failed', error)
          setStatus('down')
        }
      })
    return () => controller.abort()
  }, [])

  return status
}

const STATUS_BADGE: Record<ApiStatus, { color: string; label: string }> = {
  checking: { color: 'gray', label: 'проверка…' },
  ok: { color: 'teal', label: 'работает' },
  down: { color: 'red', label: 'недоступен' },
}

export default function App() {
  const status = useApiStatus()
  const badge = STATUS_BADGE[status]

  return (
    <Container size="sm" py="xl">
      <Title order={1}>Woodkeeper</Title>
      <Text c="dimmed" mb="md">
        Планирование досок для мебели
      </Text>
      <Group gap="xs">
        <Text size="sm">API:</Text>
        <Badge color={badge.color} variant="light">
          {badge.label}
        </Badge>
      </Group>
    </Container>
  )
}
