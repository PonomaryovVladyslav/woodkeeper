import { addBoard, boardCard, createProject, expect, setFaceColor, test } from './fixtures'

test('main path: project, board with veneer and notes, survives reload', async ({ app }) => {
  await createProject(app, 'Шкаф')
  await addBoard(app, {
    name: 'Полка',
    length: 1200,
    width: 300,
    thickness: 18,
    quantity: 4,
    notes: 'Отверстия под полкодержатели',
    faces: { 'Передняя кромка': '#aa0000', 'Верхняя пласть': '#00aa00' },
  })

  const check = async () => {
    const card = boardCard(app, 'Полка')
    await expect(card).toBeVisible()
    await expect(card.getByText('1200 × 300 × 18 мм')).toBeVisible()
    await expect(card.getByText('× 4', { exact: true })).toBeVisible()
    await expect(card.getByText('Отверстия под полкодержатели')).toBeVisible()
    await expect(card.getByLabel('Передняя кромка: #aa0000')).toBeVisible()
    await expect(card.getByLabel('Верхняя пласть: #00aa00')).toBeVisible()
    await expect(app.getByRole('tab', { name: /Шкаф/ })).toContainText('0/1')
  }

  await check()
  await app.reload()
  await check()
})

test('edit: dimensions and veneer color change in the card', async ({ app }) => {
  await createProject(app, 'Комод')
  await addBoard(app, {
    name: 'Фасад',
    length: 600,
    width: 400,
    thickness: 18,
    faces: { 'Передняя кромка': '#ffffff' },
  })

  await boardCard(app, 'Фасад').getByRole('button', { name: 'Изменить' }).click()
  const dialog = app.getByRole('dialog')
  await expect(dialog.getByLabel('Длина')).toHaveValue('600 мм')
  await dialog.getByLabel('Длина').fill('650')
  await setFaceColor(app, 'Передняя кромка', '#123456')
  await dialog.getByRole('button', { name: 'Сохранить' }).click()
  await expect(dialog).toBeHidden()

  const card = boardCard(app, 'Фасад')
  await expect(card.getByText('650 × 400 × 18 мм')).toBeVisible()
  await expect(card.getByLabel('Передняя кромка: #123456')).toBeVisible()
})

test('duplicate: copy with another length', async ({ app }) => {
  await createProject(app, 'Стеллаж')
  await addBoard(app, { name: 'Полка', length: 800, width: 300, thickness: 18, quantity: 3 })

  await boardCard(app, 'Полка').getByRole('button', { name: 'Дублировать' }).click()
  const dialog = app.getByRole('dialog')
  await expect(dialog.getByLabel('Название')).toHaveValue('Полка (копия)')
  await dialog.getByLabel('Длина').fill('600')
  await dialog.getByRole('button', { name: 'Сохранить' }).click()
  await expect(dialog).toBeHidden()

  await expect(app.locator('.mantine-Card-root')).toHaveCount(2)
  await expect(boardCard(app, 'Полка').getByText('800 × 300 × 18 мм')).toBeVisible()
  const copy = boardCard(app, 'Полка (копия)')
  await expect(copy.getByText('600 × 300 × 18 мм')).toBeVisible()
  await expect(copy.getByText('× 3', { exact: true })).toBeVisible()
})

test('order: ordered board moves down and is hidden by the "not ordered" filter', async ({
  app,
}) => {
  await createProject(app, 'Кухня')
  await addBoard(app, { name: 'Первая', length: 500, width: 300, thickness: 18 })
  await addBoard(app, { name: 'Вторая', length: 500, width: 300, thickness: 18 })
  const titles = app.locator('.mantine-Card-root').getByRole('heading')
  await expect(titles).toHaveText(['Первая', 'Вторая'])

  // The checkbox reflects server state, so it flips only after the PATCH round trip.
  await boardCard(app, 'Первая').getByLabel('Заказана').click()
  await expect(boardCard(app, 'Первая').getByLabel('Заказана')).toBeChecked()

  await expect(titles).toHaveText(['Вторая', 'Первая'])
  await expect(app.getByRole('tab', { name: /Кухня/ })).toContainText('1/2')

  await app.getByText('Не заказаны (1)').click()
  await expect(titles).toHaveText(['Вторая'])
})

test('delete: board and project, both after confirmation', async ({ app }) => {
  await createProject(app, 'Временный')
  await addBoard(app, { name: 'Лишняя', length: 100, width: 100, thickness: 16 })

  await boardCard(app, 'Лишняя').getByRole('button', { name: 'Удалить' }).click()
  await app.getByRole('dialog').getByRole('button', { name: 'Отмена' }).click()
  await expect(boardCard(app, 'Лишняя')).toBeVisible()

  await boardCard(app, 'Лишняя').getByRole('button', { name: 'Удалить' }).click()
  await app.getByRole('dialog').getByRole('button', { name: 'Удалить' }).click()
  await expect(app.getByText(/Пока нет досок/)).toBeVisible()

  await app.getByRole('button', { name: 'Действия с подпроектом' }).click()
  await app.getByRole('menuitem', { name: 'Удалить' }).click()
  await app.getByRole('dialog').getByRole('button', { name: 'Удалить' }).click()
  await expect(app.getByRole('tab')).toHaveCount(0)
  await expect(app.getByText(/Создайте первый подпроект/)).toBeVisible()
})
