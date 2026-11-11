import { defineConfig } from '@playwright/test'

/**
 * Runs this directory's capture.spec.ts only: Chrome Web Store listing shots.
 * The extension and fixture pages come from the same build/test-server as
 * the e2e suite (cwd is the repo root for the web server commands); the
 * article pages next to this file are served on 8174.
 *
 *   STORE_LOCALE=en pnpm exec playwright test -c .agents/skills/store-submission/shots
 *   STORE_LOCALE=zh pnpm exec playwright test -c .agents/skills/store-submission/shots
 *
 * The finished shots land next to this file (en/ and zh/) — copy them into
 * store-assets/ for the submission session.
 */
export default defineConfig({
  testDir: './',
  testIgnore: ['archive-*/**', '.probe/**'],
  timeout: 120_000,
  workers: 1,
  reporter: 'line',
  outputDir: '../../../../test-results-store-assets',
  webServer: [
    {
      command: 'pnpm exec tsx e2e/test-server.ts',
      port: 8173,
      reuseExistingServer: true,
      cwd: '../../../../',
    },
    {
      command: 'python3 -m http.server 8174 --bind 127.0.0.1 --directory .agents/skills/store-submission/shots',
      port: 8174,
      reuseExistingServer: true,
      cwd: '../../../../',
    },
  ],
})
