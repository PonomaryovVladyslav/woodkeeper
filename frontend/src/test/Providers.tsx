import { MantineProvider } from '@mantine/core'
import type { ReactNode } from 'react'

import { theme } from '../theme'

export function Providers({ children }: { children: ReactNode }) {
  return <MantineProvider theme={theme}>{children}</MantineProvider>
}
