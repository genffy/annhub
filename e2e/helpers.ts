import type { BrowserContext, Page, Locator, Worker } from '@playwright/test'

/**
 * URL for the local test fixture page served by the E2E test server.
 */
export function getTestPageUrl(): string {
  return 'http://localhost:8173/test.html'
}

/**
 * Programmatically select text contents of an element, then dispatch a single
 * mouseup event so the content script detects the selection exactly once.
 *
 * Using triple-click is NOT suitable for Mode B tests because it fires 3
 * mouseup events (one per click), each triggering a capture.
 */
export async function selectText(page: Page, selector: string): Promise<void> {
  await page.evaluate(sel => {
    const element = document.querySelector(sel)
    if (!element) throw new Error(`Element not found: ${sel}`)
    const range = document.createRange()
    range.selectNodeContents(element)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    // Dispatch a single mouseup to trigger the content script handler
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  }, selector)
}

/**
 * Select text via triple-click — fires 3 mouseup events.
 * Good for Mode A tests (hover menu), where redundant events don't matter
 * since the menu only appears once per valid selection.
 */
export async function tripleClickSelect(page: Page, selector: string): Promise<void> {
  const target = page.locator(selector).first()
  await target.click({ clickCount: 3 })
}

/**
 * Click a button inside the WXT shadow DOM.
 * Uses force: true to bypass actionability checks.
 */
export async function clickShadowButton(locator: Locator): Promise<void> {
  await locator.click({ force: true })
}

/**
 * Get the locator for the extension's shadow host (<ann-selection>).
 */
export function getAnnShadowRoot(page: Page): Locator {
  return page.locator('ann-selection')
}

/**
 * Wait for the hover menu to appear inside the shadow DOM.
 * Uses 'attached' because the WXT shadow host may have zero dimensions.
 */
export async function waitForHoverMenu(page: Page, timeout = 5000): Promise<Locator> {
  const shadowHost = getAnnShadowRoot(page)
  const hoverMenu = shadowHost.locator('[data-ann-ui="hover-menu"]')
  await hoverMenu.waitFor({ state: 'attached', timeout })
  return hoverMenu
}

/**
 * Wait for the Mode B capsule to appear inside the shadow DOM.
 */
export async function waitForCapsule(page: Page, timeout = 5000): Promise<Locator> {
  const shadowHost = getAnnShadowRoot(page)
  const capsule = shadowHost.locator('[data-ann-ui="capsule"]')
  await capsule.waitFor({ state: 'attached', timeout })
  return capsule
}

/**
 * Wait for the hover menu to disappear (detach from DOM).
 */
export async function waitForHoverMenuHidden(page: Page, timeout = 5000): Promise<void> {
  const shadowHost = getAnnShadowRoot(page)
  const hoverMenu = shadowHost.locator('[data-ann-ui="hover-menu"]')
  await hoverMenu.waitFor({ state: 'detached', timeout })
}

/**
 * Wait for the capsule to disappear (detach from DOM).
 */
export async function waitForCapsuleHidden(page: Page, timeout = 5000): Promise<void> {
  const shadowHost = getAnnShadowRoot(page)
  const capsule = shadowHost.locator('[data-ann-ui="capsule"]')
  await capsule.waitFor({ state: 'detached', timeout })
}

/**
 * Navigate to test.html and wait for the extension content script to load.
 */
export async function navigateToTestPage(page: Page): Promise<void> {
  await page.goto(getTestPageUrl())
  await page.waitForSelector('ann-selection', { state: 'attached', timeout: 5000 })
  await page.waitForTimeout(500)
}

/**
 * Press the toggle-highlighter shortcut.
 */
export async function pressToggleHighlighter(page: Page): Promise<void> {
  const isMac = process.platform === 'darwin'
  if (isMac) {
    await page.keyboard.press('Meta+Shift+KeyH')
  } else {
    await page.keyboard.press('Alt+KeyH')
  }
}

/**
 * Read clips from chrome.storage.local via the service worker.
 */
export async function getClipsFromServiceWorker(context: any): Promise<any[]> {
  const sw = await ensureServiceWorker(context)
  return sw.evaluate(() => {
    return new Promise((resolve: any) => {
      chrome.storage.local.get('ann-clips', (result: any) => {
        resolve(result['ann-clips'] || [])
      })
    })
  })
}

/**
 * Read highlight records from the extension's IndexedDB via its service worker.
 *
 * The background service worker owns the 'ann-highlights-db' database.
 * We must wait for the SW to be ready before evaluating.
 */
