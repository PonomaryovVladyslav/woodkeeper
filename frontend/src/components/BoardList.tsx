import {
  Alert,
  Button,
  Center,
  Group,
  Loader,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { useState } from 'react'

import { useBoards, useDeleteBoard, useUpdateBoard } from '../api/queries'
import { duplicateDraft } from '../lib/duplicate'
import type { Board, BoardDraft } from '../lib/types'
import { BoardCard } from './BoardCard'
import { BoardEditor, type EditorState } from './BoardEditor'
import { ConfirmModal } from './ConfirmModal'

type Filter = 'all' | 'todo' | 'ordered'

const MATCHES: Record<Filter, (board: Board) => boolean> = {
  all: () => true,
  todo: (board) => !board.is_ordered,
  ordered: (board) => board.is_ordered,
}

function toDraft({ id: _id, project_id: _p, created_at: _c, updated_at: _u, ...draft }: Board) {
  return draft satisfies BoardDraft
}

export function BoardList({ projectId }: { projectId: number }) {
  const boards = useBoards(projectId)
  const update = useUpdateBoard()
  const remove = useDeleteBoard()
  const [filter, setFilter] = useState<Filter>('all')
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [deleting, setDeleting] = useState<Board | null>(null)

  if (boards.isPending) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    )
  }
  if (boards.isError) {
    return (
      <Alert color="red" title="Не удалось загрузить доски">
        <Button variant="light" color="red" mt="sm" onClick={() => void boards.refetch()}>
          Повторить
        </Button>
      </Alert>
    )
  }

  const all = boards.data
  const ordered = all.filter(MATCHES.ordered).length
  const visible = all.filter(MATCHES[filter])
  const togglingId = update.isPending ? update.variables.id : null

  return (
    <Stack>
      <Group justify="space-between" gap="xs">
        <SegmentedControl
          size="xs"
          value={filter}
          onChange={(value) => setFilter(value as Filter)}
          data={[
            { value: 'all', label: `Все (${all.length})` },
            { value: 'todo', label: `Не заказаны (${all.length - ordered})` },
            { value: 'ordered', label: `Заказаны (${ordered})` },
          ]}
        />
        <Button
          size="xs"
          leftSection={<IconPlus size={16} />}
          onClick={() => setEditor({ mode: 'create' })}
        >
          Доска
        </Button>
      </Group>

      {all.length === 0 ? (
        <Center py="xl">
          <Text c="dimmed">Пока нет досок. Добавьте первую.</Text>
        </Center>
      ) : visible.length === 0 ? (
        <Center py="xl">
          <Text c="dimmed">Нет досок с таким фильтром.</Text>
        </Center>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
          {visible.map((board) => (
            <BoardCard
              key={board.id}
              board={board}
              toggling={togglingId === board.id}
              onToggleOrdered={(is_ordered) => update.mutate({ id: board.id, is_ordered })}
              onEdit={() => setEditor({ mode: 'edit', boardId: board.id, draft: toDraft(board) })}
              onDuplicate={() => setEditor({ mode: 'duplicate', draft: duplicateDraft(board) })}
              onDelete={() => {
                remove.reset()
                setDeleting(board)
              }}
            />
          ))}
        </SimpleGrid>
      )}

      <BoardEditor projectId={projectId} state={editor} onClose={() => setEditor(null)} />

      <ConfirmModal
        opened={deleting !== null}
        title="Удалить доску?"
        confirmLabel="Удалить"
        loading={remove.isPending}
        error={remove.isError ? 'Не удалось удалить. Попробуйте ещё раз.' : null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      >
        Доска «{deleting?.name}» будет удалена. Это действие нельзя отменить.
      </ConfirmModal>
    </Stack>
  )
}
