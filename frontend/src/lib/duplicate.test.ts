import { describe, expect, it } from 'vitest'

import { COPY_SUFFIX, duplicateDraft } from './duplicate'
import { NO_FACES } from './faces'
import { NAME_MAX_LENGTH } from './limits'
import type { Board } from './types'

const board: Board = {
  id: 7,
  project_id: 3,
  name: 'Полка',
  length_mm: 800,
  width_mm: 300,
  thickness_mm: 18,
  quantity: 4,
  is_ordered: true,
  notes: 'Отверстия',
  faces: { ...NO_FACES, top: '#aa0000', front: '#00aa00' },
  created_at: '2026-10-16T00:00:00Z',
  updated_at: '2026-10-16T00:00:00Z',
}

describe('duplicateDraft', () => {
  it('copies the board as a new, not ordered draft', () => {
    expect(duplicateDraft(board)).toEqual({
      name: 'Полка (копия)',
      length_mm: 800,
      width_mm: 300,
      thickness_mm: 18,
      quantity: 4,
      is_ordered: false,
      notes: 'Отверстия',
      faces: board.faces,
    })
  })

  it('has no identity or timestamps', () => {
    const draft = duplicateDraft(board)
    for (const key of ['id', 'project_id', 'created_at', 'updated_at']) {
      expect(draft).not.toHaveProperty(key)
    }
  })

  it('copies faces instead of sharing the object', () => {
    const draft = duplicateDraft(board)
    draft.faces.top = null
    expect(board.faces.top).toBe('#aa0000')
  })

  it('keeps the name within the API limit', () => {
    const name = duplicateDraft({ ...board, name: 'x'.repeat(NAME_MAX_LENGTH) }).name
    expect(name).toHaveLength(NAME_MAX_LENGTH)
    expect(name.endsWith(COPY_SUFFIX)).toBe(true)
  })
})
