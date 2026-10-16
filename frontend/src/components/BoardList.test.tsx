import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { AppRoutes } from '../AppRoutes'
import { NO_FACES } from '../lib/faces'
import { fakeApi } from '../test/fakeApi'
import { ALICE } from '../test/fixtures'
import { renderWithProviders } from '../test/render'
import { server, signIn } from '../test/server'

const PROJECT = { id: 1, name: 'Шкаф' }

function renderBoards() {
  signIn(ALICE)
  return renderWithProviders(<AppRoutes />, { route: '/?project=1' })
}

/** The card (Mantine Card) that contains the board name. */
async function card(name: string) {
  const title = await screen.findByText(name, { selector: 'p' })
  const element = title.closest<HTMLElement>('.mantine-Card-root')
  if (!element) throw new Error(`No card for ${name}`)
  return element
}

const cardNames = () =>
  Array.from(document.querySelectorAll('.mantine-Card-root')).map(
    (element) => element.querySelector('p')?.textContent,
  )

async function openEditor(button: HTMLElement) {
  await userEvent.click(button)
  return screen.findByRole('dialog')
}

afterEach(() => {
  window.localStorage.clear()
})

describe('BoardList', () => {
  it('shows an empty state', async () => {
    fakeApi([PROJECT])
    renderBoards()

    expect(await screen.findByText(/Пока нет досок/)).toBeInTheDocument()
  })

  it('filters by ordered status and shows counts', async () => {
    fakeApi(
      [PROJECT],
      [
        { project_id: 1, name: 'Полка' },
        { project_id: 1, name: 'Боковина', is_ordered: true },
      ],
    )
    renderBoards()
    await card('Полка')

    expect(cardNames()).toEqual(['Полка', 'Боковина'])
    expect(screen.getByText('Все (2)')).toBeInTheDocument()

    await userEvent.click(screen.getByText('Не заказаны (1)'))
    expect(cardNames()).toEqual(['Полка'])

    await userEvent.click(screen.getByText('Заказаны (1)'))
    expect(cardNames()).toEqual(['Боковина'])
  })

  it('shows a filter-specific empty state', async () => {
    fakeApi([PROJECT], [{ project_id: 1, name: 'Полка' }])
    renderBoards()
    await card('Полка')

    await userEvent.click(screen.getByText('Заказаны (0)'))

    expect(screen.getByText('Нет досок с таким фильтром.')).toBeInTheDocument()
  })
})

