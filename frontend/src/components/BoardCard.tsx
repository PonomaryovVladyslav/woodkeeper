import { ActionIcon, Badge, Card, Checkbox, Group, Stack, Text, Tooltip } from '@mantine/core'
import { IconCopy, IconPencil, IconTrash } from '@tabler/icons-react'

import { formatDimensions, formatQuantity } from '../lib/format'
import type { Board } from '../lib/types'
import { BoardPreviewStatic } from './BoardPreviewStatic'
import { FaceSwatches } from './FaceSwatches'

interface Props {
  board: Board
  toggling?: boolean
  onToggleOrdered: (ordered: boolean) => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}

export function BoardCard({
  board,
  toggling = false,
  onToggleOrdered,
  onEdit,
  onDuplicate,
  onDelete,
}: Props) {
  const quantity = formatQuantity(board.quantity)

  return (
    <Card withBorder padding="sm" radius="md" opacity={board.is_ordered ? 0.7 : 1}>
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Text component="h3" fw={600} m={0} style={{ overflowWrap: 'anywhere' }}>
            {board.name}
          </Text>
          {quantity && (
            <Badge variant="light" style={{ flexShrink: 0 }}>
              {quantity}
            </Badge>
          )}
        </Group>
        <Group gap="sm" wrap="nowrap" align="center">
          <BoardPreviewStatic dimensions={board} faces={board.faces} height={56} />
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Text size="sm">{formatDimensions(board)}</Text>
            <FaceSwatches faces={board.faces} />
          </Stack>
        </Group>
        {board.notes && (
          <Text size="xs" c="dimmed" lineClamp={3} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {board.notes}
          </Text>
        )}
        <Group justify="space-between" wrap="nowrap" mt={4}>
          <Checkbox
            label="Заказана"
            checked={board.is_ordered}
            disabled={toggling}
            onChange={(event) => onToggleOrdered(event.currentTarget.checked)}
          />
          <Group gap={2} wrap="nowrap">
            <Tooltip label="Изменить" withArrow>
              <ActionIcon variant="subtle" color="gray" aria-label="Изменить" onClick={onEdit}>
                <IconPencil size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Дублировать" withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="Дублировать"
                onClick={onDuplicate}
              >
                <IconCopy size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Удалить" withArrow>
              <ActionIcon variant="subtle" color="red" aria-label="Удалить" onClick={onDelete}>
                <IconTrash size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Stack>
    </Card>
  )
}
