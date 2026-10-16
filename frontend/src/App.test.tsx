import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import App from './App'
import { renderWithProviders } from './test/render'
import { server } from './test/server'

describe('App', () => {
  it('renders and reports a healthy API', async () => {
    renderWithProviders(<App />)

    expect(screen.getByRole('heading', { name: 'Woodkeeper' })).toBeInTheDocument()
    expect(await screen.findByText('работает')).toBeInTheDocument()
  })

  it('reports an unavailable API', async () => {
    server.use(http.get('/api/health', () => new HttpResponse(null, { status: 502 })))

    renderWithProviders(<App />)

    expect(await screen.findByText('недоступен')).toBeInTheDocument()
  })
})
