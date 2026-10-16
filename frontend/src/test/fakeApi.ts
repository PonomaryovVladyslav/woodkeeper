import { http, HttpResponse } from 'msw'

import type { Project } from '../lib/types'
import { server } from './server'

interface StoredProject {
  id: number
  name: string
  description: string | null
  boards_count: number
  ordered_count: number
  created_at: string
}

/**
 * In-memory stand-in for the projects API, so UI tests can create, edit and
 * delete and then see the result after refetching. Call `fakeApi()` per test.
 */
export function fakeApi(initial: Partial<StoredProject>[] = []) {
  let nextId = 1
  const projects: StoredProject[] = []
  const requests: { method: string; path: string; body: unknown }[] = []

  const add = (fields: Partial<StoredProject>): StoredProject => {
    const project: StoredProject = {
      id: nextId,
      name: `Подпроект ${nextId}`,
      description: null,
      boards_count: 0,
      ordered_count: 0,
      created_at: new Date(2026, 0, nextId).toISOString(),
      ...fields,
    }
    nextId = Math.max(nextId, project.id) + 1
    projects.push(project)
    return project
  }
  initial.forEach(add)

  const find = (id: string | readonly string[] | undefined) =>
    projects.find((project) => project.id === Number(id))
  const notFound = () => HttpResponse.json({ detail: 'Project not found' }, { status: 404 })
  const log = async (request: Request, path: string) => {
    const text = request.method === 'GET' ? '' : await request.clone().text()
    requests.push({ method: request.method, path, body: text ? JSON.parse(text) : null })
  }

  server.use(
    http.get('*/api/projects', () => HttpResponse.json(projects satisfies Project[])),
    http.post('*/api/projects', async ({ request }) => {
      await log(request, '/api/projects')
      const body = (await request.json()) as Pick<StoredProject, 'name' | 'description'>
      return HttpResponse.json(add(body), { status: 201 })
    }),
    http.patch('*/api/projects/:id', async ({ request, params }) => {
      await log(request, `/api/projects/${String(params.id)}`)
      const project = find(params.id)
      if (!project) return notFound()
      Object.assign(project, await request.json())
      return HttpResponse.json(project)
    }),
    http.delete('*/api/projects/:id', async ({ request, params }) => {
      await log(request, `/api/projects/${String(params.id)}`)
      const project = find(params.id)
      if (!project) return notFound()
      projects.splice(projects.indexOf(project), 1)
      return new HttpResponse(null, { status: 204 })
    }),
  )

  return { projects, requests }
}
