/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Backend for the dev/preview proxy; E2E tests run their own backend on another port.
const apiUrl = process.env.API_URL ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  build: {
    // The lazily loaded three.js chunk (3D editor view) is ~950 kB on its own.
    chunkSizeWarningLimit: 1000,
  },
  server: {
    proxy: {
      '/api': apiUrl,
    },
  },
  preview: {
    proxy: {
      '/api': apiUrl,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
