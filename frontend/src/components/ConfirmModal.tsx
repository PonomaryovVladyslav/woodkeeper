import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'

interface Props {
  opened: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  loading?: boolean
  error?: string | null
  onConfirm: () => void
  onClose: () => void
}

/** In-page confirmation for destructive actions. */
export function ConfirmModal({
  opened,
  title,
  children,
  confirmLabel,
  loading = false,
  error = null,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <Stack>
        <Text size="sm">{children}</Text>
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={loading}>
            Отмена
          </Button>
          <Button color="red" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
