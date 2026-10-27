import { defineConfig } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
export default defineConfig({
  testDir: './tests/connected', workers: 1, fullyParallel: false, timeout: 45_000,
  reporter: [['list']], outputDir: join(tmpdir(), 'ccl-connected-test-results'),
  use: { baseURL: 'http://127.0.0.1:5181', browserName: 'chromium', viewport: { width: 1440, height: 900 },
    trace: 'off', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: { command: 'node tools/test-server.mjs 5181', url: 'http://127.0.0.1:5181', reuseExistingServer: false },
})
