import { describe, expect, it } from 'vitest'

import { NO_FACES } from './faces'
import { DEFAULT_VENEER_COLOR, setSideColor, toggleSide, type VeneerState } from './veneer'

const empty: VeneerState = { faces: NO_FACES, lastColor: null }

describe('veneer', () => {
  it('enables a side with the default color when nothing was picked yet', () => {
    expect(toggleSide(empty, 'top').faces.top).toBe(DEFAULT_VENEER_COLOR)
  })

  it('enables a side with the last used color', () => {
    const picked = setSideColor(toggleSide(empty, 'top'), 'top', '#AA0000')
    const next = toggleSide(picked, 'front')

    expect(next.faces.front).toBe('#aa0000')
    expect(next.faces.top).toBe('#aa0000')
  })

  it('disables an enabled side and keeps the last color', () => {
    const picked = setSideColor(empty, 'top', '#123456')
    const next = toggleSide(picked, 'top')

    expect(next.faces.top).toBeNull()
    expect(next.lastColor).toBe('#123456')
  })

  it('remembers the latest pick across sides', () => {
    let state = setSideColor(empty, 'top', '#111111')
    state = setSideColor(state, 'left', '#222222')

    expect(state.lastColor).toBe('#222222')
    expect(toggleSide(state, 'right').faces.right).toBe('#222222')
  })

  it('does not mutate the previous state', () => {
    const before = structuredClone(empty)
    toggleSide(empty, 'top')
    setSideColor(empty, 'top', '#000000')
    expect(empty).toEqual(before)
  })
})
