/**
 * Sender checks shared by every service. Content scripts run inside web pages,
 * so a message from one is only as trustworthy as the page; messages that read
 * or change user data and configuration must come from an extension page.
 */
import MessageUtils from '../utils/message'
import type { ResponseMessage } from '../types/messages'

export function isExtensionPageSender(sender: chrome.runtime.MessageSender): boolean {
  const url = sender.url ?? ''
  if (url.startsWith(chrome.runtime.getURL(''))) return true
  // Some extension contexts report an empty sender.url; a tab-less sender with our id is still ours.
  return !sender.tab && sender.id === chrome.runtime.id
}

/** A message from the top frame of a browser tab: a content script on the page, or an extension page open in a tab. */
export function isTopFrameTabSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.tab?.id !== undefined && sender.frameId === 0
}

/** A child content script is trusted for capture only if Chrome reports the top tab's same origin. */
export function isSameOriginTabSender(sender: chrome.runtime.MessageSender): boolean {
  if (isTopFrameTabSender(sender)) return true
  if (sender.tab?.id === undefined || sender.frameId === undefined || sender.frameId <= 0 || !sender.url || !sender.tab.url) return false
  try {
    return new URL(sender.url).origin === new URL(sender.tab.url).origin
  } catch {
    return false
  }
}

/**
 * The captures a content script may still undo or edit: the entries its own frame just saved. They are
 * kept in `chrome.storage.session`, because an MV3 service worker is recycled after ~30 s idle — long
 * before a user finishes typing a note into the quick-edit bubble — and a worker that forgot the
 * capture would refuse the edit for good. The session area lives in memory for the browser session and
 * is closed to content scripts by default; where it does not exist (unit tests) the worker's own map
 * answers.
 */
const RECENT_PREFIX = 'annhub.capture:'
const RECENT_WINDOW_MS = 10 * 60_000
const RECENT_LIMIT = 20

interface RecentCapture {
  id: string
  at: number
}

const recentCaptures = new Map<string, RecentCapture[]>()
let pendingRemember: Promise<unknown> = Promise.resolve()

const captureKey = (sender: chrome.runtime.MessageSender): string => `${RECENT_PREFIX}${sender.tab!.id}:${sender.frameId}`

function sessionArea(): chrome.storage.StorageArea | undefined {
  return typeof chrome === 'undefined' ? undefined : chrome.storage?.session
}

function stillRecent(list: RecentCapture[], now: number): RecentCapture[] {
  return list.filter(item => now - item.at < RECENT_WINDOW_MS).slice(-RECENT_LIMIT)
}

async function readRecent(key: string): Promise<RecentCapture[]> {
  const known = recentCaptures.get(key)
  if (known) return known
  try {
    const stored = (await sessionArea()?.get(key))?.[key]
    if (Array.isArray(stored)) {
      recentCaptures.set(key, stored as RecentCapture[])
      return stored as RecentCapture[]
    }
  } catch {
    /* an unreadable session area is an empty one */
  }
  return []
}

/** Drops the entries of frames that have not saved anything within the window (closed tabs leave them behind). */
async function pruneSession(area: chrome.storage.StorageArea, now: number): Promise<void> {
  const all = await area.get(null)
  const stale = Object.entries(all)
    .filter(([key, value]) => key.startsWith(RECENT_PREFIX) && Array.isArray(value) && stillRecent(value as RecentCapture[], now).length === 0)
    .map(([key]) => key)
  if (stale.length > 0) await area.remove(stale)
}

export function rememberCapture(sender: chrome.runtime.MessageSender, id: string): Promise<void> {
  if (!isSameOriginTabSender(sender)) return Promise.resolve()
  const key = captureKey(sender)
  const write = pendingRemember
    .catch(() => undefined)
    .then(async () => {
      const now = Date.now()
      const next = stillRecent([...(await readRecent(key)), { id, at: now }], now)
      recentCaptures.set(key, next)
      const area = sessionArea()
      if (!area) return
      try {
        await area.set({ [key]: next })
        await pruneSession(area, now)
      } catch {
        /* the worker's own map still answers while it lives */
      }
    })
  pendingRemember = write
  return write
}

export async function isRecentCapture(sender: chrome.runtime.MessageSender, id: string): Promise<boolean> {
  if (!isSameOriginTabSender(sender)) return false
  await pendingRemember.catch(() => undefined)
  return stillRecent(await readRecent(captureKey(sender)), Date.now()).some(item => item.id === id)
}

export function forbiddenResponse(): ResponseMessage {
  return MessageUtils.createResponse(false, undefined, 'Forbidden: extension page context required')
}