describe('BoardCard', () => {
  it('shows dimensions, quantity, notes and veneered sides', async () => {
    fakeApi(
      [PROJECT],
      [
        {
          project_id: 1,
          name: 'Полка',
          length_mm: 1200,
          width_mm: 300,
          thickness_mm: 18,
          quantity: 4,
          notes: 'Отверстия под полкодержатели',
          faces: { ...NO_FACES, front: '#aa0000' },
        },
        { project_id: 1, name: 'Одна' },
      ],
    )
    renderBoards()

    const polka = within(await card('Полка'))
    expect(polka.getByText('1200 × 300 × 18 мм')).toBeInTheDocument()
    expect(polka.getByText('× 4')).toBeInTheDocument()
    expect(polka.getByText('Отверстия под полкодержатели')).toBeInTheDocument()
    expect(polka.getByLabelText('Передняя кромка: #aa0000')).toBeInTheDocument()

    const single = within(await card('Одна'))
    expect(single.queryByText(/^× /)).not.toBeInTheDocument()
    expect(single.getByText('Без облицовки')).toBeInTheDocument()
  })

  it('marks a board as ordered with PATCH and moves it down', async () => {
    const api = fakeApi(
      [PROJECT],
      [
        { id: 10, project_id: 1, name: 'Полка' },
        { id: 11, project_id: 1, name: 'Боковина' },
      ],
    )
    renderBoards()

    await userEvent.click(within(await card('Полка')).getByLabelText('Заказана'))

    await waitFor(() => expect(cardNames()).toEqual(['Боковина', 'Полка']))
    expect(api.requests).toEqual([
      { method: 'PATCH', path: '/api/boards/10', body: { is_ordered: true } },
    ])
    expect(await screen.findByText('1/2')).toBeInTheDocument()
  })

  it('deletes only after confirmation', async () => {
    const api = fakeApi([PROJECT], [{ id: 10, project_id: 1, name: 'Полка' }])
    renderBoards()

    let dialog = await openEditor(within(await card('Полка')).getByLabelText('Удалить'))
    expect(within(dialog).getByText(/Доска «Полка» будет удалена/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.requests).toEqual([])

    dialog = await openEditor(within(await card('Полка')).getByLabelText('Удалить'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Удалить' }))

    expect(await screen.findByText(/Пока нет досок/)).toBeInTheDocument()
    expect(api.requests).toEqual([{ method: 'DELETE', path: '/api/boards/10', body: null }])
  })
})

describe('BoardEditor', () => {
  it('rejects empty and zero dimensions without sending', async () => {
    const api = fakeApi([PROJECT])
    renderBoards()

    const dialog = await openEditor(await screen.findByRole('button', { name: 'Доска' }))
    const form = within(dialog)
    await userEvent.type(form.getByLabelText('Название'), 'Полка')
    await userEvent.type(form.getByLabelText('Длина'), '0')
    await userEvent.clear(form.getByLabelText('Количество'))
    await userEvent.click(form.getByRole('button', { name: 'Сохранить' }))

    expect(await form.findAllByText('Целое число больше 0')).toHaveLength(3)
    expect(form.getByText('Не меньше 1')).toBeInTheDocument()
    expect(api.requests).toEqual([])
  })

  it('creates a board with numbers, faces and notes', async () => {
    const api = fakeApi([PROJECT])
    renderBoards()

    const dialog = await openEditor(await screen.findByRole('button', { name: 'Доска' }))
    const form = within(dialog)
    await userEvent.type(form.getByLabelText('Название'), ' Полка ')
    await userEvent.type(form.getByLabelText('Длина'), '1200')
    await userEvent.type(form.getByLabelText('Ширина'), '300')
    await userEvent.type(form.getByLabelText('Толщина'), '18')
    await userEvent.clear(form.getByLabelText('Количество'))
    await userEvent.type(form.getByLabelText('Количество'), '4')
    await userEvent.click(form.getByLabelText('Передняя кромка'))
    await userEvent.type(form.getByLabelText('Заметки'), 'Отверстия')
    await userEvent.click(form.getByRole('button', { name: 'Сохранить' }))

    expect(await card('Полка')).toBeInTheDocument()
    expect(api.requests).toEqual([
      {
        method: 'POST',
        path: '/api/projects/1/boards',
        body: {
          name: 'Полка',
          length_mm: 1200,
          width_mm: 300,
          thickness_mm: 18,
          quantity: 4,
          is_ordered: false,
          notes: 'Отверстия',
          faces: { ...NO_FACES, front: '#ffffff' },
        },
      },
    ])
  })

  it('edits a board: fields are prefilled and saving sends PATCH', async () => {
    const api = fakeApi(
      [PROJECT],
      [
        {
          id: 10,
          project_id: 1,
          name: 'Полка',
          length_mm: 800,
          notes: 'Старая заметка',
          faces: { ...NO_FACES, top: '#123456' },
        },
      ],
    )
    renderBoards()

    const dialog = await openEditor(within(await card('Полка')).getByLabelText('Изменить'))
    const form = within(dialog)
    expect(form.getByLabelText('Название')).toHaveValue('Полка')
    expect(form.getByLabelText('Длина')).toHaveValue('800 мм')
    expect(form.getByLabelText('Верхняя пласть')).toBeChecked()

    await userEvent.clear(form.getByLabelText('Длина'))
    await userEvent.type(form.getByLabelText('Длина'), '1000')
    await userEvent.clear(form.getByLabelText('Заметки'))
    await userEvent.click(form.getByRole('button', { name: 'Сохранить' }))

    expect(await screen.findByText('1000 × 300 × 18 мм')).toBeInTheDocument()
    expect(api.requests).toEqual([
      {
        method: 'PATCH',
        path: '/api/boards/10',
        body: {
          name: 'Полка',
          length_mm: 1000,
          width_mm: 300,
          thickness_mm: 18,
          quantity: 1,
          is_ordered: false,
          notes: null,
          faces: { ...NO_FACES, top: '#123456' },
        },
      },
    ])
  })

  it('duplicates a board: copy is prefilled and saving sends POST', async () => {
    const api = fakeApi(
      [PROJECT],
      [{ id: 10, project_id: 1, name: 'Полка', is_ordered: true, quantity: 2 }],
    )
    renderBoards()

    const dialog = await openEditor(within(await card('Полка')).getByLabelText('Дублировать'))
    const form = within(dialog)
    expect(form.getByLabelText('Название')).toHaveValue('Полка (копия)')
    expect(form.getByLabelText('Заказана')).not.toBeChecked()

    await userEvent.clear(form.getByLabelText('Длина'))
    await userEvent.type(form.getByLabelText('Длина'), '600')
    await userEvent.click(form.getByRole('button', { name: 'Сохранить' }))

    expect(await card('Полка (копия)')).toBeInTheDocument()
    expect(api.requests).toEqual([
      {
        method: 'POST',
        path: '/api/projects/1/boards',
        body: expect.objectContaining({
          name: 'Полка (копия)',
          length_mm: 600,
          quantity: 2,
          is_ordered: false,
        }) as unknown,
      },
    ])
    expect(cardNames()).toEqual(['Полка (копия)', 'Полка'])
  })

  it('remembers the last veneer color across editor sessions', async () => {
    fakeApi([PROJECT])
    renderBoards()

    let form = within(await openEditor(await screen.findByRole('button', { name: 'Доска' })))
    await userEvent.click(form.getByLabelText('Верхняя пласть'))
    await userEvent.click(form.getByRole('button', { name: 'Цвет: Верхняя пласть' }))
    const hex = await screen.findByLabelText('HEX: Верхняя пласть')
    await userEvent.clear(hex)
    await userEvent.type(hex, '00aa00')
    await userEvent.click(form.getByRole('button', { name: 'Отмена' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    form = within(await openEditor(screen.getByRole('button', { name: 'Доска' })))
    await userEvent.click(form.getByLabelText('Нижняя пласть'))

    expect(form.getByRole('button', { name: 'Цвет: Нижняя пласть' })).toHaveTextContent('#00aa00')
  })

  it.each([422, 500])('keeps the form open with a message on HTTP %i', async (status) => {
    fakeApi([PROJECT])
    server.use(http.post('*/api/projects/1/boards', () => new HttpResponse(null, { status })))
    renderBoards()

    const dialog = await openEditor(await screen.findByRole('button', { name: 'Доска' }))
    const form = within(dialog)
    await userEvent.type(form.getByLabelText('Название'), 'Полка')
    await userEvent.type(form.getByLabelText('Длина'), '800')
    await userEvent.type(form.getByLabelText('Ширина'), '300')
    await userEvent.type(form.getByLabelText('Толщина'), '18')
    await userEvent.click(form.getByRole('button', { name: 'Сохранить' }))

    expect(await form.findByText('Не удалось сохранить')).toBeInTheDocument()
    expect(form.getByLabelText('Название')).toHaveValue('Полка')
  })
})
