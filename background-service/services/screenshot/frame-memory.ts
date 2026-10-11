/**
 * The screenshot's last frame (screenshot.md §1.4): one per tab, for the page — origin and path — it was taken on.
 * Only the worker reads and writes it, in `chrome.storage.session`: in memory for the browser session, kept while the
 * worker is recycled, gone after a restart. That area stays closed to content scripts (the default; never widen it
 * with `setAccessLevel`): the page's own scripts never see a frame, and `sender.ts` keeps the captures it trusts there.
 *
 * The tab moving to another page, or closing, forgets its frame; a reload, another query or another fragment keep it.
 * Tab events wake the worker, and a tab whose title ticks would keep it awake, so the listeners are on only while some
 * tab has a frame: `listenForFrames` adds them at the top level of the worker script, where an event that wakes the
 * worker finds them, and they come off once no frame is left.
 */
import type { FrameRecord } from '../../../types/messages'

const PREFIX = 'annhub.frame:'
/** A selector longer than this is not one the session builds. */
const MAX_SELECTOR_CHARS = 2000

interface StoredFrame {
  page: string
  record: FrameRecord
}

const keyFor = (tabId: number): string => `${PREFIX}${tabId}`

function area(): chrome.storage.StorageArea | undefined {
  return typeof chrome === 'undefined' ? undefined : chrome.storage?.session
}

/** The page a frame belongs to: scheme, host and path. Null for an address the tab does not let us read. */
export function pageOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`
  } catch {
    return null
  }
}

/** A frame as the session builds it, field by field; anything else from a content script is refused. */
export function frameRecordFrom(value: unknown): FrameRecord | null {
  if (!value || typeof value !== 'object') return null
  const { kind, selector, margin, pageX, pageY, width, height } = value as Record<string, unknown>
  const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
  if (!finite(pageX) || !finite(pageY) || !finite(width) || !finite(height) || width <= 0 || height <= 0) return null
  if (kind === 'box') return { kind, pageX, pageY, width, height }
  if (kind !== 'element' || typeof selector !== 'string' || !selector || selector.length > MAX_SELECTOR_CHARS || !finite(margin) || margin < 0) return null
  return { kind, selector, margin, pageX, pageY, width, height }
}

async function storedFrame(tabId: number): Promise<StoredFrame | undefined> {
  const key = keyFor(tabId)
  return ((await area()?.get(key)) ?? {})[key] as StoredFrame | undefined
}

/** Keeps this frame for the tab, in place of the one before; on a page without an address nothing is kept. */
export async function rememberFrame(tabId: number, url: string | undefined, record: FrameRecord): Promise<void> {
  const page = pageOf(url)
  if (!page) return
  generation++
  listen(true)
  await area()?.set({ [keyFor(tabId)]: { page, record } satisfies StoredFrame })
}

/** The tab's frame when it was taken on this page; a frame from another page is forgotten. */
export async function readFrame(tabId: number, url: string | undefined): Promise<FrameRecord | null> {
  const stored = await storedFrame(tabId)
  if (!stored) return null
  if (stored.page === pageOf(url)) return stored.record
  await forget(tabId)
  return null
}

async function forget(tabId: number): Promise<void> {
  await area()?.remove(keyFor(tabId))
  await settle()
}

// ── Tab events: listening only while a tab has a frame ──────────────────

let listening = false
/** Counts frames kept, so a check that found none does not take the listeners off a frame kept meanwhile. */
let generation = 0

function onUpdated(tabId: number, change: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab): void {
  // a new address, or a load starting or ending; a page the extension may not read reports no address at all
  if (change.url === undefined && change.status === undefined) return
  void forgetUnlessOn(tabId, pageOf(change.url ?? tab.url))
}

async function forgetUnlessOn(tabId: number, page: string | null): Promise<void> {
  const stored = await storedFrame(tabId)
  if (stored && stored.page !== page) await forget(tabId)
}

function onRemoved(tabId: number): void {
  void forget(tabId)
}

/** A tab swapped for a prerendered one is a tab that went to another page. */
function onReplaced(_addedTabId: number, removedTabId: number): void {
  void forget(removedTabId)
}

function listen(on: boolean): void {
  if (on === listening || typeof chrome === 'undefined' || !chrome.tabs?.onUpdated) return
  listening = on
  if (on) {
    chrome.tabs.onUpdated.addListener(onUpdated)
    chrome.tabs.onRemoved.addListener(onRemoved)
    chrome.tabs.onReplaced.addListener(onReplaced)
  } else {
    chrome.tabs.onUpdated.removeListener(onUpdated)
    chrome.tabs.onRemoved.removeListener(onRemoved)
    chrome.tabs.onReplaced.removeListener(onReplaced)
  }
}

/** Takes the listeners off once no tab has a frame. */
async function settle(): Promise<void> {
  const before = generation
  const all = (await area()?.get(null)) ?? {}
  if (generation === before && !Object.keys(all).some(key => key.startsWith(PREFIX))) listen(false)
}

/**
 * Called once, synchronously, at the top level of the worker script: a worker that a tab event woke must have its
 * listeners before that event is delivered. Without any frame they come off again at once.
 */
export function listenForFrames(): void {
  listen(true)
  void settle()
}
