import type { Dimensions } from './types'

/** "1200 × 300 × 18 мм" — length × width × thickness. */
export function formatDimensions({ length_mm, width_mm, thickness_mm }: Dimensions): string {
  return `${length_mm} × ${width_mm} × ${thickness_mm} мм`
}

/** "× 4"; null for a single board, which needs no badge. */
export function formatQuantity(quantity: number): string | null {
  return quantity > 1 ? `× ${quantity}` : null
}
