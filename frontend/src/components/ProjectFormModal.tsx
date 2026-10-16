import { Alert, Button, Group, Modal, Stack, Textarea, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useEffect } from 'react'

import { NAME_MAX_LENGTH } from '../lib/limits'

export interface ProjectFormValues {
  name: string
  description: string | null
}

interface Props {
  opened: boolean
  title: string
  submitLabel: string
  initial?: ProjectFormValues
  loading?: boolean
  error?: string | null
  onSubmit: (values: ProjectFormValues) => void
  onClose: () => void
}

const EMPTY: ProjectFormValues = { name: '', description: null }

export function ProjectFormModal({
  opened,
  title,
  submitLabel,
  initial = EMPTY,
  loading = false,
  error = null,
  onSubmit,
  onClose,
}: Props) {
  const form = useForm({
    initialValues: { name: initial.name, description: initial.description ?? '' },
    validate: {
      name: (value) => {
        const name = value.trim()
        if (!name) return 'Введите название'
        if (name.length > NAME_MAX_LENGTH) return `Не длиннее ${NAME_MAX_LENGTH} символов`
        return null
      },
    },
  })

  // Reset to the given values every time the modal opens.
  const { setValues, resetDirty, clearErrors } = form
  useEffect(() => {
    if (opened) {
      setValues({ name: initial.name, description: initial.description ?? '' })
      resetDirty()
      clearErrors()
    }
  }, [opened, initial.name, initial.description, setValues, resetDirty, clearErrors])

  const submit = form.onSubmit(({ name, description }) =>
    onSubmit({ name: name.trim(), description: description.trim() || null }),
  )

  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <form onSubmit={submit}>
        <Stack>
          <TextInput
            label="Название"
            placeholder="Шкаф в прихожей"
            data-autofocus
            {...form.getInputProps('name')}
          />
          <Textarea
            label="Описание"
            placeholder="Необязательно"
            autosize
            minRows={2}
            maxRows={6}
            {...form.getInputProps('description')}
          />
          {error && <Alert color="red">{error}</Alert>}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose} disabled={loading}>
              Отмена
            </Button>
            <Button type="submit" loading={loading}>
              {submitLabel}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
