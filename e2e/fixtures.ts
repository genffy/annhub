import { test as base, chromium, expect as playwrightExpect, type BrowserContext, type Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Console errors a spec may see without anything being wrong. Each entry says why; anything else fails
 * the test (RV-TEST-03: a spec that passes while a page throws has not tested that page).
 */
const EXPECTED_CONSOLE_ERRORS: RegExp[] = [
  // fixture pages point at hosts that do not exist, and browsers ask for /favicon.ico: not the extension's doing
  /Failed to load resource/,
]

/**
 * Custom Playwright fixtures that load the built extension into Chromium.
 * Provides: context (with extension), extensionId, page (new tab), and — automatically — a guard that
 * fails the test when any of its pages throws an uncaught error or logs an unexpected console error.
 */
export const test = base.extend<{
  /** Browser UI language; the product wording is localized (D-11). Specs run in Chinese unless they opt into `en-US`. */
  uiLocale: string
  context: BrowserContext
  extensionId: string
  page: Page
  pageErrors: string[]
}>({
  uiLocale: ['zh-CN', { option: true }],

  context: async ({ uiLocale }, use) => {
    const pathToExtension = path.join(__dirname, '..', '.output', 'chrome-mv3')
    // CHROMIUM_EXECUTABLE_PATH: use a preinstalled Chromium instead of the one Playwright pins.
    const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH
    const context = await chromium.launchPersistentContext('', {
      ...(executablePath ? { executablePath } : { channel: 'chromium' as const }),
      locale: uiLocale,
      acceptDownloads: true,
      args: [`--disable-extensions-except=${pathToExtension}`, `--load-extension=${pathToExtension}`, '--no-first-run', '--disable-default-apps'],
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

  // the content script's overlays live in the page, so its failures surface here too
  pageErrors: [
    async ({ context }, use) => {
      const errors: string[] = []
      const watch = (page: Page): void => {
        page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))
        page.on('console', message => {
          if (message.type() !== 'error') return
          if (EXPECTED_CONSOLE_ERRORS.some(pattern => pattern.test(message.text()))) return
          errors.push(`console.error: ${message.text()}`)
        })
      }
      context.pages().forEach(watch)
      context.on('page', watch)
      await use(errors)
      context.off('page', watch)
      playwrightExpect(errors, 'a page of this test threw or logged an error').toEqual([])
    },
    { auto: true },
  ],
})

export const expect = test.expect
