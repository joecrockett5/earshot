import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4179);
const DATA_DIR = path.join(os.tmpdir(), `earshot-e2e-${PORT}`);
const wipe = `node -e "require('node:fs').rmSync(process.argv[1],{recursive:true,force:true})" "${DATA_DIR}"`;

/**
 * End-to-end tests run against the real production build: the bundled server
 * serving the built web app from a throwaway data directory.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `${wipe} && npm run build && node apps/server/dist/index.cjs`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PORT: String(PORT), DATA_DIR, LOG_LEVEL: 'warn' },
  },
});
