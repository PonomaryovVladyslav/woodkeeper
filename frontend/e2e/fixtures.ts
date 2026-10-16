import { expect, test as base, type Page } from '@playwright/test'

export { expect }

interface Fixtures {
  /** Page signed in as a fresh user (own data), with console errors collected. */
  app: Page
  consoleErrors: string[]
}

export const test = base.extend<Fixtures>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))
    await use(errors)
  },

  app: async ({ page }, use, testInfo) => {
    // Google's script is not needed with test-login; keep tests off the network.
    await page.route('https://accounts.google.com/**', (route) => route.abort())

    const sub = `e2e-${testInfo.workerIndex}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const response = await page.request.post('/api/auth/test-login', {
      data: { sub, email: `${sub}@example.com`, name: 'E2E' },
    })
    expect(response.ok()).toBe(true)

    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible()
    await use(page)
  },
})

export async function createProject(page: Page, name: string) {
  await page.getByRole('button', { name: 'Подпроект' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Название').fill(name)
  await dialog.getByRole('button', { name: 'Создать' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('tab', { name: new RegExp(name) })).toHaveAttribute(
    'aria-selected',
    'true',
  )
}

export interface BoardInput {
  name: string
  length: number
  width: number
  thickness: number
  quantity?: number
  notes?: string
  faces?: Partial<Record<string, string>>
}

export async function fillBoard(page: Page, input: BoardInput) {
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Название').fill(input.name)
  await dialog.getByLabel('Длина').fill(String(input.length))
  await dialog.getByLabel('Ширина').fill(String(input.width))
  await dialog.getByLabel('Толщина').fill(String(input.thickness))
  if (input.quantity !== undefined) {
    await dialog.getByLabel('Количество').fill(String(input.quantity))
  }
  if (input.notes !== undefined) {
    await dialog.getByLabel('Заметки').fill(input.notes)
  }
  for (const [side, color] of Object.entries(input.faces ?? {})) {
    await setFaceColor(page, side, color ?? '#ffffff')
  }
}

/** Enables the side if needed and types the color into its HEX field. */
export async function setFaceColor(page: Page, sideLabel: string, color: string) {
  const dialog = page.getByRole('dialog')
  const checkbox = dialog.getByRole('checkbox', { name: sideLabel })
  if (!(await checkbox.isChecked())) await checkbox.check()
  await dialog.getByRole('button', { name: `Цвет: ${sideLabel}` }).click()
  const hex = page.getByLabel(`HEX: ${sideLabel}`)
  await hex.fill(color.replace('#', ''))
  // Escape closes only the picker; the editor must stay open.
  await hex.press('Escape')
  await expect(hex).toBeHidden()
  await expect(dialog).toBeVisible()
}

export async function addBoard(page: Page, input: BoardInput) {
  await page.getByRole('button', { name: 'Доска', exact: true }).click()
  await fillBoard(page, input)
  await page.getByRole('dialog').getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
}

export function boardCard(page: Page, name: string) {
  return page.locator('.mantine-Card-root').filter({
    has: page.getByRole('heading', { name, exact: true }),
  })
}

export interface SeedBoard {
  name: string
  length_mm?: number
  width_mm?: number
  thickness_mm?: number
  quantity?: number
  is_ordered?: boolean
}

/** Creates a project with boards through the API, as if prepared at home on the laptop. */
export async function seedProject(page: Page, name: string, boards: SeedBoard[]) {
  const project = await page.request.post('/api/projects', { data: { name } })
  expect(project.ok()).toBe(true)
  const { id } = (await project.json()) as { id: number }
  for (const board of boards) {
    const response = await page.request.post(`/api/projects/${id}/boards`, {
      data: { length_mm: 800, width_mm: 300, thickness_mm: 18, ...board },
    })
    expect(response.ok()).toBe(true)
  }
  await page.reload()
  await expect(page.getByRole('tab', { name: new RegExp(name) })).toBeVisible()
  return id
}

/** Fails if the page can be scrolled sideways (something overflows the phone screen). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}
