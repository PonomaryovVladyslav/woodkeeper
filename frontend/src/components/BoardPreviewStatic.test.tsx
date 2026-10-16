import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BASE_COLOR, NO_FACES } from '../lib/faces'
import { renderWithProviders } from '../test/render'
import { BoardPreviewStatic } from './BoardPreviewStatic'

const dims = { length_mm: 1200, width_mm: 300, thickness_mm: 18 }

describe('BoardPreviewStatic', () => {
  it('draws top, front and right faces in their colors', () => {
    renderWithProviders(
      <BoardPreviewStatic dimensions={dims} faces={{ ...NO_FACES, front: '#aa0000' }} />,
    )

    const svg = screen.getByRole('img', { name: 'Превью доски 1200 × 300 × 18 мм' })
    const fills = Array.from(svg.querySelectorAll('g > polygon:first-of-type')).map((polygon) =>
      polygon.getAttribute('fill'),
    )
    expect(fills).toEqual([BASE_COLOR, '#aa0000', BASE_COLOR])
    expect(Array.from(svg.querySelectorAll('title')).map((t) => t.textContent)).toEqual([
      'Верхняя пласть',
      'Передняя кромка',
      'Правый торец',
    ])
  })

  it('renders even with invalid sizes', () => {
    renderWithProviders(
      <BoardPreviewStatic
        dimensions={{ length_mm: 0, width_mm: Number.NaN, thickness_mm: 18 }}
        faces={NO_FACES}
      />,
    )
    const viewBox = screen.getByRole('img').getAttribute('viewBox') ?? ''
    expect(viewBox.split(' ').map(Number).every(Number.isFinite)).toBe(true)
  })
})
