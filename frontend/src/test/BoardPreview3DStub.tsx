import type { BoardPreview3DProps } from '../components/BoardPreview3D'
import { SIDE_LABELS, SIDES } from '../lib/faces'

export function BoardPreview3DStub({ onToggleSide, onHoverSide }: BoardPreview3DProps) {
  return (
    <div data-testid="board-preview-3d">
      {SIDES.map((side) => (
        <button
          key={side}
          type="button"
          onClick={() => onToggleSide(side)}
          onMouseEnter={() => onHoverSide(side)}
          onMouseLeave={() => onHoverSide(null)}
        >
          {`3D: ${SIDE_LABELS[side]}`}
        </button>
      ))}
    </div>
  )
}
