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

import type { FragmentRecord, ImageAsset, OutboxEvent } from '../../../learning-core/types'
import type { ChangesPage, SeqChange } from '../../../learning-core/sync'
import { toFragmentWire, fragmentWireHash } from '../../../learning-core/wire'

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
    throw new Error('接口地址不是有效的 URL')
  }
  const loopback = url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname) && !url.username && !url.password
  const bare = (url.pathname === '/' || url.pathname === '') && !url.search && !url.hash
  if (!loopback || !bare) throw new Error('接口地址必须是本机的 Desktop 服务，例如 http://127.0.0.1:8765')
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
  if (!config.token) return { online: false, paired: false, detail: '未配置配对码（在 Desktop 的「系统」页复制）' }
  try {
    const res = await fetchImpl(`${config.endpoint}/health`, { method: 'GET' })
    if (!res.ok) return { online: false, paired: false, detail: `HTTP ${res.status}` }
    return { online: true, paired: true, detail: '在线' }
  } catch {
    return { online: false, paired: true, detail: 'Desktop 未运行或端口不可达' }
  }
}

export interface DeliveryDeps {
  deviceId: string
  getEvents(): Promise<OutboxEvent[]>
  getFragment(id: string): Promise<FragmentRecord | undefined>
  getAsset(id: string): Promise<{ metadata: ImageAsset; bytes: Blob } | undefined>
  /** Prune after the hub confirms persistence (or a deterministic failure). */
  prune(eventIds: string[]): Promise<void>
  markAttempt(eventId: string): Promise<void>
}

export interface DeliveryResult {
  deliveredFragments: number
  deliveredAssets: number
  pruned: number
  errors: string[]
  /** True on 401/403 — auto-retry must stop until re-paired. */
  authFailed: boolean
  /** Desktop unreachable (or 5xx) — pending events stay for a later retry. */
  unreachable: boolean
}

type FragmentDeliveryPayload = { fragmentId: string; revision: number }
type AssetDeliveryPayload = { assetId: string }

const isFragmentEvent = (e: OutboxEvent) => e.type === 'fragment.created' || e.type === 'fragment.updated'

export async function flushPendingDeliveries(config: DirectConnectConfig, deps: DeliveryDeps, fetchImpl: typeof fetch = fetch): Promise<DeliveryResult> {
  const result: DeliveryResult = { deliveredFragments: 0, deliveredAssets: 0, pruned: 0, errors: [], authFailed: false, unreachable: false }
  if (!config.token) {
    result.errors.push('未配置配对码（在 Desktop 的「系统」页复制）')
    return result
  }

  const events = await deps.getEvents()
  const ordered = [...events.filter(isFragmentEvent), ...events.filter(e => e.type === 'asset.created')]
  const prunable: string[] = []

  const handleAuthFailure = (status: number) => {
    result.authFailed = true
    result.errors.push(status === 401 ? '配对码不匹配（Desktop 已与其他配对码配对，请重新配对）' : '来源被拒绝（403）')
  }

  for (const event of ordered) {
    if (result.authFailed || result.unreachable) break

    if (isFragmentEvent(event)) {
      const { fragmentId } = event.payload as FragmentDeliveryPayload
      await deps.markAttempt(event.eventId)
      const fragment = await deps.getFragment(fragmentId)
      if (!fragment) {
        // Locally deleted — its pending task dies with it (storage.md §10).
        prunable.push(event.eventId)
        continue
      }
      const wire = toFragmentWire(fragment)
      const hash = await fragmentWireHash(wire)
      let res: Response
      try {
        res = await fetchImpl(`${config.endpoint}/v1/fragments/${encodeURIComponent(fragmentId)}`, {
          method: 'PUT',
          headers: { ...authHeaders(config.token), 'Content-Type': 'application/json', 'X-AnnHub-Sha256': hash },
          body: JSON.stringify({ deviceId: deps.deviceId, fragment: wire }),
        })
      } catch {
        result.unreachable = true
        result.errors.push('Desktop 未运行或端口不可达')
        break
      }
      if (res.status === 201 || res.status === 200) {
        prunable.push(event.eventId)
        result.deliveredFragments++
        continue
      }
      if (res.status === 401 || res.status === 403) {
        handleAuthFailure(res.status)
        break
      }
      if (res.status === 410) {
        prunable.push(event.eventId)
        result.pruned++
        result.errors.push(`Desktop 已本地删除 ${fragmentId}，不再重试该条`)
        continue
      }
      if (res.status === 409) {
        prunable.push(event.eventId)
        result.errors.push(`Fragment ${fragmentId} 与 Desktop 记录冲突（409），已跳过`)
        continue
      }
      if (res.status === 422) {
        prunable.push(event.eventId)
        result.errors.push(`Fragment ${fragmentId} 未通过 Desktop 校验（422）`)
        continue
      }
      if (res.status >= 500) {
        result.unreachable = true
        result.errors.push(`Desktop 错误 HTTP ${res.status}，稍后重试`)
        break
      }
      prunable.push(event.eventId)
      result.errors.push(`Fragment ${fragmentId} 交付失败 HTTP ${res.status}`)
      continue
    }

    if (event.type === 'asset.created') {
      const { assetId } = event.payload as AssetDeliveryPayload
      await deps.markAttempt(event.eventId)
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
        result.unreachable = true
        result.errors.push('Desktop 未运行或端口不可达')
        break
      }
      if (res.status === 201 || res.status === 200) {
        prunable.push(event.eventId)
        result.deliveredAssets++
        continue
      }
      if (res.status === 401 || res.status === 403) {
        handleAuthFailure(res.status)
        break
      }
      if (res.status === 410) {
        prunable.push(event.eventId)
        continue
      }
      if (res.status === 409 || res.status === 413 || res.status === 422) {
        // Deterministic: retrying the same bytes cannot succeed.
        prunable.push(event.eventId)
        result.errors.push(res.status === 413 ? `图片 ${assetId} 超过双方上限，未交付（本地已保留）` : `图片 ${assetId} 交付失败 HTTP ${res.status}`)
        continue
      }
      if (res.status >= 500) {
        result.unreachable = true
        result.errors.push(`Desktop 错误 HTTP ${res.status}，稍后重试`)
        break
      }
      prunable.push(event.eventId)
      result.errors.push(`图片 ${assetId} 交付失败 HTTP ${res.status}`)
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
    result.errors.push('未配置配对码（在 Desktop 的「系统」页复制）')
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
      result.errors.push('Desktop 未运行或端口不可达')
      break
    }
    if (res.status === 401 || res.status === 403) {
      result.authFailed = true
      result.errors.push('配对码不匹配（Desktop 已与其他配对码配对，请重新配对）')
      break
    }
    if (!res.ok) {
      result.errors.push(`拉取变更失败 HTTP ${res.status}`)
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
