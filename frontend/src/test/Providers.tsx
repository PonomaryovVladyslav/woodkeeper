import { MantineProvider } from '@mantine/core'
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'

import { theme } from '../theme'

interface Props {
  children: ReactNode
  queryClient: QueryClient
  route: string
}

export function Providers({ children, queryClient, route }: Props) {
  return (
    <MantineProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>
  )
}
