/**
 * Delivery to Desktop against a scripted local hub (storage.md §8): only a
 * persisted confirmation removes a pending task, a refused item stays queued and
 * visible, and one failing item never holds up the ones behind it.
 */
import http from 'node:http'
import type { BrowserContext, Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { captureFragmentViaUi, clearFragmentStoreViaServiceWorker, ensureServiceWorker, getOutboxFromServiceWorker, navigateToFragmentPage } from './helpers'

const PORT = 8765

type Script = Record<string, number>

/** Answers PUT /v1/fragments/* by the fragment's content, everything else like an idle Desktop. */
async function startHub(script: Script) {
  const requests: Array<{ method: string; url: string; content?: string }> = []
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      const url = req.url ?? ''
      if (req.method === 'PUT' && url.startsWith('/v1/fragments/')) {
        const content = JSON.parse(Buffer.concat(chunks).toString('utf8')).fragment.content as string
        requests.push({ method: 'PUT', url, content })
        res.writeHead(script[content] ?? 201, { 'Content-Type': 'application/json' }).end('{}')
      } else if (req.method === 'GET' && url.startsWith('/v1/changes')) {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"changes":[]}')
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"status":"ok"}')
      }
    })
  })
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(PORT, '127.0.0.1', resolve))
  return {
    script,
    requests,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  }
}

async function saveFragment(page: Page, content: string) {
  const response = await page.evaluate(async text => {
    return chrome.runtime.sendMessage({
      type: 'SAVE_FRAGMENT',
      force: true,
      input: {
        kind: 'excerpt',
        content: text,
        excerpt: `${text} — surrounding sentence for context.`,
        sourceUrl: 'https://example.com/delivery',
        sourceTitle: 'Delivery fixture',
        verified: { confirmedAt: Date.now(), source: 'manual' },
        use: 'e2e',
        detail: { note: 'n' },
      },
    })
  }, content)
  expect(response.success, response.error).toBe(true)
}

async function pair(page: Page) {
  const response = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'SET_DESKTOP_DIRECT_CONNECT', config: { token: 'e2e-pair-code' } }))
  expect(response.success).toBe(true)
}

const flush = (page: Page) => page.evaluate(() => chrome.runtime.sendMessage({ type: 'FLUSH_DESKTOP_DIRECT_CONNECT' }))

async function cleanUp(context: BrowserContext) {
  await clearFragmentStoreViaServiceWorker(context)
  const sw = await ensureServiceWorker(context)
  await sw.evaluate(() => new Promise<void>(resolve => chrome.storage.local.remove(['desktopDirectConnect', 'desktopDeliveryState'], () => resolve())))
}

const contentOf = (event: any) => event.payload.fragmentId as string

