// Mirrors backend schemas (app/schemas.py) until the generated API types arrive in stage 7.

export type Side = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right'

/** Veneer color per side, "#rrggbb"; null = side is not veneered. */
export type Faces = Record<Side, string | null>

export interface Dimensions {
  length_mm: number
  width_mm: number
  thickness_mm: number
}

export interface Board extends Dimensions {
  id: number
  project_id: number
  name: string
  quantity: number
  is_ordered: boolean
  notes: string | null
  faces: Faces
  created_at: string
  updated_at: string
}

/** Editor form state; becomes the body of POST /boards or PATCH /boards/{id}. */
export type BoardDraft = Omit<Board, 'id' | 'project_id' | 'created_at' | 'updated_at'>
