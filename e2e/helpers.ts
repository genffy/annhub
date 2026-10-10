import type { BrowserContext, Locator, Page, Worker } from '@playwright/test'

/** The local capture fixture served by the E2E test server. */
export function getCapturePageUrl(): string {
  return 'http://localhost:8173/capture.html'
}

export function getScreenshotPageUrl(): string {
  return 'http://localhost:8173/screenshot.html'
}

/**
 * The extension's service worker, once its extension APIs are bound.
 *
 * Playwright reports a worker as soon as its execution context exists, which
 * can be before `chrome.storage` is injected; evaluating then throws.
 */
export async function ensureServiceWorker(context: BrowserContext): Promise<Worker> {
  let [sw] = context.serviceWorkers()
  if (!sw) sw = await context.waitForEvent('serviceworker')
  const deadline = Date.now() + 10_000
  for (;;) {
    const ready = await sw.evaluate(() => typeof chrome !== 'undefined' && Boolean(chrome.storage?.local)).catch(() => false)
    if (ready) return sw
    if (Date.now() > deadline) throw new Error('The extension service worker never exposed chrome.storage')
    await new Promise(resolve => setTimeout(resolve, 50))
    sw = context.serviceWorkers()[0] ?? sw
  }
}

// ── entries (the annhub IndexedDB) ───────────────────────────────────────

export interface TestEntry {
  id: string
  type: 'clip' | 'screenshot'
  content: string
  context?: string
  assetId?: string
  note?: string
  highlights?: unknown[]
  sourceUrl: string
  sourceHost: string
  properties: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

/**
 * Reads the entries store. Opens WITHOUT an explicit version on purpose: a
 * versioned open from the test would create an empty DB at the target
 * version if none exists yet, suppressing the store's own upgrade callback.
 */
export async function getEntries(context: BrowserContext): Promise<TestEntry[]> {
  const sw = await ensureServiceWorker(context)
  return sw.evaluate(() => {
    return new Promise<any[]>(resolve => {
      const request = indexedDB.open('annhub')
      request.onerror = () => resolve([])
      request.onsuccess = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('entries')) {
          db.close()
          return resolve([])
        }
        const getAll = db.transaction('entries', 'readonly').objectStore('entries').getAll()
        getAll.onsuccess = () => {
          db.close()
          resolve(getAll.result || [])
        }
        getAll.onerror = () => resolve([])
      }
    })
  })
}

/**
 * Clears saved entries, assets and preferences. The property registry keeps
 * its built-ins: wiping them would make every later save fail validation
 * until the service worker restarts.
 */
export async function clearLibrary(context: BrowserContext): Promise<void> {
  const sw = await ensureServiceWorker(context)
  await sw.evaluate(() => {
    return new Promise<void>(resolve => {
      const request = indexedDB.open('annhub')
      request.onerror = () => resolve()
      request.onsuccess = () => {
        const db = request.result
        const stores = ['entries', 'assets', 'search', 'searchText'].filter(name => db.objectStoreNames.contains(name))
        const finish = () => chrome.storage.local.clear(() => resolve())
        if (stores.length === 0) {
          db.close()
          return finish()
        }
        const tx = db.transaction(stores, 'readwrite')
        for (const store of stores) tx.objectStore(store).clear()
        tx.oncomplete = () => {
          db.close()
          finish()
        }
        tx.onerror = () => {
          db.close()
          finish()
        }
      }
    })
  })
}

/**
 * Edits an entry through the message the library itself sends. Tests that write straight into IndexedDB
 * skip the derived search documents the store keeps in step with every real edit; use this wherever a
 * test needs an entry to change the way it changes for a user.
 */
export async function updateEntry(context: BrowserContext, extensionId: string, id: string, patch: Record<string, unknown>): Promise<void> {
  const page = await context.newPage()
  try {
    await page.goto(`chrome-extension://${extensionId}/sample.html`)
    const response = await page.evaluate(payload => chrome.runtime.sendMessage({ type: 'UPDATE_ENTRY', id: payload.id, patch: payload.patch }), { id, patch })
    if (!response?.success) throw new Error(`UPDATE_ENTRY ${id} failed: ${response?.error}`)
  } finally {
    await page.close()
  }
}

/**
 * Sends a message from an extension page, the way the library does, and returns the response's data. `page` has to
 * show an extension page (`sample.html` carries no UI of its own); an error response fails the test with its code.
 */
export async function sendMessage<T = unknown>(page: Page, message: Record<string, unknown>): Promise<T> {
  const response = await page.evaluate(payload => chrome.runtime.sendMessage(payload), message)
  if (!response?.success) throw new Error(`${String(message.type)} failed: ${response?.error}`)
  return response.data as T
}

/** Image asset metadata held by the extension (bytes stay Blobs). */
export async function getAssetMetadata(context: BrowserContext): Promise<Array<{ id: string; mimeType: string; byteLength: number; width: number; height: number }>> {
  const sw = await ensureServiceWorker(context)
  return sw.evaluate(() => {
    return new Promise<any[]>(resolve => {
      const request = indexedDB.open('annhub')
      request.onerror = () => resolve([])
      request.onsuccess = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('assets')) {
          db.close()
          return resolve([])
        }
        const getAll = db.transaction('assets', 'readonly').objectStore('assets').getAll()
        getAll.onsuccess = () => {
          db.close()
          resolve((getAll.result || []).map((a: any) => a.metadata))
        }
        getAll.onerror = () => resolve([])
      }
    })
  })
}

