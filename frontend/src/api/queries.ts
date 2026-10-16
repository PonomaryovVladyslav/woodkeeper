import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { components } from './schema'
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

type ProjectCreate = components['schemas']['ProjectCreate']
type ProjectUpdate = components['schemas']['ProjectUpdate']

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => unwrap(api.GET('/api/projects')),
  })
}

export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ProjectCreate) => unwrap(api.POST('/api/projects', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
  })
}

export function useUpdateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: ProjectUpdate & { id: number }) =>
      unwrap(api.PATCH('/api/projects/{project_id}', { params: { path: { project_id: id } }, body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
  })
}

export function useDeleteProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(api.DELETE('/api/projects/{project_id}', { params: { path: { project_id: id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
  })
}
