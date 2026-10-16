import { Checkbox, ColorSwatch, Group, Popover, Stack, Text, UnstyledButton } from '@mantine/core'
import { HexColorInput, HexColorPicker } from 'react-colorful'

import { SIDE_LABELS, SIDES } from '../lib/faces'
import type { Side } from '../lib/types'
import { setSideColor, toggleSide, type VeneerState } from '../lib/veneer'

interface Props {
  value: VeneerState
  onChange: (next: VeneerState) => void
  /** Side highlighted from the 3D view (stage 10). */
  activeSide?: Side | null
}

export function FacesEditor({ value, onChange, activeSide = null }: Props) {
  return (
    <Stack gap={6}>
      <Text size="sm" fw={500}>
        Облицовка
      </Text>
      {SIDES.map((side) => {
        const color = value.faces[side]
        const label = SIDE_LABELS[side]
        return (
          <Group
            key={side}
            gap="sm"
            justify="space-between"
            wrap="nowrap"
            px={6}
            py={2}
            bg={activeSide === side ? 'var(--mantine-color-default-hover)' : undefined}
            style={{ borderRadius: 'var(--mantine-radius-sm)' }}
          >
            <Checkbox
              label={label}
              checked={color !== null}
              onChange={() => onChange(toggleSide(value, side))}
            />
            {color !== null && (
              <Popover position="bottom-end" shadow="md" withinPortal trapFocus>
                <Popover.Target>
                  <UnstyledButton aria-label={`Цвет: ${label}`}>
                    <Group gap={6} wrap="nowrap">
                      <ColorSwatch color={color} size={22} />
                      <Text size="xs" c="dimmed" ff="monospace">
                        {color}
                      </Text>
                    </Group>
                  </UnstyledButton>
                </Popover.Target>
                <Popover.Dropdown>
                  <Stack gap="xs">
                    <HexColorPicker
                      color={color}
                      onChange={(next) => onChange(setSideColor(value, side, next))}
                    />
                    <HexColorInput
                      aria-label={`HEX: ${label}`}
                      prefixed
                      color={color}
                      onChange={(next) =>
                        /^#[0-9a-fA-F]{6}$/.test(next) && onChange(setSideColor(value, side, next))
                      }
                      style={{
                        font: 'inherit',
                        padding: '4px 8px',
                        width: '100%',
                        border: '1px solid var(--mantine-color-default-border)',
                        borderRadius: 'var(--mantine-radius-sm)',
                        background: 'var(--mantine-color-body)',
                        color: 'var(--mantine-color-text)',
                      }}
                    />
                  </Stack>
                </Popover.Dropdown>
              </Popover>
            )}
          </Group>
        )
      })}
    </Stack>
  )
}
