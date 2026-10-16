import { http, HttpResponse } from 'msw'

import { NO_FACES } from '../lib/faces'
import type { Board, Project } from '../lib/types'
import { server } from './server'

type StoredProject = Project
type StoredBoard = Board

interface Logged {
  method: string
  path: string
  body: unknown
}

/**
 * In-memory stand-in for the projects and boards API, so UI tests can create,
 * edit and delete and then see the result after refetching. Call per test.
 *
 * Project counters are the seeded values plus the boards stored here.
 */
export function fakeApi(
  initialProjects: Partial<StoredProject>[] = [],
  initialBoards: (Partial<StoredBoard> & { project_id: number })[] = [],
) {
  let nextId = 1
  let clock = 0
  const projects: StoredProject[] = []
  const boards: StoredBoard[] = []
  const requests: Logged[] = []

  const timestamp = () => new Date(Date.UTC(2026, 0, 1, 0, clock++)).toISOString()
  const takeId = (id?: number) => {
    const value = id ?? nextId
    nextId = Math.max(nextId, value) + 1
    return value
  }

  const addProject = (fields: Partial<StoredProject>): StoredProject => {
    const id = takeId(fields.id)
    const project: StoredProject = {
      name: `Подпроект ${id}`,
      description: null,
      boards_count: 0,
      ordered_count: 0,
      created_at: timestamp(),
      ...fields,
      id,
    }
    projects.push(project)
    return project
  }

  const addBoard = (fields: Partial<StoredBoard> & { project_id: number }): StoredBoard => {
    const id = takeId(fields.id)
    const now = timestamp()
    const board: StoredBoard = {
      name: `Доска ${id}`,
      length_mm: 800,
      width_mm: 300,
      thickness_mm: 18,
      quantity: 1,
      is_ordered: false,
      notes: null,
      created_at: now,
      updated_at: now,
      ...fields,
      faces: { ...NO_FACES, ...fields.faces },
      id,
    }
    boards.push(board)
    return board
  }

  initialProjects.forEach(addProject)
  initialBoards.forEach(addBoard)

  const withCounts = (project: StoredProject): Project => {
    const own = boards.filter((board) => board.project_id === project.id)
    return {
      ...project,
      boards_count: project.boards_count + own.length,
      ordered_count: project.ordered_count + own.filter((board) => board.is_ordered).length,
    }
  }
  const findProject = (id: unknown) => projects.find((project) => project.id === Number(id))
  const findBoard = (id: unknown) => boards.find((board) => board.id === Number(id))
  const notFound = () => HttpResponse.json({ detail: 'Not found' }, { status: 404 })
  const log = async (request: Request) => {
    const text = await request.clone().text()
    requests.push({
      method: request.method,
      path: new URL(request.url).pathname,
      body: text ? JSON.parse(text) : null,
    })
  }

  server.use(
    http.get('*/api/projects', () => HttpResponse.json(projects.map(withCounts))),
    http.post('*/api/projects', async ({ request }) => {
      await log(request)
      const body = (await request.json()) as Pick<StoredProject, 'name' | 'description'>
      return HttpResponse.json(withCounts(addProject(body)), { status: 201 })
    }),
    http.patch('*/api/projects/:id', async ({ request, params }) => {
      await log(request)
      const project = findProject(params.id)
      if (!project) return notFound()
      Object.assign(project, await request.json())
      return HttpResponse.json(withCounts(project))
    }),
    http.delete('*/api/projects/:id', async ({ request, params }) => {
      await log(request)
      const project = findProject(params.id)
      if (!project) return notFound()
      projects.splice(projects.indexOf(project), 1)
      return new HttpResponse(null, { status: 204 })
    }),

    http.get('*/api/projects/:id/boards', ({ params }) => {
      if (!findProject(params.id)) return notFound()
      const own = boards
        .filter((board) => board.project_id === Number(params.id))
        .sort(
          (a, b) =>
            Number(a.is_ordered) - Number(b.is_ordered) || a.created_at.localeCompare(b.created_at),
        )
      return HttpResponse.json(own)
    }),
    http.post('*/api/projects/:id/boards', async ({ request, params }) => {
      await log(request)
      if (!findProject(params.id)) return notFound()
      const body = (await request.json()) as Omit<StoredBoard, 'id' | 'project_id'>
      return HttpResponse.json(addBoard({ ...body, project_id: Number(params.id) }), {
        status: 201,
      })
    }),
    http.patch('*/api/boards/:id', async ({ request, params }) => {
      await log(request)
      const board = findBoard(params.id)
      if (!board) return notFound()
      const changes = (await request.json()) as Partial<StoredBoard>
      Object.assign(board, changes, { updated_at: timestamp() })
      if (changes.faces) board.faces = { ...NO_FACES, ...changes.faces }
      return HttpResponse.json(board)
    }),
    http.delete('*/api/boards/:id', async ({ request, params }) => {
      await log(request)
      const board = findBoard(params.id)
      if (!board) return notFound()
      boards.splice(boards.indexOf(board), 1)
      return new HttpResponse(null, { status: 204 })
    }),
  )

  return { projects, boards, requests }
}
