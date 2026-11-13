import { test, expect } from './fixtures'
import { ensureServiceWorker, getScreenshotPageUrl } from './helpers'

/**
 * The options entry hands over to the settings view of the application page and keeps the query string on the
 * way: the settings view reads from it the tab that wanted the microphone (extension.md §2.2, annotate.md §2.1).
 * Extension pages carry `script-src 'self'`, so the entry has no inline script; the fixture's console-error guard
 * fails these tests when one comes back, because a blocked inline script is a console error on every open.
 */

test('the options entry lands on the settings view', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`, { waitUntil: 'commit' })
  await page.waitForURL(`chrome-extension://${extensionId}/library.html#/settings`)
  await expect(page.getByTestId('recording-section')).toBeVisible()
})

test('the tab that wanted the microphone survives the hand-over, and the grant offers the way back (annotate.md §2.1)', async ({ context, extensionId }) => {
  // The browser's own prompt is not something a test can answer: the extension page reads the microphone as allowed.
  await context.addInitScript(() => {
    if (location.protocol !== 'chrome-extension:') return
    const query = navigator.permissions.query.bind(navigator.permissions)
    navigator.permissions.query = descriptor =>
      descriptor.name === ('microphone' as PermissionName) ? Promise.resolve({ state: 'granted' } as PermissionStatus) : query(descriptor)
  })

  const recordedUrl = getScreenshotPageUrl()
  const recorded = await context.newPage()
  await recorded.goto(recordedUrl)
  const worker = await ensureServiceWorker(context)
  const recordTabId = await worker.evaluate(async url => (await chrome.tabs.query({})).find(tab => tab.url === url)?.id, recordedUrl)
  expect(recordTabId).toBeGreaterThan(0)

  // the route the popup and the shortcut take: the options entry, with the recording tab in the query
  const settings = await context.newPage()
  await settings.goto(`chrome-extension://${extensionId}/options.html?recordTab=${recordTabId}`, { waitUntil: 'commit' })
  await settings.waitForURL(`chrome-extension://${extensionId}/library.html?recordTab=${recordTabId}#/settings`)

  await expect(settings.getByTestId('mic-status')).toBeVisible()
  const back = settings.getByTestId('mic-back-to-tab')
  await expect(back).toBeVisible()

  // "back to the recording tab" brings that tab forward and closes the settings tab
  await Promise.all([settings.waitForEvent('close'), back.click()])
  await expect.poll(() => worker.evaluate(id => chrome.tabs.get(id!).then(tab => tab.active), recordTabId)).toBe(true)
})
