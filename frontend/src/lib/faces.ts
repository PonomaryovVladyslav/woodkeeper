import type { Faces, Side } from './types'

/** API / form order. */
export const SIDES: readonly Side[] = ['top', 'bottom', 'front', 'back', 'left', 'right']

export const SIDE_LABELS: Record<Side, string> = {
  top: 'Верхняя пласть',
  bottom: 'Нижняя пласть',
  front: 'Передняя кромка',
  back: 'Задняя кромка',
  left: 'Левый торец',
  right: 'Правый торец',
}

/**
 * three.js BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z.
 * Board axes: length → X, thickness → Y, width → Z (see docs/data-model.md).
 */
export const BOX_MATERIAL_ORDER: readonly Side[] = ['right', 'left', 'top', 'bottom', 'front', 'back']

export function sideFromMaterialIndex(index: number): Side {
  const side = BOX_MATERIAL_ORDER[index]
  if (side === undefined) {
    throw new RangeError(`BoxGeometry has 6 materials, got index ${index}`)
  }
  return side
}

export function materialIndexOfSide(side: Side): number {
  return BOX_MATERIAL_ORDER.indexOf(side)
}

export const NO_FACES: Faces = {
  top: null,
  bottom: null,
  front: null,
  back: null,
  left: null,
  right: null,
}

export function veneeredSides(faces: Faces): Side[] {
  return SIDES.filter((side) => faces[side] !== null)
}
