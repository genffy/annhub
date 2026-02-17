import { defineConfig } from '@playwright/test'

export default defineConfig({
    testDir: './e2e',
    globalSetup: './e2e/global-setup.ts',
    outputDir: './test-results',
    timeout: 30_000,
    retries: process.env.CI ? 1 : 0,
    workers: 1, // extensions need serial execution (shared browser context)
    reporter: process.env.CI ? 'github' : [['html', { outputFolder: './playwright-report' }]],
    use: {
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    webServer: {
        command: 'npx tsx e2e/test-server.ts',
        port: 8173,
        reuseExistingServer: !process.env.CI,
    },
})
