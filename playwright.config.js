import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const _dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  /** Domyślnie 120 s — w CI lazy Film Lab + upload potrafią przekroczyć; `test.setTimeout` w specie też może podnieść. */
  timeout: 180_000,
  testDir: path.join(_dirname, 'e2e'),
  outputDir: path.join(os.tmpdir(), 'mindfullens-playwright-output'),
  globalSetup: path.join(_dirname, 'e2e', 'global-setup.mjs'),
  testIgnore: ['**/._*', '**/.DS_Store'],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4174',
    trace: 'on-first-retry',
    /** Asserty na filmstrip / canvas — wolniejsze maszyny w Actions. */
    expect: { timeout: 30_000 },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI,
    /** Pierwszy `vite` + prebundle (np. react-window) na cold starcie w CI. */
    timeout: 180_000,
  },
});
