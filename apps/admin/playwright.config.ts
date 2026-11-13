import { defineConfig, devices } from '@playwright/test';

const API_PORT = 4100;
const ADMIN_PORT = 3100;
const API_URL = `http://localhost:${API_PORT}`;
const ADMIN_URL = `http://localhost:${ADMIN_PORT}`;

if (!process.env.E2E_DATABASE_URL) {
  throw new Error('Run end-to-end tests through `pnpm test:e2e` (e2e/run.mjs).');
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: ADMIN_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node ../api/dist/main.js',
      url: `${API_URL}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: String(API_PORT),
        DATABASE_URL: process.env.E2E_DATABASE_URL,
        TENANCY_MODE: 'multi',
        STORAGE_LOCAL_DIR: process.env.E2E_STORAGE_DIR ?? '',
        TEMPLATES_DIR: '../../templates',
        // The suite signs in many times from one IP; production keeps the default.
        AUTH_RATE_LIMIT_PER_MINUTE: '1000',
        NODE_ENV: 'development',
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: `npx next start -p ${ADMIN_PORT}`,
      url: `${ADMIN_URL}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { API_URL },
    },
  ],
});