export async function getHighlightsFromServiceWorker(context: any): Promise<any[]> {
  const sw = await ensureServiceWorker(context)
  return sw.evaluate(() => {
    return new Promise<any[]>(resolve => {
      const request = indexedDB.open('ann-highlights-db', 1)
      request.onerror = () => resolve([])
      request.onsuccess = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('highlights')) {
          db.close()
          return resolve([])
        }
        const tx = db.transaction('highlights', 'readonly')
        const store = tx.objectStore('highlights')
        const getAll = store.getAll()
        getAll.onsuccess = () => resolve(getAll.result || [])
        getAll.onerror = () => resolve([])
      }
    })
  })
}

/**
 * Clear highlight records from the extension's IndexedDB via its service worker.
 */
export async function clearHighlightsFromServiceWorker(context: any): Promise<void> {
  const sw = await ensureServiceWorker(context)
  await sw.evaluate(() => {
    return new Promise<void>(resolve => {
      const request = indexedDB.open('ann-highlights-db', 1)
      request.onerror = () => resolve()
      request.onsuccess = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('highlights')) {
          db.close()
          return resolve()
        }
        const tx = db.transaction('highlights', 'readwrite')
        const store = tx.objectStore('highlights')
        store.clear()
        tx.oncomplete = () => resolve()
        tx.onerror = () => resolve()
      }
    })
  })
}

/**
 * The extension's service worker, once its extension APIs are bound.
 *
 * Playwright reports a worker as soon as its execution context exists, which can be
 * before `chrome.storage` is injected; evaluating then throws
 * "Cannot read properties of undefined (reading 'local')". Wait for the API instead.
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
    // A restarted worker replaces the old one.
    sw = context.serviceWorkers()[0] ?? sw
  }
}

/**
 * Clear clips storage via the service worker.
 */
export async function clearClipsFromServiceWorker(context: any): Promise<void> {
  const sw = await ensureServiceWorker(context)
  await sw.evaluate(() => {
    return new Promise<void>(resolve => {
      chrome.storage.local.remove('ann-clips', () => resolve())
    })
  })
}

// ────────────────────────────────────────────────────────────────────────────
// Vocab word-selection pipeline helpers
// (design docs removed from the tree, see git history: docs/vocab-word-selection-research.md,
//  docs/vocab-server-memory-model-design.md)
// ────────────────────────────────────────────────────────────────────────────

/**
 * URL for the vocab annotation fixture page served by the E2E test server.
 */
export function getVocabPageUrl(): string {
  return 'http://localhost:8173/vocab.html'
}

/**
 * Navigate to vocab.html and wait for the extension content script to attach.
 */
export async function navigateToVocabPage(page: Page): Promise<void> {
  await page.goto(getVocabPageUrl())
  await page.waitForSelector('ann-selection', { state: 'attached', timeout: 5000 })
}

/**
 * Write a partial VocabConfig into the extension's chrome.storage.local via the service
 * worker. The background merges this partial over defaults (VocabularyService.getVocabConfig),
 * so `{ enabled: true, ... }` is enough to turn vocab labeling on for the next navigation.
 * Must be called BEFORE navigating — the content script reads config once at init.
 */
export async function setVocabConfigViaServiceWorker(context: any, partial: Record<string, unknown>): Promise<void> {
  const sw = await ensureServiceWorker(context)
  await sw.evaluate((cfg: Record<string, unknown>) => {
    return new Promise<void>(resolve => {
      chrome.storage.local.set({ vocabConfig: cfg }, () => resolve())
    })
  }, partial)
}

/**
 * Read arbitrary keys from the extension's chrome.storage.local via the service worker.
 * Used to assert on the word-memory model the background owns.
 */
export async function getStorageViaServiceWorker(context: any, keys: string[]): Promise<Record<string, any>> {
  const sw = await ensureServiceWorker(context)
  return sw.evaluate((k: string[]) => {
    return new Promise<Record<string, any>>(resolve => {
      chrome.storage.local.get(k, (result: any) => resolve(result || {}))
    })
  }, keys)
}

/**
 * Write arbitrary keys into the extension's chrome.storage.local via the service worker.
 * Used to seed the local recall model (vocabWordMemory) before a navigation so the read
 * path can be exercised deterministically without depending on fire-and-forget timing.
 */
