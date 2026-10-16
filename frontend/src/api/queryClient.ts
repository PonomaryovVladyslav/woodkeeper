import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'

import { ApiError, isUnauthorized } from './client'
import { queryKeys } from './keys'

/**
 * Any 401 means the session is gone: forget the user, and the auth guard
 * redirects to /login.
 */
export function createQueryClient({ retry = true }: { retry?: boolean } = {}): QueryClient {
  const onError = (error: unknown) => {
    if (isUnauthorized(error)) {
      client.setQueryData(queryKeys.me, null)
    }
  }

  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        // Client errors (4xx) will not fix themselves; network and 5xx might.
        retry: (failureCount, error) =>
          retry && !(error instanceof ApiError && error.status < 500) && failureCount < 2,
      },
    },
  })
  return client
}