test.describe('delivery to Desktop', () => {
  test('a refused item is parked and visible, the items behind a failing one are delivered, retry and dismiss resolve it', async ({ page, context, extensionId }) => {
    const hub = await startHub({ 'alpha poison': 500, 'bravo conflict': 409 })
    try {
      await cleanUp(context)
      await page.goto(`chrome-extension://${extensionId}/library.html`)
      await pair(page)
      for (const content of ['alpha poison', 'bravo conflict', 'charlie fine']) await saveFragment(page, content)

      const result = (await flush(page)).data
      expect(result).toMatchObject({ deliveredFragments: 1, rejected: 1 })
      // The 500 on the first item did not stop the third from being delivered.
      expect(hub.requests.map(r => r.content)).toEqual(['alpha poison', 'bravo conflict', 'charlie fine'])

      const outbox = await getOutboxFromServiceWorker(context)
      expect(outbox).toHaveLength(2) // only the confirmed one is gone
      const parked = outbox.filter(event => event.rejection)
      expect(parked).toHaveLength(1)
      expect(parked[0].rejection).toMatchObject({ code: 'CONFLICT', status: 409 })
      expect(outbox.find(event => !event.rejection).failures).toBe(1)

      // Settings tells the user, instead of the refusal vanishing with the next run.
      await page.goto(`chrome-extension://${extensionId}/options.html#/settings`)
      const panel = page.getByTestId('rejected-deliveries')
      await expect(panel).toContainText('1 项未能交付到 Desktop')
      await expect(page.getByTestId('rejected-item')).toContainText('与 Desktop 已有的记录冲突')
      await expect(page.getByTestId('desktop-status')).toContainText('待发送：1 条碎片')

      // The refused item is not retried by itself…
      hub.requests.length = 0
      await flush(page)
      expect(hub.requests.map(r => r.content)).toEqual(['alpha poison'])

      // …but "retry" puts it back in the queue and delivers it once Desktop accepts it.
      hub.script['bravo conflict'] = 201
      await page.getByTestId('rejected-retry').click()
      await expect(panel).toHaveCount(0)
      const afterRetry = await getOutboxFromServiceWorker(context)
      expect(afterRetry).toHaveLength(1) // alpha is still failing; bravo is delivered
      expect(afterRetry[0].rejection).toBeUndefined()
    } finally {
      await hub.close()
      await cleanUp(context)
    }
  })

  test('dismissing parked items removes them and the notice that named them', async ({ page, context, extensionId }) => {
    const hub = await startHub({ 'too large to take': 422 })
    try {
      await cleanUp(context)
      await page.goto(`chrome-extension://${extensionId}/library.html`)
      await pair(page)
      await saveFragment(page, 'too large to take')
      await flush(page)
      expect((await getOutboxFromServiceWorker(context)).filter(event => event.rejection)).toHaveLength(1)

      const first = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_DESKTOP_DIRECT_CONNECT' }))
      expect(first.data.state.lastError).toContain('422')
      // The next run has nothing new to report (the parked item is skipped) but the notice stays.
      await flush(page)
      const before = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_DESKTOP_DIRECT_CONNECT' }))
      expect(before.data.state.lastError).toContain('1 项未能交付到 Desktop')

      await page.goto(`chrome-extension://${extensionId}/options.html#/settings`)
      page.once('dialog', dialog => void dialog.accept())
      await page.getByTestId('rejected-dismiss').click()
      await expect(page.getByTestId('rejected-deliveries')).toHaveCount(0)

      expect(await getOutboxFromServiceWorker(context)).toHaveLength(0)
      const after = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_DESKTOP_DIRECT_CONNECT' }))
      expect(after.data.state.lastError).toBeUndefined()
      // The local record itself was never touched.
      const fragments = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_FRAGMENTS', query: {} }))
      expect(fragments.data.items).toHaveLength(1)
    } finally {
      await hub.close()
      await cleanUp(context)
    }
  })

  test('a fragment saved from the capture window reaches Desktop', async ({ page, context, extensionId }) => {
    // The standard flow skips the optional understanding step, so the saved record has no `guess`.
    // Hashing such a record used to throw and no request was ever sent.
    const hub = await startHub({})
    try {
      await cleanUp(context)
      await navigateToFragmentPage(page)
      await captureFragmentViaUi(page, { kind: 'concept' })
      expect(await getOutboxFromServiceWorker(context)).toHaveLength(1)

      const library = await context.newPage()
      await library.goto(`chrome-extension://${extensionId}/library.html`)
      await pair(library)
      const flushed = await flush(library)

      expect(flushed.success, flushed.error).toBe(true)
      expect(flushed.data).toMatchObject({ deliveredFragments: 1, rejected: 0, errors: [] })
      expect(hub.requests.map(r => r.content)).toEqual(['hawkish pivot'])
      expect(await getOutboxFromServiceWorker(context)).toHaveLength(0)
    } finally {
      await hub.close()
      await cleanUp(context)
    }
  })

  test('with Desktop not running nothing is removed or parked', async ({ page, context, extensionId }) => {
    try {
      await cleanUp(context)
      await page.goto(`chrome-extension://${extensionId}/library.html`)
      await pair(page)
      await saveFragment(page, 'offline one')
      await saveFragment(page, 'offline two')

      const result = (await flush(page)).data
      expect(result).toMatchObject({ unreachable: true, deliveredFragments: 0, rejected: 0 })
      const outbox = await getOutboxFromServiceWorker(context)
      expect(outbox).toHaveLength(2)
      expect(outbox.every(event => !event.rejection)).toBe(true)
      expect(outbox.map(contentOf)).toHaveLength(2)
    } finally {
      await cleanUp(context)
    }
  })
})
