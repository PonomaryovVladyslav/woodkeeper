import { describe, expect, it } from 'vitest'

import { formatDimensions, formatQuantity } from './format'

describe('format', () => {
  it('formats dimensions as length × width × thickness', () => {
    expect(formatDimensions({ length_mm: 1200, width_mm: 300, thickness_mm: 18 })).toBe(
      '1200 × 300 × 18 мм',
    )
  })

  it('shows quantity only when greater than one', () => {
    expect(formatQuantity(4)).toBe('× 4')
    expect(formatQuantity(1)).toBeNull()
  })
})
