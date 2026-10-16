import { describe, expect, it } from 'vitest'

import { isometricBox, project } from './isometric'

describe('project', () => {
  it('maps the origin to the origin', () => {
    expect(project(0, 0, 0)).toEqual([0, 0])
  })

  it('draws Y straight up and X/Z as mirrored diagonals', () => {
    expect(project(0, 1, 0)).toEqual([0, -1])
    const [xx, xy] = project(1, 0, 0)
    const [zx, zy] = project(0, 0, 1)
    expect(xx).toBeCloseTo(-zx)
    expect(xy).toBeCloseTo(zy)
    expect(xx).toBeGreaterThan(0)
    expect(xy).toBeGreaterThan(0)
  })
})

describe('isometricBox', () => {
  it('returns the three visible faces in drawing order', () => {
    const box = isometricBox([3, 0.2, 1])
    expect(box.faces.map((face) => face.side)).toEqual(['top', 'front', 'right'])
    expect(box.faces.every((face) => face.points.length === 4)).toBe(true)
  })

  it('fits every point inside the view box', () => {
    const { faces, viewBox } = isometricBox([3, 0.5, 1])
    const [minX, minY, width, height] = viewBox
    for (const [x, y] of faces.flatMap((face) => face.points)) {
      expect(x).toBeGreaterThanOrEqual(minX)
      expect(x).toBeLessThanOrEqual(minX + width)
      expect(y).toBeGreaterThanOrEqual(minY)
      expect(y).toBeLessThanOrEqual(minY + height)
    }
  })

  it('shades side faces darker than the top', () => {
    const [top, front, right] = isometricBox([1, 1, 1]).faces
    expect(top?.shade).toBe(0)
    expect(front?.shade).toBeGreaterThan(0)
    expect(right?.shade).toBeGreaterThan(front?.shade ?? 0)
  })
})
