import { Edges, Html, OrbitControls } from '@react-three/drei'
import { Canvas, type ThreeEvent } from '@react-three/fiber'
import { type RefObject, useRef } from 'react'

import { BOX_MATERIAL_ORDER, faceColor, sideFromMaterialIndex } from '../lib/faces'
import { normalizeBoxSize } from '../lib/normalize'
import type { Dimensions, Faces, Side } from '../lib/types'

export interface BoardPreview3DProps {
  dimensions: Dimensions
  faces: Faces
  hoveredSide: Side | null
  onHoverSide: (side: Side | null) => void
  onToggleSide: (side: Side) => void
  height?: number
}

/** Pointer travel (px) after which a press counts as rotating, not clicking a face. */
const CLICK_TOLERANCE = 5

function sideOf(event: ThreeEvent<PointerEvent | MouseEvent>): Side | null {
  const index = event.face?.materialIndex
  return index === undefined ? null : sideFromMaterialIndex(index)
}

type Portal = RefObject<HTMLDivElement | null>

function Label({
  portal,
  position,
  text,
}: {
  portal: Portal
  position: [number, number, number]
  text: string
}) {
  return (
    <Html
      // A fixed container: drei otherwise picks `events.connected`, which is not set yet
      // when the first label mounts, and that label then renders into a discarded root.
      portal={portal as RefObject<HTMLElement>}
      position={position}
      center
      style={{ pointerEvents: 'none' }}
    >
      <div
        style={{
          fontSize: 11,
          whiteSpace: 'nowrap',
          padding: '1px 4px',
          borderRadius: 4,
          background: 'var(--mantine-color-body)',
          color: 'var(--mantine-color-text)',
          border: '1px solid var(--mantine-color-default-border)',
        }}
      >
        {text}
      </div>
    </Html>
  )
}

function validMm(mm: number): string {
  return Number.isFinite(mm) && mm > 0 ? `${mm} мм` : '—'
}

function BoardMesh({
  dimensions,
  faces,
  hoveredSide,
  onHoverSide,
  onToggleSide,
  portal,
}: BoardPreview3DProps & { portal: Portal }) {
  const [x, y, z] = normalizeBoxSize(dimensions)
  const gap = 0.12

  return (
    <group>
      <mesh
        onPointerMove={(event) => {
          event.stopPropagation()
          onHoverSide(sideOf(event))
        }}
        onPointerOut={() => onHoverSide(null)}
        onClick={(event) => {
          event.stopPropagation()
          const side = sideOf(event)
          if (side && event.delta <= CLICK_TOLERANCE) onToggleSide(side)
        }}
      >
        <boxGeometry args={[x, y, z]} />
        {BOX_MATERIAL_ORDER.map((side, index) => (
          <meshStandardMaterial
            key={side}
            attach={`material-${index}`}
            color={faceColor(faces, side)}
            emissive="#ffffff"
            emissiveIntensity={hoveredSide === side ? 0.18 : 0}
            roughness={0.8}
          />
        ))}
        <Edges color="#444" />
      </mesh>

      {/* Length under the front edge, width under the right end, thickness at the left end. */}
      <Label
        portal={portal}
        position={[0, -y / 2 - gap, z / 2 + gap]}
        text={validMm(dimensions.length_mm)}
      />
      <Label
        portal={portal}
        position={[x / 2 + gap, -y / 2 - gap, 0]}
        text={validMm(dimensions.width_mm)}
      />
      <Label
        portal={portal}
        position={[-x / 2 - gap, 0, z / 2 + gap]}
        text={validMm(dimensions.thickness_mm)}
      />
    </group>
  )
}

/** Live 3D view for the editor. Loaded lazily: three.js is a large chunk. */
export default function BoardPreview3D({ height = 280, ...props }: BoardPreview3DProps) {
  const labels = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={labels}
      style={{
        position: 'relative',
        height,
        borderRadius: 'var(--mantine-radius-md)',
        border: '1px solid var(--mantine-color-default-border)',
        overflow: 'hidden',
        cursor: props.hoveredSide ? 'pointer' : 'grab',
        touchAction: 'none',
      }}
    >
      <Canvas camera={{ position: [3.8, 3.1, 4.6], fov: 40 }} dpr={[1, 2]}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 8, 6]} intensity={1.4} />
        <directionalLight position={[-5, -3, -4]} intensity={0.4} />
        <BoardMesh {...props} portal={labels} />
        <OrbitControls makeDefault enablePan={false} minDistance={2.5} maxDistance={10} />
      </Canvas>
    </div>
  )
}
