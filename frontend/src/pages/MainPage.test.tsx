import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { AppRoutes } from '../AppRoutes'
import { fakeApi } from '../test/fakeApi'
import { ALICE } from '../test/fixtures'
import { renderWithProviders } from '../test/render'
import { server, signIn } from '../test/server'

function renderMain(route = '/') {
  signIn(ALICE)
  return renderWithProviders(<AppRoutes />, { route })
}

const tab = (name: string) => screen.findByRole('tab', { name: new RegExp(name) })

async function openProjectMenu(item: 'Изменить' | 'Удалить') {
  await userEvent.click(screen.getByRole('button', { name: 'Действия с подпроектом' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: item }))
  return screen.findByRole('dialog')
}

describe('projects UI', () => {
  it('shows an empty state without projects', async () => {
    fakeApi()
    renderMain()

    expect(await screen.findByText(/Создайте первый подпроект/)).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('lists projects as tabs with ordered/total counts and selects the first', async () => {
    fakeApi([
      { name: 'Шкаф', boards_count: 3, ordered_count: 1, description: 'Прихожая' },
      { name: 'Комод' },
    ])
    renderMain()

    const first = await tab('Шкаф')
    expect(first).toHaveAttribute('aria-selected', 'true')
    expect(within(first).getByText('1/3')).toBeInTheDocument()
    expect(screen.getByText('Прихожая')).toBeInTheDocument()
  })

  it('opens the project from ?project= and switches tabs', async () => {
    fakeApi([{ id: 1, name: 'Шкаф' }, { id: 2, name: 'Комод', description: 'Спальня' }])
    renderMain('/?project=2')

    expect(await tab('Комод')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Спальня')).toBeInTheDocument()

    await userEvent.click(await tab('Шкаф'))
    await waitFor(async () => expect(await tab('Шкаф')).toHaveAttribute('aria-selected', 'true'))
  })

  it('creates a project and selects it', async () => {
    const api = fakeApi([{ name: 'Шкаф' }])
    renderMain()
    await tab('Шкаф')

    await userEvent.click(screen.getByRole('button', { name: 'Подпроект' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Название'), '  Комод  ')
    await userEvent.type(within(dialog).getByLabelText('Описание'), 'Спальня')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Создать' }))

    // The list refetches first, then the new project gets selected.
    const created = await tab('Комод')
    await waitFor(() => expect(created).toHaveAttribute('aria-selected', 'true'))
    expect(api.requests).toEqual([
      { method: 'POST', path: '/api/projects', body: { name: 'Комод', description: 'Спальня' } },
    ])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('validates the name before sending', async () => {
    const api = fakeApi()
    renderMain()

    await userEvent.click(await screen.findByRole('button', { name: 'Подпроект' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Название'), '   ')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Создать' }))

    expect(await within(dialog).findByText('Введите название')).toBeInTheDocument()
    expect(api.requests).toEqual([])
  })

  it('renames a project and clears its description', async () => {
    const api = fakeApi([{ id: 5, name: 'Шкаф', description: 'Старое' }])
    renderMain()
    await tab('Шкаф')

    const dialog = await openProjectMenu('Изменить')
    const name = within(dialog).getByLabelText('Название')
    expect(name).toHaveValue('Шкаф')
    await userEvent.clear(name)
    await userEvent.type(name, 'Шкаф-купе')
    await userEvent.clear(within(dialog).getByLabelText('Описание'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))

    expect(await tab('Шкаф-купе')).toBeInTheDocument()
    expect(screen.queryByText('Старое')).not.toBeInTheDocument()
    expect(api.requests).toEqual([
      { method: 'PATCH', path: '/api/projects/5', body: { name: 'Шкаф-купе', description: null } },
    ])
  })

  it('deletes a project after confirmation that warns about boards', async () => {
    const api = fakeApi([
      { id: 1, name: 'Шкаф', boards_count: 3 },
      { id: 2, name: 'Комод' },
    ])
    renderMain()
    await tab('Шкаф')

    const dialog = await openProjectMenu('Удалить')
    expect(within(dialog).getByText(/вместе со всеми досками \(3 шт\.\)/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Удалить' }))

    await waitFor(() => expect(screen.queryByRole('tab', { name: /Шкаф/ })).not.toBeInTheDocument())
    const remaining = await tab('Комод')
    await waitFor(() => expect(remaining).toHaveAttribute('aria-selected', 'true'))
    expect(api.requests).toEqual([{ method: 'DELETE', path: '/api/projects/1', body: null }])
  })

  it('does not delete when the confirmation is cancelled', async () => {
    const api = fakeApi([{ name: 'Шкаф' }])
    renderMain()
    await tab('Шкаф')

    const dialog = await openProjectMenu('Удалить')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await tab('Шкаф')).toBeInTheDocument()
    expect(api.requests).toEqual([])
  })

  it('keeps the form open and shows an error when saving fails', async () => {
    fakeApi()
    server.use(http.post('*/api/projects', () => new HttpResponse(null, { status: 500 })))
    renderMain()

    await userEvent.click(await screen.findByRole('button', { name: 'Подпроект' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Название'), 'Комод')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Создать' }))

    expect(await within(dialog).findByText(/Не удалось сохранить/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Название')).toHaveValue('Комод')
  })

  it('offers a retry when projects fail to load', async () => {
    server.use(http.get('*/api/projects', () => new HttpResponse(null, { status: 500 })))
    renderMain()

    expect(await screen.findByText('Не удалось загрузить подпроекты')).toBeInTheDocument()

    fakeApi([{ name: 'Шкаф' }])
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await tab('Шкаф')).toBeInTheDocument()
  })
})
