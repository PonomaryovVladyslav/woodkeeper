import { describe, expect, it } from 'vitest'

import {
  BASE_COLOR,
  BOX_MATERIAL_ORDER,
  faceColor,
  materialIndexOfSide,
  NO_FACES,
  SIDE_LABELS,
  SIDES,
  sideFromMaterialIndex,
  veneeredSides,
} from './faces'

describe('faces', () => {
  it('lists the six sides in API order', () => {
    expect(SIDES).toEqual(['top', 'bottom', 'front', 'back', 'left', 'right'])
  })

  it('follows BoxGeometry material order +X, -X, +Y, -Y, +Z, -Z', () => {
    expect(BOX_MATERIAL_ORDER).toEqual(['right', 'left', 'top', 'bottom', 'front', 'back'])
  })

  it('maps material index to side and back for every side', () => {
    for (const side of SIDES) {
      expect(sideFromMaterialIndex(materialIndexOfSide(side))).toBe(side)
    }
    expect(sideFromMaterialIndex(0)).toBe('right')
    expect(sideFromMaterialIndex(2)).toBe('top')
    expect(materialIndexOfSide('back')).toBe(5)
  })

  it('rejects material indices outside the box', () => {
    expect(() => sideFromMaterialIndex(6)).toThrow(RangeError)
    expect(() => sideFromMaterialIndex(-1)).toThrow(RangeError)
  })

  it('has a label for every side', () => {
    expect(Object.keys(SIDE_LABELS).sort()).toEqual([...SIDES].sort())
    expect(SIDE_LABELS.front).toBe('Передняя кромка')
  })

  it('lists veneered sides', () => {
    expect(veneeredSides(NO_FACES)).toEqual([])
    expect(veneeredSides({ ...NO_FACES, left: '#000000', top: '#ffffff' })).toEqual(['top', 'left'])
  })
})

describe('faceColor', () => {
  it('uses the veneer color or the base color', () => {
    expect(faceColor({ ...NO_FACES, top: '#aa0000' }, 'top')).toBe('#aa0000')
    expect(faceColor(NO_FACES, 'left')).toBe(BASE_COLOR)
  })
})