export async function setStorageViaServiceWorker(context: any, entries: Record<string, unknown>): Promise<void> {
  const sw = await ensureServiceWorker(context)
  await sw.evaluate((e: Record<string, unknown>) => {
    return new Promise<void>(resolve => {
      chrome.storage.local.set(e, () => resolve())
    })
  }, entries)
}

/**
 * Collect the annotated lemmas from the host DOM. The vocab labeler wraps each chosen word
 * in a `[data-ann-vocab]` element carrying `data-ann-vocab-word` = the normalized lemma.
 */
export async function getAnnotatedWords(page: Page): Promise<string[]> {
  return page.$$eval('[data-ann-vocab][data-ann-vocab-word]', els => els.map(el => (el as HTMLElement).dataset.annVocabWord || '').filter(Boolean))
}

/**
 * Wait until the vocab labeler has wrapped at least `min` words (host DOM markers).
 */
export async function waitForVocabAnnotations(page: Page, min = 1, timeout = 12000): Promise<void> {
  await page.waitForFunction((m: number) => document.querySelectorAll('[data-ann-vocab]').length >= m, min, { timeout })
}

// ────────────────────────────────────────────────────────────────────────────
// Fragment capture (L1/L2) helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * URL for the fragment capture fixture page served by the E2E test server.
 */
export function getFragmentPageUrl(): string {
  return 'http://localhost:8173/fragment.html'
}

export async function navigateToFragmentPage(page: Page): Promise<void> {
  await page.goto(getFragmentPageUrl())
  await page.waitForSelector('ann-selection', { state: 'attached', timeout: 5000 })
  await page.waitForTimeout(500)
}

/**
 * Wait for the capture modal inside the shadow DOM and return its card locator.
 */
export async function waitForCaptureModal(page: Page, timeout = 5000): Promise<Locator> {
  const modal = getAnnShadowRoot(page).locator('[data-ann-ui="capture-modal"]')
  await modal.waitFor({ state: 'attached', timeout })
  return modal
}

/**
 * Write the capture config (deepMode) directly — must run BEFORE the modal opens.
 */
export async function setCaptureConfigViaServiceWorker(context: any, config: { deepMode: boolean }): Promise<void> {
  const sw = await ensureServiceWorker(context)
  await sw.evaluate((cfg: { deepMode: boolean }) => {
    return new Promise<void>(resolve => {
      chrome.storage.local.set({ fragmentCaptureConfigV2: cfg }, () => resolve())
    })
  }, config)
}

/**
 * Read fragments from the extension's fragment-store (IndexedDB v3) via its service worker.
 * Opens WITHOUT an explicit version on purpose: a versioned open from the test would create
 * an empty DB at the target version if none exists yet, which suppresses the store's own
 * upgrade callback (stores never get created). Unversioned opens never interfere with it.
 */
export async function getFragmentsFromServiceWorker(context: any): Promise<any[]> {
  const sw = await ensureServiceWorker(context)
  return sw.evaluate(() => {
    return new Promise<any[]>(resolve => {
      const request = indexedDB.open('fragment-store')
      request.onerror = () => resolve([])
      request.onsuccess = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('fragments')) {
          db.close()
          return resolve([])
        }
        const tx = db.transaction('fragments', 'readonly')
        const getAll = tx.objectStore('fragments').getAll()
        getAll.onsuccess = () => {
          db.close()
          resolve(getAll.result || [])
        }
        getAll.onerror = () => resolve([])
      }
    })
  })
}

/** Clear the whole learning core (every learning-core store) via the service worker. See the version note above. */
export async function clearFragmentStoreViaServiceWorker(context: any): Promise<void> {
  const sw = await ensureServiceWorker(context)
  await sw.evaluate(() => {
    return new Promise<void>(resolve => {
      const request = indexedDB.open('fragment-store')
      request.onerror = () => resolve()
      request.onsuccess = () => {
        const db = request.result
        // An unversioned open of a store the extension has not created yet yields an empty DB: nothing to clear.
        const stores = ['fragments', 'reviewLogs', 'outboxEvents', 'assets', 'screenshots', 'localDeletions'].filter(s => db.objectStoreNames.contains(s))
        if (stores.length === 0) {
          db.close()
          return resolve()
        }
        const tx = db.transaction(stores, 'readwrite')
        for (const store of stores) tx.objectStore(store).clear()
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => resolve()
      }
    })
  })
}

/**
 * Drive the full UI capture flow (standard mode) and return once the modal
 * closes. Verification is an explicit confirmation — no LLM involved.
 */
