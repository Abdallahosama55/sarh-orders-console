import { defineConfig, devices } from '@playwright/test';
import { randomBytes } from 'node:crypto';

// The E2E stack runs on its own ports and database, so it never touches `npm run dev`.
const API_PORT = 3101;
const WEB_PORT = 5174;
export const BASE_URL = `http://localhost:${WEB_PORT}`;

const apiEnv = {
  PORT: String(API_PORT),
  DATABASE_PATH: 'data/e2e.db',
  JWT_SECRET: randomBytes(32).toString('hex'),
  APP_ORIGIN: BASE_URL,
  NODE_ENV: 'development',
  STATS_DELAY_MS: '1500-2000', // still slow enough to cancel, without slowing the suite down
  LOG_LEVEL: 'warn',
};

const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } };

export default defineConfig({
  testDir: 'e2e',
  // One shared, freshly seeded database: run serially so tests never race each other's data.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: BASE_URL, trace: 'retain-on-failure' },
  projects: [
    { name: 'e2e', testIgnore: /screenshots\.spec\.ts/, use: desktop },
    { name: 'screenshots', testMatch: /screenshots\.spec\.ts/, use: desktop },
  ],
  webServer: [
    {
      command: 'npm run seed -w @orders/api && npm run start -w @orders/api',
      url: `http://localhost:${API_PORT}/api/health`,
      env: apiEnv,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run dev -w @orders/web -- --port ${WEB_PORT}`,
      url: BASE_URL,
      env: { API_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
