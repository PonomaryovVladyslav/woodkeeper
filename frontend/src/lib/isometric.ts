import type { BoxSize } from './normalize'
import type { Side } from './types'

export type Point = [number, number]

export interface IsometricFace {
  side: Side
  points: Point[]
  /** Darkening overlay opacity, so the three faces read as a solid box. */
  shade: number
}

export interface IsometricBox {
  faces: IsometricFace[]
  /** [minX, minY, width, height] for the SVG viewBox. */
  viewBox: [number, number, number, number]
}

const COS30 = Math.cos(Math.PI / 6)
const SIN30 = Math.sin(Math.PI / 6)

/** Isometric projection with Y up: +X goes right-down, +Z goes left-down. */
export function project(x: number, y: number, z: number): Point {
  return [(x - z) * COS30, (x + z) * SIN30 - y]
}

/** The three faces visible from the default viewpoint: top (+Y), front (+Z), right (+X). */
export function isometricBox([x, y, z]: BoxSize, padding = 0.05): IsometricBox {
  const faces: IsometricFace[] = [
    {
      side: 'top',
      shade: 0,
      points: [project(0, y, 0), project(x, y, 0), project(x, y, z), project(0, y, z)],
    },
    {
      side: 'front',
      shade: 0.15,
      points: [project(0, 0, z), project(x, 0, z), project(x, y, z), project(0, y, z)],
    },
    {
      side: 'right',
      shade: 0.3,
      points: [project(x, 0, 0), project(x, 0, z), project(x, y, z), project(x, y, 0)],
    },
  ]

  const all = faces.flatMap((face) => face.points)
  const xs = all.map(([px]) => px)
  const ys = all.map(([, py]) => py)
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const pad = padding * Math.max(maxX - minX, maxY - minY)
  return {
    faces,
    viewBox: [minX - pad, minY - pad, maxX - minX + 2 * pad, maxY - minY + 2 * pad],
  }
}
