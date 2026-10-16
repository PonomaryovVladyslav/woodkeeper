import { createProject, expect, test } from './fixtures'

test('3D smoke: the editor draws a WebGL canvas without console errors', async ({
  app,
  consoleErrors,
}) => {
  await createProject(app, 'Шкаф')
  await app.getByRole('button', { name: 'Доска', exact: true }).click()
  const dialog = app.getByRole('dialog')
  await dialog.getByLabel('Длина').fill('1200')
  await dialog.getByLabel('Ширина').fill('300')
  await dialog.getByLabel('Толщина').fill('18')

  const canvas = dialog.locator('canvas')
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  expect(box?.width).toBeGreaterThan(100)
  expect(box?.height).toBeGreaterThan(100)
  await expect(dialog.getByText('1200 мм')).toBeVisible()
  await expect(dialog.getByText('300 мм')).toBeVisible()
  await expect(dialog.getByText('18 мм')).toBeVisible()

  const hasWebGL = await canvas.evaluate((element) => {
    const gl = (element as HTMLCanvasElement).getContext('webgl2')
    return gl !== null
  })
  expect(hasWebGL).toBe(true)
  expect(consoleErrors).toEqual([])
})

test('3D: clicking the top face veneers the top side', async ({ app }) => {
  await createProject(app, 'Шкаф')
  await app.getByRole('button', { name: 'Доска', exact: true }).click()
  const dialog = app.getByRole('dialog')
  // A wide flat board: the ray through the canvas centre enters it through the top face.
  await dialog.getByLabel('Длина').fill('600')
  await dialog.getByLabel('Ширина').fill('600')
  await dialog.getByLabel('Толщина').fill('100')

  const canvas = dialog.locator('canvas')
  await expect(canvas).toBeVisible()

  // The canvas starts at the default 300×150 and is resized by the renderer, so the
  // centre is measured inside the retry loop, together with the hover check.
  let centre = { x: 0, y: 0 }
  await expect(async () => {
    const box = await canvas.boundingBox()
    if (!box) throw new Error('canvas has no box')
    centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await app.mouse.move(centre.x - 20, centre.y - 10)
    await app.mouse.move(centre.x, centre.y, { steps: 4 })
    await expect(dialog.getByText('Верхняя пласть: клик включит облицовку')).toBeVisible({
      timeout: 500,
    })
  }).toPass({ timeout: 10_000 })
  await app.mouse.click(centre.x, centre.y)
  await expect(dialog.getByRole('checkbox', { name: 'Верхняя пласть' })).toBeChecked()

  // Dragging rotates the model and must not toggle the face back.
  await app.mouse.move(centre.x, centre.y)
  await app.mouse.down()
  await app.mouse.move(centre.x + 60, centre.y + 20, { steps: 5 })
  await app.mouse.up()
  await expect(dialog.getByRole('checkbox', { name: 'Верхняя пласть' })).toBeChecked()
})

test('logout: / redirects to /login afterwards', async ({ app }) => {
  await app.getByRole('button', { name: 'Выйти' }).click()
  await expect(app).toHaveURL(/\/login$/)

  await app.goto('/')
  await expect(app).toHaveURL(/\/login$/)
  await expect(app.getByRole('heading', { name: 'Woodkeeper' })).toBeVisible()
})