export async function getSettings(context: BrowserContext): Promise<Record<string, unknown>> {
  const sw = await ensureServiceWorker(context)
  return sw.evaluate(
    () =>
      new Promise<Record<string, unknown>>(resolve =>
        chrome.storage.local.get('annhub.settings', result => {
          const raw = (result as Record<string, unknown>)['annhub.settings']
          resolve(raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {})
        }),
      ),
  )
}

export async function setSettings(context: BrowserContext, patch: Record<string, unknown>): Promise<void> {
  const sw = await ensureServiceWorker(context)
  await sw.evaluate(
    next =>
      new Promise<void>(resolve =>
        chrome.storage.local.get('annhub.settings', current => chrome.storage.local.set({ 'annhub.settings': { ...current, ...next } }, () => resolve())),
      ),
    patch,
  )
}

/** WCAG contrast of each element's text colour against the first painted background behind it. */
export function textContrast(locator: Locator): Promise<number[]> {
  return locator.evaluateAll(elements => {
    const channels = (value: string): number[] => (value.match(/[\d.]+/g) ?? []).map(Number)
    const luminance = ([r, g, b]: number[]): number => {
      const linear = [r, g, b].map(channel => {
        const unit = (channel ?? 0) / 255
        return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
    }
    const backdrop = (element: Element): number[] => {
      for (let node: Element | null = element; node; node = node.parentElement) {
        const [r, g, b, a = 1] = channels(getComputedStyle(node).backgroundColor)
        if (a > 0) return [r!, g!, b!]
      }
      return [255, 255, 255]
    }
    return elements.map(element => {
      const [text, ground] = [luminance(channels(getComputedStyle(element).color)), luminance(backdrop(element))]
      return (Math.max(text, ground) + 0.05) / (Math.min(text, ground) + 0.05)
    })
  })
}

// ── page driving ─────────────────────────────────────────────────────────

/** Selects an element's text content and settles the selection (the menu reads it live). */
export async function selectText(page: Page, selector: string): Promise<void> {
  await page.evaluate(sel => {
    const element = document.querySelector(sel)
    if (!element) throw new Error(`Element not found: ${sel}`)
    const range = document.createRange()
    range.selectNodeContents(element)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    element.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
  }, selector)
}

/**
 * Selects until the selection menu shows. The content script loads at
 * document_idle; a selection made before it is ready only needs a re-settle.
 */
export async function selectUntilMenu(page: Page, selector: string, timeout = 8000): Promise<Locator> {
  const menu = page.locator('[data-ann-ui="selection-menu"]')
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    await selectText(page, selector)
    try {
      await menu.waitFor({ state: 'visible', timeout: 1200 })
      return menu
    } catch {
      /* not ready yet — settle the selection again */
    }
  }
  throw new Error('The selection menu never appeared')
}

/**
 * What the keyboard shortcut does: the background messages the top frame's
 * content script of the tab showing `page` — never a DOM event the page's own
 * scripts could dispatch.
 */
async function sendTabMessage(page: Page, message: Record<string, unknown>): Promise<void> {
  const worker = await ensureServiceWorker(page.context())
  const url = page.url()
  const deadline = Date.now() + 10_000
  for (;;) {
    const error = await worker.evaluate(
      async payload => {
        const tab = (await chrome.tabs.query({})).find(candidate => candidate.url === payload.url)
        if (tab?.id === undefined) return `no tab shows ${payload.url}`
        try {
          await chrome.tabs.sendMessage(tab.id, { type: payload.type }, { frameId: 0 })
          return ''
        } catch (failure) {
          return failure instanceof Error ? failure.message : String(failure)
        }
      },
      { ...message, url } as { type: string; url: string },
    )
    if (!error) return
    if (Date.now() > deadline) throw new Error(`The trigger never reached the page: ${error}`)
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

export function triggerScreenshot(page: Page): Promise<void> {
  return sendTabMessage(page, { type: 'TRIGGER_SCREENSHOT' })
}

export function triggerBlockMode(page: Page): Promise<void> {
  return sendTabMessage(page, { type: 'TRIGGER_BLOCK_MODE' })
}

/** Waits for the clip toast (已剪藏 · 撤销 · 编辑); tolerant of a cold service worker. */
export async function waitForClipToast(page: Page, timeout = 12_000): Promise<Locator> {
  const toast = page.locator('[data-ann-ui="clip-toast"]')
  await toast.waitFor({ state: 'attached', timeout })
  return toast
}

/**
 * Stops the extension's service workers (CDP). The next message has to wake a
 * cold worker — the regression this guards is a listener that only exists
 * after initialization (RV-BG-01).
 */
export async function stopServiceWorker(context: BrowserContext, page: Page): Promise<void> {
  const session = await context.newCDPSession(page)
  await session.send('ServiceWorker.enable' as any)
  await session.send('ServiceWorker.stopAllWorkers' as any)
  await session.detach()
}

/** Rests the pointer over an element long enough for the block capsule (400ms dwell). */
export async function hoverForCapsule(page: Page, selector: string, timeout = 6000): Promise<Locator> {
  const capsule = page.locator('[data-ann-ui="block-capsule"]')
  await page.locator(selector).hover()
  await capsule.waitFor({ state: 'visible', timeout })
  return capsule
}
