import { boardCard, expect, expectNoHorizontalScroll, seedProject, test } from './fixtures'

// Shopping with a phone: check what is still to order, mark it, adjust a board on the spot.

test('long project and board names fit the phone screen', async ({ app }) => {
  await seedProject(app, 'Очень длинное название подпроекта для шкафа-купе в спальне', [
    { name: 'Боковина_левая_с_пазом_под_заднюю_стенку_ХДФ_и_отверстиями_под_эксцентрики_Rafix' },
  ])
  await expectNoHorizontalScroll(app)
})

test('in the shop: filter what is left and mark a board as ordered', async ({ app }) => {
  await seedProject(app, 'Шкаф в прихожей', [
    { name: 'Боковина длинная с очень длинным названием для узкого экрана', quantity: 2 },
    { name: 'Полка', quantity: 4 },
    { name: 'Крышка', is_ordered: true },
  ])
  await expectNoHorizontalScroll(app)
  // A long project name must not squeeze the ordered/total badge to nothing.
  const badge = app.getByRole('tab', { name: /Шкаф в прихожей/ }).locator('.mantine-Badge-label')
  expect(await badge.evaluate((e) => e.getBoundingClientRect().width)).toBeGreaterThan(8)

  await app.getByText('Не заказаны (2)').tap()
  const titles = app.locator('.mantine-Card-root').getByRole('heading')
  await expect(titles).toHaveCount(2)
  await expectNoHorizontalScroll(app)

  await boardCard(app, 'Полка').getByLabel('Заказана').tap()

  await expect(titles).toHaveCount(1)
  await expect(app.getByText('Не заказаны (1)')).toBeVisible()
  await expect(app.getByRole('tab', { name: /Шкаф в прихожей/ })).toContainText('2/3')
})

test('in the shop: edit a board full screen and pick a veneer color by touch', async ({ app }) => {
  await seedProject(app, 'Комод', [{ name: 'Фасад', length_mm: 600, width_mm: 400 }])

  await boardCard(app, 'Фасад').getByRole('button', { name: 'Изменить' }).tap()
  const dialog = app.getByRole('dialog')
  await expect(dialog).toBeVisible()

  // Full screen on a phone.
  const viewport = app.viewportSize()
  const box = await dialog.boundingBox()
  expect(box?.width).toBeCloseTo(viewport?.width ?? 0, -1)
  await expectNoHorizontalScroll(app)

  // iOS zooms the page when a focused field has text smaller than 16px.
  const fontSizes = await dialog
    .locator('input:not([type=checkbox]), textarea')
    .evaluateAll((elements) => elements.map((e) => parseFloat(getComputedStyle(e).fontSize)))
  expect(Math.min(...fontSizes)).toBeGreaterThanOrEqual(16)

  await dialog.getByLabel('Длина').fill('650')
  await dialog.getByRole('checkbox', { name: 'Передняя кромка' }).tap()
  const swatch = dialog.getByRole('button', { name: 'Цвет: Передняя кромка' })
  await swatch.tap()
  const hex = app.getByLabel('HEX: Передняя кромка')
  expect(await hex.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16)
  await hex.fill('aa0000')
  // No Escape key on a phone: tapping the swatch again closes the picker.
  await swatch.tap()
  await expect(hex).toBeHidden()

  await dialog.getByRole('button', { name: 'Сохранить' }).tap()
  await expect(dialog).toBeHidden()

  const card = boardCard(app, 'Фасад')
  await expect(card.getByText('650 × 400 × 18 мм')).toBeVisible()
  await expect(card.getByLabel('Передняя кромка: #aa0000')).toBeVisible()
})

test('in the shop: tapping a face on the 3D model veneers that side', async ({ app }) => {
  await seedProject(app, 'Стол', [{ name: 'Столешница', length_mm: 600, width_mm: 600, thickness_mm: 100 }])

  await boardCard(app, 'Столешница').getByRole('button', { name: 'Изменить' }).tap()
  const dialog = app.getByRole('dialog')
  const canvas = dialog.locator('canvas')
  await canvas.scrollIntoViewIfNeeded()
  await expect(canvas).toBeVisible()
  const top = dialog.getByRole('checkbox', { name: 'Верхняя пласть' })

  // The canvas is resized after mount: measure inside the retry loop.
  await expect(async () => {
    const box = await canvas.boundingBox()
    if (!box) throw new Error('canvas has no box')
    await app.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    await expect(top).toBeChecked({ timeout: 500 })
  }).toPass({ timeout: 10_000 })
})
