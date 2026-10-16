import type { Faces, Side } from './types'

export const DEFAULT_VENEER_COLOR = '#ffffff'

/** State shared by the faces form and clicks on the 3D model. */
export interface VeneerState {
  faces: Faces
  /** Last color the user picked; offered when another side gets veneered. */
  lastColor: string | null
}

export function toggleSide(state: VeneerState, side: Side): VeneerState {
  const enabled = state.faces[side] !== null
  const color = enabled ? null : (state.lastColor ?? DEFAULT_VENEER_COLOR)
  return { ...state, faces: { ...state.faces, [side]: color } }
}

export function setSideColor(state: VeneerState, side: Side, color: string): VeneerState {
  const normalized = color.toLowerCase()
  return { faces: { ...state.faces, [side]: normalized }, lastColor: normalized }
}
