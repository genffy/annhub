import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Custom Playwright fixtures that load the built extension into Chromium.
 * Provides: context (with extension), extensionId, page (new tab).
 */
export const test = base.extend<{
    context: BrowserContext
    extensionId: string
    page: Page
}>({
    // eslint-disable-next-line no-empty-pattern
    context: async ({ }, use) => {
        const pathToExtension = path.join(__dirname, '..', '.output', 'chrome-mv3')
        const context = await chromium.launchPersistentContext('', {
            channel: 'chromium',
            args: [
                `--disable-extensions-except=${pathToExtension}`,
                `--load-extension=${pathToExtension}`,
                '--no-first-run',
                '--disable-default-apps',
            ],
        })
        await use(context)
        await context.close()
    },

    extensionId: async ({ context }, use) => {
        // For manifest v3: get the extension ID from the service worker URL
        let [serviceWorker] = context.serviceWorkers()
        if (!serviceWorker) {
            serviceWorker = await context.waitForEvent('serviceworker')
        }
        const extensionId = serviceWorker.url().split('/')[2]
        await use(extensionId)
    },

    page: async ({ context }, use) => {
        const page = await context.newPage()
        await use(page)
    },
})

export const expect = test.expect
