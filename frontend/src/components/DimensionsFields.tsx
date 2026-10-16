import { Group, NumberInput, type NumberInputProps } from '@mantine/core'

type Field = 'length_mm' | 'width_mm' | 'thickness_mm'

const LABELS: Record<Field, string> = {
  length_mm: 'Длина',
  width_mm: 'Ширина',
  thickness_mm: 'Толщина',
}

interface Props {
  inputProps: (field: Field) => NumberInputProps
}

export function DimensionsFields({ inputProps }: Props) {
  return (
    <Group grow align="flex-start" gap="xs">
      {(Object.keys(LABELS) as Field[]).map((field) => (
        <NumberInput
          key={field}
          label={LABELS[field]}
          suffix=" мм"
          allowDecimal={false}
          allowNegative={false}
          clampBehavior="none"
          hideControls
          inputMode="numeric"
          {...inputProps(field)}
        />
      ))}
    </Group>
  )
}
