import { ActionIcon, Badge, Button, Group, Menu, Tabs, Tooltip } from '@mantine/core'
import { IconDots, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'

import { useCreateProject, useDeleteProject, useUpdateProject } from '../api/queries'
import type { Project } from '../lib/types'
import { ConfirmModal } from './ConfirmModal'
import { ProjectFormModal } from './ProjectFormModal'

interface Props {
  projects: Project[]
  activeId: number | null
  onSelect: (id: number) => void
}

type Dialog = 'create' | 'edit' | 'delete' | null

const SAVE_ERROR = 'Не удалось сохранить. Попробуйте ещё раз.'

export function ProjectTabs({ projects, activeId, onSelect }: Props) {
  const [dialog, setDialog] = useState<Dialog>(null)
  const create = useCreateProject()
  const update = useUpdateProject()
  const remove = useDeleteProject()
  const active = projects.find((project) => project.id === activeId) ?? null

  const open = (next: Dialog) => {
    create.reset()
    update.reset()
    remove.reset()
    setDialog(next)
  }
  const close = () => setDialog(null)

  return (
    <>
      <Group gap="xs" wrap="nowrap" align="flex-end">
        {projects.length > 0 && (
          <Tabs
            value={activeId === null ? null : String(activeId)}
            onChange={(value) => value && onSelect(Number(value))}
            style={{ flex: 1, minWidth: 0 }}
          >
            <Tabs.List style={{ flexWrap: 'wrap' }}>
              {projects.map((project) => (
                <Tabs.Tab
                  key={project.id}
                  value={String(project.id)}
                  rightSection={
                    <Tooltip
                      label={`Заказано ${project.ordered_count} из ${project.boards_count}`}
                      withArrow
                    >
                      <Badge size="xs" variant="light" color="gray">
                        {project.ordered_count}/{project.boards_count}
                      </Badge>
                    </Tooltip>
                  }
                >
                  {project.name}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs>
        )}

        {active && (
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" aria-label="Действия с подпроектом">
                <IconDots size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => open('edit')}>
                Изменить
              </Menu.Item>
              <Menu.Item
                color="red"
                leftSection={<IconTrash size={16} />}
                onClick={() => open('delete')}
              >
                Удалить
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}

        <Button
          variant="light"
          size="xs"
          leftSection={<IconPlus size={16} />}
          onClick={() => open('create')}
        >
          Подпроект
        </Button>
      </Group>

      <ProjectFormModal
        opened={dialog === 'create'}
        title="Новый подпроект"
        submitLabel="Создать"
        loading={create.isPending}
        error={create.isError ? SAVE_ERROR : null}
        onClose={close}
        onSubmit={(values) =>
          create.mutate(values, {
            onSuccess: (project) => {
              close()
              onSelect(project.id)
            },
          })
        }
      />

      {active && (
        <>
          <ProjectFormModal
            opened={dialog === 'edit'}
            title="Подпроект"
            submitLabel="Сохранить"
            initial={{ name: active.name, description: active.description }}
            loading={update.isPending}
            error={update.isError ? SAVE_ERROR : null}
            onClose={close}
            onSubmit={(values) => update.mutate({ id: active.id, ...values }, { onSuccess: close })}
          />

          <ConfirmModal
            opened={dialog === 'delete'}
            title="Удалить подпроект?"
            confirmLabel="Удалить"
            loading={remove.isPending}
            error={remove.isError ? 'Не удалось удалить. Попробуйте ещё раз.' : null}
            onClose={close}
            onConfirm={() => remove.mutate(active.id, { onSuccess: close })}
          >
            Подпроект «{active.name}» будет удалён
            {active.boards_count > 0
              ? ` вместе со всеми досками (${active.boards_count} шт.).`
              : '. Досок в нём нет.'}{' '}
            Это действие нельзя отменить.
          </ConfirmModal>
        </>
      )}
    </>
  )
}
