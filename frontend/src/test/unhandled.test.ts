import { describe, expect, it } from 'vitest'

describe('MSW', () => {
  it('blocks requests without a handler instead of hitting the network', async () => {
    const error: unknown = await fetch('/api/no-such-handler').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(TypeError)
    expect(String((error as { cause?: unknown }).cause)).toMatch(/\[MSW\].*onUnhandledFrame/)
  })
})
