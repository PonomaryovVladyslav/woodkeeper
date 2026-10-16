import {
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  SimpleGrid,
  Stack,
  Textarea,
  TextInput,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { useState } from 'react'

import { useCreateBoard, useUpdateBoard } from '../api/queries'
import { NO_FACES } from '../lib/faces'
import { loadLastColor, saveLastColor } from '../lib/lastColorStorage'
import { NAME_MAX_LENGTH, NOTES_MAX_LENGTH } from '../lib/limits'
import type { BoardDraft, Faces } from '../lib/types'
import type { VeneerState } from '../lib/veneer'
import { DimensionsFields } from './DimensionsFields'
import { FacesEditor } from './FacesEditor'

export type EditorState =
  | { mode: 'create' }
  | { mode: 'edit'; boardId: number; draft: BoardDraft }
  | { mode: 'duplicate'; draft: BoardDraft }

interface Props {
  projectId: number
  state: EditorState | null
  onClose: () => void
}

interface FormValues {
  name: string
  length_mm: number | string
  width_mm: number | string
  thickness_mm: number | string
  quantity: number | string
  is_ordered: boolean
  notes: string
  faces: Faces
}

const TITLES = { create: 'Новая доска', edit: 'Доска', duplicate: 'Копия доски' } as const

function toFormValues(draft: BoardDraft | null): FormValues {
  return {
    name: draft?.name ?? '',
    length_mm: draft?.length_mm ?? '',
    width_mm: draft?.width_mm ?? '',
    thickness_mm: draft?.thickness_mm ?? '',
    quantity: draft?.quantity ?? 1,
    is_ordered: draft?.is_ordered ?? false,
    notes: draft?.notes ?? '',
    faces: { ...NO_FACES, ...draft?.faces },
  }
}

function toDraft(values: FormValues): BoardDraft {
  return {
    name: values.name.trim(),
    length_mm: Number(values.length_mm),
    width_mm: Number(values.width_mm),
    thickness_mm: Number(values.thickness_mm),
    quantity: Number(values.quantity),
    is_ordered: values.is_ordered,
    notes: values.notes.trim() || null,
    faces: values.faces,
  }
}

const positiveInteger = (message: string) => (value: number | string) =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? null : message

/** Modal wrapper; the form mounts fresh on every open, so it starts from `state`. */
export function BoardEditor({ projectId, state, onClose }: Props) {
  return (
    <Modal
      opened={state !== null}
      onClose={onClose}
      title={state ? TITLES[state.mode] : ''}
      size="lg"
      centered
    >
      {state && <BoardEditorForm projectId={projectId} state={state} onClose={onClose} />}
    </Modal>
  )
}

function BoardEditorForm({
  projectId,
  state,
  onClose,
}: {
  projectId: number
  state: EditorState
  onClose: () => void
}) {
  const create = useCreateBoard(projectId)
  const update = useUpdateBoard()
  const [lastColor, setLastColor] = useState(loadLastColor)

  const form = useForm<FormValues>({
    initialValues: toFormValues(state.mode === 'create' ? null : state.draft),
    validate: {
      name: (value) => {
        const name = value.trim()
        if (!name) return 'Введите название'
        if (name.length > NAME_MAX_LENGTH) return `Не длиннее ${NAME_MAX_LENGTH} символов`
        return null
      },
      length_mm: positiveInteger('Целое число больше 0'),
      width_mm: positiveInteger('Целое число больше 0'),
      thickness_mm: positiveInteger('Целое число больше 0'),
      quantity: positiveInteger('Не меньше 1'),
      notes: (value) =>
        value.trim().length > NOTES_MAX_LENGTH ? `Не длиннее ${NOTES_MAX_LENGTH} символов` : null,
    },
  })

  const veneer: VeneerState = { faces: form.values.faces, lastColor }
  const changeVeneer = (next: VeneerState) => {
    form.setFieldValue('faces', next.faces)
    if (next.lastColor && next.lastColor !== lastColor) {
      setLastColor(next.lastColor)
      saveLastColor(next.lastColor)
    }
  }

  const saving = create.isPending || update.isPending
  const failed = create.isError || update.isError

  const submit = form.onSubmit((values) => {
    const draft = toDraft(values)
    if (state.mode === 'edit') {
      update.mutate({ id: state.boardId, ...draft }, { onSuccess: onClose })
    } else {
      create.mutate(draft, { onSuccess: onClose })
    }
  })

  return (
    <form onSubmit={submit} noValidate>
      <Stack>
        <TextInput
          label="Название"
          placeholder="Полка"
          data-autofocus
          {...form.getInputProps('name')}
        />
        <DimensionsFields inputProps={(field) => form.getInputProps(field)} />
        <SimpleGrid cols={2} spacing="xs">
          <NumberInput
            label="Количество"
            suffix=" шт."
            min={1}
            allowDecimal={false}
            allowNegative={false}
            clampBehavior="none"
            inputMode="numeric"
            {...form.getInputProps('quantity')}
          />
          <Checkbox
            label="Заказана"
            mt={30}
            {...form.getInputProps('is_ordered', { type: 'checkbox' })}
          />
        </SimpleGrid>
        <FacesEditor value={veneer} onChange={changeVeneer} />
        <Textarea
          label="Заметки"
          placeholder="Отверстия под полкодержатели, кромка с одной стороны…"
          autosize
          minRows={2}
          maxRows={8}
          {...form.getInputProps('notes')}
        />
        {failed && (
          <Alert color="red" title="Не удалось сохранить">
            Проверьте данные и попробуйте ещё раз.
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button type="submit" loading={saving}>
            Сохранить
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
