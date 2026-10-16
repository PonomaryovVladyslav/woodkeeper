import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, isUnauthorized, unwrap } from './client'
import { queryKeys } from './keys'

export function useConfig() {
  return useQuery({
    queryKey: queryKeys.config,
    queryFn: () => unwrap(api.GET('/api/config')),
    staleTime: Infinity,
  })
}

/** Current user, or null when not signed in. */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => {
      try {
        return await unwrap(api.GET('/api/auth/me'))
      } catch (error) {
        if (isUnauthorized(error)) {
          return null
        }
        throw error
      }
    },
  })
}

export function useGoogleLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (credential: string) =>
      unwrap(api.POST('/api/auth/google', { body: { credential } })),
    onSuccess: (user) => queryClient.setQueryData(queryKeys.me, user),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/auth/logout')),
    onSuccess: () => {
      // Update `me` in place so mounted guards see null and redirect; removing it
      // instead would leave them subscribed to a detached query.
      queryClient.setQueryData(queryKeys.me, null)
      // Drop everything else that belonged to the previous user.
      const keep: readonly unknown[] = [queryKeys.me[0], queryKeys.config[0]]
      queryClient.removeQueries({ predicate: (query) => !keep.includes(query.queryKey[0]) })
    },
  })
}
