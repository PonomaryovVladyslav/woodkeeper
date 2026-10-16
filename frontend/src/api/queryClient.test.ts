import { describe, expect, it } from 'vitest'

import { ApiError } from './client'
import { queryKeys } from './keys'
import { createQueryClient } from './queryClient'

describe('createQueryClient', () => {
  it('forgets the user when any query gets 401', async () => {
    const client = createQueryClient({ retry: false })
    client.setQueryData(queryKeys.me, { id: 1 })

    await client
      .fetchQuery({
        queryKey: ['projects'],
        queryFn: () => Promise.reject(new ApiError(401, null)),
      })
      .catch(() => {})

    expect(client.getQueryData(queryKeys.me)).toBeNull()
  })

  it('keeps the user on other errors', async () => {
    const client = createQueryClient({ retry: false })
    client.setQueryData(queryKeys.me, { id: 1 })

    await client
      .fetchQuery({ queryKey: ['projects'], queryFn: () => Promise.reject(new ApiError(500, null)) })
      .catch(() => {})

    expect(client.getQueryData(queryKeys.me)).toEqual({ id: 1 })
  })

  it('does not retry client errors but retries server errors', () => {
    const retry = createQueryClient().getDefaultOptions().queries?.retry
    if (typeof retry !== 'function') throw new Error('retry must be a function')

    expect(retry(0, new ApiError(404, null))).toBe(false)
    expect(retry(0, new ApiError(503, null))).toBe(true)
    expect(retry(0, new TypeError('network'))).toBe(true)
    expect(retry(2, new TypeError('network'))).toBe(false)
  })
})
