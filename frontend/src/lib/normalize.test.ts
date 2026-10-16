import { describe, expect, it } from 'vitest'

import { MIN_EDGE_RATIO, normalizeBoxSize, SCENE_SIZE } from './normalize'

const dims = (length_mm: number, width_mm: number, thickness_mm: number) => ({
  length_mm,
  width_mm,
  thickness_mm,
})

describe('normalizeBoxSize', () => {
  it('maps length → X, thickness → Y, width → Z and scales the longest side to the scene', () => {
    const [x, y, z] = normalizeBoxSize(dims(1200, 300, 150))
    expect(x).toBeCloseTo(SCENE_SIZE)
    expect(y).toBeCloseTo(SCENE_SIZE / 8)
    expect(z).toBeCloseTo(SCENE_SIZE / 4)
  })

  it('keeps proportions for ordinary boards', () => {
    const [x, , z] = normalizeBoxSize(dims(300, 300, 18))
    expect(x).toBeCloseTo(z)
  })

  it('scales whichever side is longest', () => {
    expect(normalizeBoxSize(dims(100, 400, 18))[2]).toBeCloseTo(SCENE_SIZE)
    expect(normalizeBoxSize(dims(18, 18, 18))).toEqual([SCENE_SIZE, SCENE_SIZE, SCENE_SIZE])
  })

  it('thickens very thin sides so the board is not a thread', () => {
    const [x, y, z] = normalizeBoxSize(dims(2000, 20, 18))
    const minEdge = SCENE_SIZE * MIN_EDGE_RATIO
    expect(x).toBeCloseTo(SCENE_SIZE)
    expect(y).toBeCloseTo(minEdge)
    expect(z).toBeCloseTo(minEdge)
  })

  it('survives invalid input while the user is typing', () => {
    const minEdge = SCENE_SIZE * MIN_EDGE_RATIO
    const [x, y, z] = normalizeBoxSize(dims(800, 0, Number.NaN))
    expect(x).toBeCloseTo(SCENE_SIZE)
    expect(y).toBeCloseTo(minEdge)
    expect(z).toBeCloseTo(minEdge)
    expect(normalizeBoxSize(dims(0, -5, Number.NaN))).toEqual([SCENE_SIZE, SCENE_SIZE, SCENE_SIZE])
  })

  it('accepts a custom scene size', () => {
    expect(normalizeBoxSize(dims(1000, 500, 100), 10)).toEqual([10, 1, 5])
  })
})
