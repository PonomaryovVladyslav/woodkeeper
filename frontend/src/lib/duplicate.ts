import { NAME_MAX_LENGTH } from './limits'
import type { Board, BoardDraft } from './types'

export const COPY_SUFFIX = ' (копия)'

/** Editor prefill for "Дублировать": same board, not ordered, saved as a new one via POST. */
export function duplicateDraft(board: Board): BoardDraft {
  const base = board.name.slice(0, NAME_MAX_LENGTH - COPY_SUFFIX.length)
  return {
    name: base + COPY_SUFFIX,
    length_mm: board.length_mm,
    width_mm: board.width_mm,
    thickness_mm: board.thickness_mm,
    quantity: board.quantity,
    is_ordered: false,
    notes: board.notes,
    faces: { ...board.faces },
  }
}
