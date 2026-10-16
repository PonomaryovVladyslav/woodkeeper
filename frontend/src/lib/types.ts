import type { components } from '../api/schema'

type Schemas = components['schemas']

export type User = Schemas['UserRead']
export type Project = Schemas['ProjectRead']
export type Board = Schemas['BoardRead']
/** Veneer color per side, "#rrggbb"; null = side is not veneered. */
export type Faces = Schemas['Faces-Output']
export type Side = keyof Faces
export type Dimensions = Pick<Board, 'length_mm' | 'width_mm' | 'thickness_mm'>

/** Editor form state; becomes the body of POST /boards or PATCH /boards/{id}. */
export type BoardDraft = Omit<Board, 'id' | 'project_id' | 'created_at' | 'updated_at'>
