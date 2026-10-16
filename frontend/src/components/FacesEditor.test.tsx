import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { NO_FACES } from '../lib/faces'
import { DEFAULT_VENEER_COLOR, type VeneerState } from '../lib/veneer'
import { renderWithProviders } from '../test/render'
import { FacesEditor } from './FacesEditor'

function Harness({ initial, spy }: { initial: VeneerState; spy: (s: VeneerState) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <FacesEditor
      value={value}
      onChange={(next) => {
        spy(next)
        setValue(next)
      }}
    />
  )
}

function setup(initial: VeneerState = { faces: NO_FACES, lastColor: null }) {
  const spy = vi.fn<(s: VeneerState) => void>()
  renderWithProviders(<Harness initial={initial} spy={spy} />)
  const last = () => spy.mock.lastCall?.[0]
  return { last }
}

describe('FacesEditor', () => {
  it('lists the six sides, none veneered', () => {
    setup()
    expect(screen.getAllByRole('checkbox')).toHaveLength(6)
    expect(screen.queryByRole('button', { name: /^Цвет:/ })).not.toBeInTheDocument()
  })

  it('enabling a side gives it the default color and shows the color picker button', async () => {
    const { last } = setup()

    await userEvent.click(screen.getByLabelText('Передняя кромка'))

    expect(last()?.faces.front).toBe(DEFAULT_VENEER_COLOR)
    expect(screen.getByRole('button', { name: 'Цвет: Передняя кромка' })).toBeInTheDocument()
  })

  it('uses the last picked color for a newly enabled side', async () => {
    const { last } = setup({ faces: NO_FACES, lastColor: '#aa0000' })

    await userEvent.click(screen.getByLabelText('Левый торец'))

    expect(last()?.faces.left).toBe('#aa0000')
  })

  it('disabling a side sets it to null', async () => {
    const { last } = setup({ faces: { ...NO_FACES, top: '#123456' }, lastColor: null })

    await userEvent.click(screen.getByLabelText('Верхняя пласть'))

    expect(last()?.faces.top).toBeNull()
    expect(screen.queryByRole('button', { name: 'Цвет: Верхняя пласть' })).not.toBeInTheDocument()
  })

  it('changes the color via the HEX field and remembers it', async () => {
    const { last } = setup({ faces: { ...NO_FACES, top: '#ffffff' }, lastColor: null })

    await userEvent.click(screen.getByRole('button', { name: 'Цвет: Верхняя пласть' }))
    const hex = await screen.findByLabelText('HEX: Верхняя пласть')
    await userEvent.clear(hex)
    await userEvent.type(hex, '12AB34')

    expect(last()?.faces.top).toBe('#12ab34')
    expect(last()?.lastColor).toBe('#12ab34')
  })
})
