const KEY = 'woodkeeper.lastVeneerColor'
const HEX = /^#[0-9a-f]{6}$/

/** Last picked veneer color, remembered in this browser between editor sessions. */
export function loadLastColor(): string | null {
  try {
    const value = window.localStorage.getItem(KEY)
    return value && HEX.test(value) ? value : null
  } catch {
    return null
  }
}

export function saveLastColor(color: string): void {
  try {
    window.localStorage.setItem(KEY, color)
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the color is a convenience.
  }
}
