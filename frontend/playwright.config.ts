import { defineConfig, devices } from '@playwright/test'

const API_PORT = 8001
const WEB_PORT = 4173
const DB_PATH = 'e2e/.tmp/e2e.db'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: /mobile\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        // Software WebGL, so the 3D view renders in headless Chromium.
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
    {
      // The owner's phone: Samsung, Chrome-based browser.
      name: 'android',
      testMatch: /mobile\.spec\.ts/,
      use: {
        ...devices['Galaxy S24'],
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
    {
      // Safari engine: catches iOS-specific issues (input zoom, touch handling).
      name: 'iphone',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['iPhone 15'] },
    },
  ],
  webServer: [
    {
      // Real backend with test-only login and a fresh database for every run.
      command:
        `rm -f ${DB_PATH}* && mkdir -p e2e/.tmp && cd ../backend && ` +
        `uv run --frozen alembic upgrade head && ` +
        `uv run --frozen uvicorn app.main:app --port ${API_PORT}`,
      url: `http://localhost:${API_PORT}/api/health`,
      env: {
        APP_ENV: 'test',
        DATABASE_URL: `sqlite:///../frontend/${DB_PATH}`,
        SECRET_KEY: 'e2e-secret',
        GOOGLE_CLIENT_ID: '',
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // Production build, not the dev server.
      command: `npm run build && npx vite preview --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { API_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
