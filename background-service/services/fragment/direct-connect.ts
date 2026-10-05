/**
 * Desktop direct connection (docs/v2/storage.md §8): localhost hub on
 * 127.0.0.1:8765, per-item idempotent delivery.
 *
 * The extension commits locally first, then delivers one Fragment per
 * PUT /v1/fragments/{id} and one image per PUT /v1/assets/{id}. Fragments go
 * before their images; an image failure never rolls back the fragment.
 *
 * Status handling:
 *   201/200  → hub persisted → prune the pending event
 *   401/403  → stop auto-retry, surface 重新配对
 *   410      → Desktop locally deleted this id → prune the event, keep local
 *   409/413/422 → deterministic → prune + report (retrying cannot fix it)
 *   network / 5xx → keep events, back off (caller throttles via attempts)
 */

import type { FragmentRecord, ImageAsset, OutboxEvent, OutboxRejection, OutboxRejectionCode } from '../../../learning-core/types'
import type { ChangesPage, SeqChange } from '../../../learning-core/sync'
import { toFragmentWire, fragmentWireHash } from '../../../learning-core/wire'
import { uiText } from '../../../utils/ui-text'

export interface DirectConnectConfig {
  endpoint: string
  token: string
  autoSync: boolean
}

export const DEFAULT_DIRECT_CONNECT: DirectConnectConfig = {
  endpoint: 'http://127.0.0.1:8765',
  token: '',
  autoSync: false,
}

export const DIRECT_CONNECT_STORAGE_KEY = 'desktopDirectConnect'

/** What pages may see of the config: the pairing code itself never leaves the service worker. */
export interface PublicDirectConnectConfig {
  endpoint: string
  autoSync: boolean
  hasToken: boolean
}

export function toPublicConfig(config: DirectConnectConfig): PublicDirectConnectConfig {
  return { endpoint: config.endpoint, autoSync: config.autoSync, hasToken: config.token.length > 0 }
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

/**
 * The hub is the Desktop app on this computer, and every request carries the pairing code as a
 * bearer token. An endpoint anywhere else would hand the code (and every fragment) to that host,
 * so only a plain-http loopback origin is accepted. Returns the normalized origin, or throws.
 */
export function normalizeEndpoint(raw: string): string {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new Error(uiText('desktop.error.invalidUrl'))
  }
  const loopback = url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname) && !url.username && !url.password
  const bare = (url.pathname === '/' || url.pathname === '') && !url.search && !url.hash
  if (!loopback || !bare) throw new Error(uiText('desktop.error.notLoopback'))
  return url.origin
}

export function isLoopbackEndpoint(raw: string): boolean {
  try {
    normalizeEndpoint(raw)
    return true
  } catch {
    return false
  }
}

