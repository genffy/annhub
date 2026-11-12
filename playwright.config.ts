import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  outputDir: './test-results',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  // The one retry exists to leave a trace of the first attempt (`trace: 'on-first-retry'`), not to
  // mask flakes: a test that only passes on retry fails the job (RV-TEST-16), and a committed
  // `test.only` must not shrink CI to a subset and stay green.
  forbidOnly: Boolean(process.env.CI),
  failOnFlakyTests: Boolean(process.env.CI),
  workers: 1, // extensions need serial execution (shared browser context)
  // CI shards run the github reporter (job annotations) and keep a blob report so the
  // merge-reports job in ci.yml can combine the shards into one HTML report on failure.
  reporter: process.env.CI ? [['github'], ['blob', { outputDir: 'blob-report' }]] : [['html', { outputFolder: './playwright-report' }]],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm exec tsx e2e/test-server.ts',
    port: 8173,
    reuseExistingServer: !process.env.CI,
  },
})
