import type { Page, Locator } from '@playwright/test'

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
    await page.evaluate((sel) => {
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
    let [sw] = context.serviceWorkers()
    if (!sw) sw = await context.waitForEvent('serviceworker')
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
        return new Promise<any[]>((resolve) => {
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
        return new Promise<void>((resolve) => {
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
 * Get the active service worker, waiting for it if necessary.
 */
async function ensureServiceWorker(context: any) {
    let [sw] = context.serviceWorkers()
    if (!sw) sw = await context.waitForEvent('serviceworker')
    return sw
}

/**
 * Clear clips storage via the service worker.
 */
export async function clearClipsFromServiceWorker(context: any): Promise<void> {
    let [sw] = context.serviceWorkers()
    if (!sw) sw = await context.waitForEvent('serviceworker')
    await sw.evaluate(() => {
        return new Promise<void>((resolve) => {
            chrome.storage.local.remove('ann-clips', () => resolve())
        })
    })
}
