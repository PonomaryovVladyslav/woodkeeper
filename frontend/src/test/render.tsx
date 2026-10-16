import { render } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'

import { createQueryClient } from '../api/queryClient'
import { Providers } from './Providers'

export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const queryClient = createQueryClient({ retry: false })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Providers queryClient={queryClient} route={route}>
      {children}
    </Providers>
  )
  return { queryClient, ...render(ui, { wrapper }) }
}