export async function captureFragmentViaUi(page: Page, opts: { kind?: string; use?: string } = {}): Promise<void> {
  await selectText(page, '[data-testid="fragment-target"]')
  const hoverMenu = await waitForHoverMenu(page)
  await clickShadowButton(hoverMenu.locator('button', { hasText: '碎片' }))
  const modal = await waitForCaptureModal(page)

  // Kind selection happens BEFORE confirming — editing the kind afterwards
  // would clear the confirmation (fragments.md §7).
  if (opts.kind) await modal.getByTestId(`kind-${opts.kind}`).click()

  // 核验 step: confirm against the source material
  await modal.getByRole('checkbox', { name: '确认已核对' }).check()
  await modal.getByTestId('modal-next').click()

  // 应用 step
  await modal.locator('textarea[placeholder="写下准备如何使用、验证或迁移（必填）"]').fill(opts.use ?? '用在下周的宏观复盘文章里。')
  await modal.getByRole('button', { name: '保存到碎片库' }).click()
  await getAnnShadowRoot(page).locator('[data-ann-ui="capture-modal"]').waitFor({ state: 'detached', timeout: 5000 })
}

/** Read the delivery outbox (fragment + asset pending tasks) via the service worker. */
export async function getOutboxFromServiceWorker(context: any): Promise<any[]> {
  const sw = await ensureServiceWorker(context)
  return sw.evaluate(() => {
    return new Promise<any[]>(resolve => {
      const request = indexedDB.open('fragment-store')
      request.onerror = () => resolve([])
      request.onsuccess = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('outboxEvents')) {
          db.close()
          return resolve([])
        }
        const tx = db.transaction('outboxEvents', 'readonly')
        const getAll = tx.objectStore('outboxEvents').getAll()
        getAll.onsuccess = () => {
          db.close()
          resolve(getAll.result || [])
        }
        getAll.onerror = () => resolve([])
      }
    })
  })
}

/** Read screenshot-library records + asset metadata (bytes stay as Blobs). */
export async function getScreenshotsFromServiceWorker(context: any): Promise<any[]> {
  const sw = await ensureServiceWorker(context)
  return sw.evaluate(() => {
    return new Promise<any[]>(resolve => {
      const request = indexedDB.open('fragment-store')
      request.onerror = () => resolve([])
      request.onsuccess = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('screenshots')) {
          db.close()
          return resolve([])
        }
        const tx = db.transaction(['screenshots', 'assets'], 'readonly')
        const getAll = tx.objectStore('screenshots').getAll()
        const assets = tx.objectStore('assets').getAll()
        tx.oncomplete = () => {
          const metaById = new Map((assets.result || []).map((a: any) => [a.metadata.id, a.metadata]))
          db.close()
          resolve((getAll.result || []).map((s: any) => ({ ...s, asset: metaById.get(s.assetId) })))
        }
        tx.onerror = () => resolve([])
      }
    })
  })
}

// ────────────────────────────────────────────────────────────────────────────
// Screenshot capture helpers (shared by the screenshot and Desktop specs)
// ────────────────────────────────────────────────────────────────────────────

/** Fires the capture-screenshot command on the fixture page (screenshot.html). */
export async function triggerScreenshot(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('ann-screenshot-trigger', { detail: { command: 'capture-screenshot' } }))
  })
}

/** Drags a region over the fixture post; returns the selection rectangle in page coordinates. */
export async function dragRegion(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const post = page.getByTestId('screenshot-post')
  const box = await post.boundingBox()
  if (!box) throw new Error('screenshot-post has no bounding box')
  const x = box.x + 5
  const y = box.y + 5
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(box.x + 480, box.y + 160, { steps: 6 })
  await page.mouse.up()
  return { x, y, width: 480 - 5, height: 160 - 5 }
}

/** Image assets (metadata only) held by the extension's fragment store. */
export async function getAssetsFromServiceWorker(context: BrowserContext): Promise<Array<{ id: string; mimeType: string; byteLength: number; sha256: string }>> {
  const sw = await ensureServiceWorker(context)
  return sw.evaluate(() => {
    return new Promise<Array<{ id: string; mimeType: string; byteLength: number; sha256: string }>>(resolve => {
      const request = indexedDB.open('fragment-store')
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
          resolve((getAll.result || []).map((a: { metadata: { id: string; mimeType: string; byteLength: number; sha256: string } }) => a.metadata))
        }
        getAll.onerror = () => resolve([])
      }
    })
  })
}
