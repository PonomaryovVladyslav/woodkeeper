import { faceColor, SIDE_LABELS } from '../lib/faces'
import { formatDimensions } from '../lib/format'
import { isometricBox } from '../lib/isometric'
import { normalizeBoxSize } from '../lib/normalize'
import type { Dimensions, Faces } from '../lib/types'

interface Props {
  dimensions: Dimensions
  faces: Faces
  height?: number
}

/** Lightweight isometric SVG for board cards: no WebGL, cheap to render dozens of times. */
export function BoardPreviewStatic({ dimensions, faces, height = 64 }: Props) {
  const { faces: visible, viewBox } = isometricBox(normalizeBoxSize(dimensions))

  return (
    <svg
      role="img"
      aria-label={`Превью доски ${formatDimensions(dimensions)}`}
      viewBox={viewBox.join(' ')}
      height={height}
      style={{ display: 'block', maxWidth: '100%' }}
    >
      {visible.map(({ side, points, shade }) => {
        const d = points.map(([x, y]) => `${x},${y}`).join(' ')
        return (
          <g key={side}>
            <title>{SIDE_LABELS[side]}</title>
            <polygon
              points={d}
              fill={faceColor(faces, side)}
              stroke="#555"
              strokeWidth={0.015}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {shade > 0 && <polygon points={d} fill="#000" opacity={shade} />}
          </g>
        )
      })}
    </svg>
  )
}
