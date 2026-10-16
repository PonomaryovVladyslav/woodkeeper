import {
  Alert,
  Button,
  Checkbox,
  Center,
  Group,
  Loader,
  Modal,
  NumberInput,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { useMediaQuery } from '@mantine/hooks'
import { lazy, Suspense, useState } from 'react'

import { useCreateBoard, useUpdateBoard } from '../api/queries'
import { NO_FACES, SIDE_LABELS } from '../lib/faces'
import { loadLastColor, saveLastColor } from '../lib/lastColorStorage'
import { NAME_MAX_LENGTH, NOTES_MAX_LENGTH } from '../lib/limits'
import type { BoardDraft, Faces, Side } from '../lib/types'
import { toggleSide, type VeneerState } from '../lib/veneer'
import { DimensionsFields } from './DimensionsFields'
import { FacesEditor } from './FacesEditor'

// three.js is large: load the 3D view only when the editor opens.
const BoardPreview3D = lazy(() => import('./BoardPreview3D'))

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
  const phone = useMediaQuery('(max-width: 36em)')
  return (
    <Modal
      opened={state !== null}
      onClose={onClose}
      title={state ? TITLES[state.mode] : ''}
      size="xl"
      fullScreen={phone}
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
  const [hoveredSide, setHoveredSide] = useState<Side | null>(null)

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

  const values = form.values
  const dimensions = {
    length_mm: Number(values.length_mm),
    width_mm: Number(values.width_mm),
    thickness_mm: Number(values.thickness_mm),
  }
  const hint = hoveredSide
    ? `${SIDE_LABELS[hoveredSide]}: клик ${values.faces[hoveredSide] ? 'снимет' : 'включит'} облицовку`
    : 'Вращайте мышью или пальцем; клик по грани включает облицовку'

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
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
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
            <Textarea
              label="Заметки"
              placeholder="Отверстия под полкодержатели, кромка с одной стороны…"
              autosize
              minRows={2}
              maxRows={8}
              {...form.getInputProps('notes')}
            />
          </Stack>
          <Stack gap="xs">
            <Suspense
              fallback={
                <Center h={280}>
                  <Loader />
                </Center>
              }
            >
              <BoardPreview3D
                dimensions={dimensions}
                faces={values.faces}
                hoveredSide={hoveredSide}
                onHoverSide={setHoveredSide}
                onToggleSide={(side) => changeVeneer(toggleSide(veneer, side))}
              />
            </Suspense>
            <Text size="xs" c="dimmed" mih={18}>
              {hint}
            </Text>
            <FacesEditor value={veneer} onChange={changeVeneer} activeSide={hoveredSide} />
          </Stack>
        </SimpleGrid>
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