export interface DirectConnectStatus {
  online: boolean
  paired: boolean
  detail: string
  lastSyncAt?: number
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

export async function pingHub(config: DirectConnectConfig, fetchImpl: typeof fetch = fetch): Promise<DirectConnectStatus> {
  if (!config.token) return { online: false, paired: false, detail: uiText('desktop.status.noToken') }
  try {
    const res = await fetchImpl(`${config.endpoint}/health`, { method: 'GET' })
    if (!res.ok) return { online: false, paired: false, detail: `HTTP ${res.status}` }
    return { online: true, paired: true, detail: uiText('desktop.status.online') }
  } catch {
    return { online: false, paired: true, detail: uiText('desktop.status.unreachable') }
  }
}

export interface DeliveryDeps {
  deviceId: string
  getEvents(): Promise<OutboxEvent[]>
  getFragment(id: string): Promise<FragmentRecord | undefined>
  getAsset(id: string): Promise<{ metadata: ImageAsset; bytes: Blob } | undefined>
  /** Remove tasks: only after Desktop persisted the item, or the local record is gone. */
  prune(eventIds: string[]): Promise<void>
  markAttempt(eventId: string): Promise<void>
  /** Counts a 5xx for this item and returns its new total. */
  markFailure(eventId: string): Promise<number>
  /** Keep the task but stop retrying it automatically; the user sees it and decides. */
  reject(eventId: string, rejection: OutboxRejection): Promise<void>
}

export interface DeliveryResult {
  deliveredFragments: number
  deliveredAssets: number
  /** Tasks removed from the queue: delivered, or their local record no longer exists. */
  pruned: number
  /** Items Desktop refused for good during this run; they stay queued, marked rejected. */
  rejected: number
  errors: string[]
  /** True on 401/403 — auto-retry must stop until re-paired. */
  authFailed: boolean
  /** Desktop could not be reached at all — everything stays queued for a later retry. */
  unreachable: boolean
}

type FragmentDeliveryPayload = { fragmentId: string; revision: number }
type AssetDeliveryPayload = { assetId: string }

const isFragmentEvent = (e: OutboxEvent) => e.type === 'fragment.created' || e.type === 'fragment.updated'

/** Server errors on one item before it stops being retried automatically. */
export const MAX_SERVER_FAILURES = 5
/** Server errors in a row (across items) after which this run gives up: Desktop itself is unwell. */
const MAX_CONSECUTIVE_SERVER_ERRORS = 3

/**
 * Responses that can never succeed on retry, mapped to a kept-but-parked task. A task is only
 * deleted when Desktop confirms it stored the item (200/201); anything else the user must be
 * able to see, so a refusal is recorded on the task instead of dropping it.
 */
function rejectionFor(status: number, label: string): { code: OutboxRejectionCode; message: string } {
  switch (status) {
    case 410:
      return { code: 'DESKTOP_DELETED', message: uiText('desktop.item.deleted', { label }) }
    case 409:
      return { code: 'CONFLICT', message: uiText('desktop.item.conflict', { label }) }
    case 413:
      return { code: 'TOO_LARGE', message: uiText('desktop.item.tooLarge', { label }) }
    case 422:
      return { code: 'INVALID', message: uiText('desktop.item.invalid', { label }) }
    default:
      return { code: 'REJECTED', message: uiText('desktop.item.rejected', { label, status }) }
  }
}

export async function flushPendingDeliveries(config: DirectConnectConfig, deps: DeliveryDeps, fetchImpl: typeof fetch = fetch): Promise<DeliveryResult> {
  const result: DeliveryResult = { deliveredFragments: 0, deliveredAssets: 0, pruned: 0, rejected: 0, errors: [], authFailed: false, unreachable: false }
  if (!config.token) {
    result.errors.push(uiText('desktop.status.noToken'))
    return result
  }

  // Rejected items wait for the user; they are not retried here.
  const events = (await deps.getEvents()).filter(event => !event.rejection)
  const ordered = [...events.filter(isFragmentEvent), ...events.filter(e => e.type === 'asset.created')]
  const prunable: string[] = []
  let consecutiveServerErrors = 0

  type Outcome = 'delivered' | 'next' | 'stop'

  /** What every non-success answer means, shared by fragments and images. */
  const settle = async (event: OutboxEvent, status: number, label: string): Promise<Outcome> => {
    if (status === 401 || status === 403) {
      result.authFailed = true
      result.errors.push(uiText(status === 401 ? 'desktop.error.tokenMismatch' : 'desktop.error.originRejected'))
      return 'stop'
    }
    if (status >= 500) {
      // One item that always fails must not hold up the rest of the queue: count it, move on, and
      // park it after repeated failures. Several in a row means Desktop itself is down.
      consecutiveServerErrors++
      const failures = await deps.markFailure(event.eventId)
      if (failures >= MAX_SERVER_FAILURES) {
        await deps.reject(event.eventId, { code: 'DESKTOP_ERROR', status, at: Date.now() })
        result.rejected++
        result.errors.push(uiText('desktop.item.parked', { label, status }))
      } else {
        result.errors.push(uiText('desktop.item.retryLater', { label, status }))
      }
      return consecutiveServerErrors >= MAX_CONSECUTIVE_SERVER_ERRORS ? 'stop' : 'next'
    }
    const { code, message } = rejectionFor(status, label)
    await deps.reject(event.eventId, { code, status, at: Date.now() })
    result.rejected++
    result.errors.push(message)
    return 'next'
  }

  const unreachable = (): Outcome => {
    result.unreachable = true
    result.errors.push(uiText('desktop.status.unreachable'))
    return 'stop'
  }

  for (const event of ordered) {
    if (result.authFailed || result.unreachable) break
    await deps.markAttempt(event.eventId)

    let outcome: Outcome
    if (isFragmentEvent(event)) {
      const { fragmentId } = event.payload as FragmentDeliveryPayload
      const fragment = await deps.getFragment(fragmentId)
      if (!fragment) {
        // Locally deleted — its pending task dies with it (storage.md §10).
        prunable.push(event.eventId)
        continue
      }
      let wire: ReturnType<typeof toFragmentWire>
      let hash: string
      try {
        wire = toFragmentWire(fragment)
        hash = await fragmentWireHash(wire)
      } catch (error) {
        // A record that cannot be serialized must not abort the run and block every item behind it.
        await deps.reject(event.eventId, { code: 'LOCAL_INVALID', status: 0, at: Date.now() })
        result.rejected++
        result.errors.push(uiText('desktop.item.localInvalid', { id: fragmentId, error: error instanceof Error ? error.message : String(error) }))
        continue
      }
      let res: Response
      try {
        res = await fetchImpl(`${config.endpoint}/v1/fragments/${encodeURIComponent(fragmentId)}`, {
          method: 'PUT',
          headers: { ...authHeaders(config.token), 'Content-Type': 'application/json', 'X-AnnHub-Sha256': hash },
          body: JSON.stringify({ deviceId: deps.deviceId, fragment: wire }),
        })
      } catch {
        unreachable()
        break
      }
      if (res.status === 200 || res.status === 201) {
        result.deliveredFragments++
        outcome = 'delivered'
      } else {
        outcome = await settle(event, res.status, uiText('desktop.label.fragment', { id: fragmentId }))
      }
    } else if (event.type === 'asset.created') {
      const { assetId } = event.payload as AssetDeliveryPayload
      const asset = await deps.getAsset(assetId)
      if (!asset) {
        prunable.push(event.eventId)
        continue
      }
      let res: Response
      try {
        res = await fetchImpl(`${config.endpoint}/v1/assets/${encodeURIComponent(assetId)}`, {
          method: 'PUT',
          headers: {
            ...authHeaders(config.token),
            'Content-Type': asset.metadata.mimeType,
            'X-AnnHub-Sha256': asset.metadata.sha256,
            'X-AnnHub-Byte-Length': String(asset.metadata.byteLength),
          },
          body: asset.bytes,
        })
      } catch {
        unreachable()
        break
      }
      if (res.status === 200 || res.status === 201) {
        result.deliveredAssets++
        outcome = 'delivered'
      } else {
        outcome = await settle(event, res.status, uiText('desktop.label.image', { id: assetId }))
      }
    } else {
      continue
    }

    if (outcome === 'delivered') {
      consecutiveServerErrors = 0
      prunable.push(event.eventId)
    } else if (outcome === 'stop') {
      break
    }
  }

  if (prunable.length) await deps.prune(prunable)
  result.pruned += prunable.length
  return result
}

// ── R3: Desktop → extension change feed + event batch (storage.md §9) ────

export interface PullDeps {
  getCursor(): Promise<string | undefined>
  setCursor(cursor: string): Promise<void>
  /** Feed pages always carry seq; the store accepts plain DesktopChange too. */
  apply(changes: SeqChange[]): Promise<{ reports: unknown[] }>
}

export interface PullResult {
  appliedChanges: number
  reports: number
  nextCursor?: string
  errors: string[]
  authFailed: boolean
  unreachable: boolean
}

/**
 * Drains /v1/changes with the persisted cursor: apply batch → advance cursor
 * → repeat. The cursor only moves after the batch persisted locally, so an
 * interrupted pull resumes exactly where it stopped.
 */
export async function pullDesktopChanges(config: DirectConnectConfig, deps: PullDeps, fetchImpl: typeof fetch = fetch): Promise<PullResult> {
  const result: PullResult = { appliedChanges: 0, reports: 0, errors: [], authFailed: false, unreachable: false }
  if (!config.token) {
    result.errors.push(uiText('desktop.status.noToken'))
    return result
  }
  let cursor = await deps.getCursor()
  for (let guard = 0; guard < 100; guard++) {
    let res: Response
    try {
      res = await fetchImpl(`${config.endpoint}/v1/changes?cursor=${encodeURIComponent(cursor ?? '0')}&limit=200`, {
        headers: authHeaders(config.token),
      })
    } catch {
      result.unreachable = true
      result.errors.push(uiText('desktop.status.unreachable'))
      break
    }
    if (res.status === 401 || res.status === 403) {
      result.authFailed = true
      result.errors.push(uiText('desktop.error.tokenMismatch'))
      break
    }
    if (!res.ok) {
      result.errors.push(uiText('desktop.error.pullFailed', { status: res.status }))
      break
    }
    const page = (await res.json()) as ChangesPage
    if (!page.changes?.length) {
      result.nextCursor = cursor
      break
    }
    const applied = await deps.apply(page.changes as SeqChange[])
    result.appliedChanges += page.changes.length
    result.reports += applied.reports.length
    cursor = page.nextCursor ?? String(page.changes[page.changes.length - 1]?.seq ?? '')
    if (!cursor) break
    await deps.setCursor(cursor)
    if (!page.nextCursor) break
  }
  return result
}
