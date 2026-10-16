import { ColorSwatch, Group, Text, Tooltip } from '@mantine/core'

import { SIDE_LABELS, veneeredSides } from '../lib/faces'
import type { Faces } from '../lib/types'

/** Compact list of veneered sides; the static 3D preview replaces it in stage 10. */
export function FaceSwatches({ faces }: { faces: Faces }) {
  const sides = veneeredSides(faces)
  if (sides.length === 0) {
    return (
      <Text size="xs" c="dimmed">
        Без облицовки
      </Text>
    )
  }
  return (
    <Group gap={4}>
      {sides.map((side) => (
        <Tooltip key={side} label={SIDE_LABELS[side]} withArrow>
          <ColorSwatch
            color={faces[side] as string}
            size={16}
            aria-label={`${SIDE_LABELS[side]}: ${faces[side]}`}
          />
        </Tooltip>
      ))}
    </Group>
  )
}
