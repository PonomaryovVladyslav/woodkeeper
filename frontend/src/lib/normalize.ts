import type { Dimensions } from './types'

/** Scene-space box size: [x, y, z] = [length, thickness, width]. */
export type BoxSize = [number, number, number]

export const SCENE_SIZE = 3
/** Thin edges are drawn at least this fraction of SCENE_SIZE, so 2000×20×18 is not a thread. */
export const MIN_EDGE_RATIO = 0.03

/**
 * Scales the board so its longest side equals `sceneSize`, keeping proportions,
 * except that sides thinner than `minRatio * sceneSize` are thickened to stay visible.
 * Real sizes are shown as labels, so this small distortion is fine.
 * Invalid sides (0, negative, NaN) are drawn at the minimum; all invalid → a cube.
 */
export function normalizeBoxSize(
  { length_mm, width_mm, thickness_mm }: Dimensions,
  sceneSize = SCENE_SIZE,
  minRatio = MIN_EDGE_RATIO,
): BoxSize {
  // The editor previews while the user types, so 0, negative or NaN must not break the scene.
  const valid = (mm: number) => (Number.isFinite(mm) && mm > 0 ? mm : 0)
  const [x, y, z] = [valid(length_mm), valid(thickness_mm), valid(width_mm)]
  const longest = Math.max(x, y, z)
  if (longest === 0) {
    return [sceneSize, sceneSize, sceneSize]
  }
  const minEdge = sceneSize * minRatio
  const scale = (mm: number) => Math.max((mm / longest) * sceneSize, minEdge)
  return [scale(x), scale(y), scale(z)]
}
