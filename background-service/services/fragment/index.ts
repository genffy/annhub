/**
 * FragmentService — extension-side ownership of the learning core store.
 * Contract: docs/v2/storage.md; the Extension implements L1+L2 only
 * (capture + query + per-item delivery), never review scheduling.
 */
import { IService } from '../../service-manager'
import { ResponseMessage } from '../../../types/messages'
import { Logger } from '../../../utils/logger'
import { FragmentStore, type FragmentPatch, type FragmentSaveOutcome } from '../../../learning-core/fragment-store'
import type { CreateFragmentInput } from '../../../learning-core/factory'
import type { FragmentRecord, FragmentLocator, VerifiedResult } from '../../../learning-core/types'
import { runFragmentQuery, type FragmentQuery, type FragmentQueryResult } from '../../../learning-core/query'
import { normalizeHost } from '../../../learning-core/normalize'
import { buildExportZip, type ExportManifest, type ExportHighlight, type ExportClip } from '../../../learning-core/markdown-export'
import { quotaAvailable } from '../../../utils/storage-quota'
import { HighlightService } from '../highlight'
import { ClipService } from '../clip'
import type { SaveFragmentInput } from '../../../types/messages'
import {
  DEFAULT_DIRECT_CONNECT, DIRECT_CONNECT_STORAGE_KEY, flushPendingDeliveries, pingHub, pullDesktopChanges,
  type DirectConnectConfig, type DirectConnectStatus, type DeliveryResult, type PullResult,
} from './direct-connect'
import { fragmentMessageHandlers } from './message-handles'

const DEVICE_ID_KEY = 'fragmentDeviceId'
const CAPTURE_CONFIG_KEY = 'fragmentCaptureConfigV2'
const DELIVERY_STATE_KEY = 'fragmentDeliveryState'

export interface CaptureConfig {
  /** Deep mode adds the 理解 (guess) step to every capture modal (extension PRD §4.2). */
  deepMode: boolean
}

export const DEFAULT_CAPTURE_CONFIG: CaptureConfig = { deepMode: false }

export interface DeliveryState {
  lastSyncAt?: number
  lastError?: string
  lastResult?: DeliveryResult
  /** R3 pull state (storage.md §9). */
  lastPullAt?: number
  lastPull?: Pick<PullResult, 'appliedChanges' | 'reports' | 'errors' | 'authFailed' | 'unreachable'>
}

/** Capture funnel counters (R1.4) — events only, never content. */
export interface CaptureMetrics {
  modalOpened: number
  reachedVerify: number
  reachedApply: number
  saved: number
  /** step at which the user exited without saving, counted per step. */
  exited: Record<string, number>
  /** `capture.exited` with typed input — the denominator of M-16 (metrics.md). */
  exitedWithInput: number
  /** Safe exits used when abandoning with input (`fallback` of `capture.exited`). */
  fallbacks: { highlight: number; clip: number }
}

export type ExitFallback = 'none' | 'highlight' | 'clip'

export const EMPTY_CAPTURE_METRICS: CaptureMetrics = {
  modalOpened: 0,
  reachedVerify: 0,
  reachedApply: 0,
  saved: 0,
  exited: {},
  exitedWithInput: 0,
  fallbacks: { highlight: 0, clip: 0 },
}
const METRICS_KEY = 'annhubCaptureMetrics'

export class FragmentService implements IService {
  readonly name = 'fragment' as const
  private static instance: FragmentService | null = null
  private store: FragmentStore
  private initialized = false
  private flushInFlight: Promise<DeliveryResult> | null = null

  private constructor() {
    this.store = new FragmentStore('fragment-store')
  }

  static getInstance(): FragmentService {
    if (!FragmentService.instance) {
      FragmentService.instance = new FragmentService()
    }
    return FragmentService.instance
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    await this.store.initialize()
    await this.ensureDeviceId()
    this.initialized = true
    Logger.info('[FragmentService] Initialized (fragment-store)')
  }

  private async ensureDeviceId(): Promise<void> {
    const result = await chrome.storage.local.get(DEVICE_ID_KEY)
    let deviceId = result[DEVICE_ID_KEY] as string | undefined
    if (!deviceId) {
      deviceId = crypto.randomUUID()
      await chrome.storage.local.set({ [DEVICE_ID_KEY]: deviceId })
    }
    this.store.deviceId = deviceId
  }

  getMessageHandlers(): Record<string, (message: any, sender: chrome.runtime.MessageSender) => Promise<ResponseMessage>> {
    return fragmentMessageHandlers
  }

  isInitialized(): boolean {
    return this.initialized
  }

  async cleanup(): Promise<void> {
    this.initialized = false
  }

  getStore(): FragmentStore {
    return this.store
  }

  // ── store facade ─────────────────────────────────────────────────────

  /**
   * Adapt the wire input (SaveFragmentInput) to the shared factory input.
   * sourceHost is recomputed here via the single normalization rule — callers
   * never roll their own. `annhub://` local sources pass their fixed hosts.
   */
  async saveFragment(input: SaveFragmentInput, force?: boolean): Promise<FragmentSaveOutcome> {
    // detail arrives as an untyped per-kind block; the factory's runtime
    // validator (assertValid) is the gate, the cast only satisfies DetailOf<K>.
    const factoryInput = {
      kind: input.kind,
      content: input.content,
      context: {
        excerpt: input.excerpt,
        sourceUrl: input.sourceUrl,
        sourceHost: localSourceHost(input.sourceUrl),
        sourceTitle: input.sourceTitle,
        locator: input.locator ?? { type: 'none' },
      },
      processing: { guess: input.guess, verified: input.verified, use: input.use },
      detail: input.detail,
      tags: input.tags,
    } as unknown as CreateFragmentInput<FragmentRecord['kind']>
    // Quota is checked BEFORE the write: success must never be shown ahead of a failed commit (storage.md §5).
    if (!(await quotaAvailable(new TextEncoder().encode(JSON.stringify(factoryInput)).length * 2))) {
      return { success: false, error: 'QUOTA_EXCEEDED' }
    }
    return this.store.saveFragment(factoryInput, { force })
  }

  async queryFragments(query?: FragmentQuery): Promise<FragmentQueryResult> {
    const all = await this.store.getAllFragments()
    return runFragmentQuery(all, query ?? {})
  }

  /**
   * Capture-field edit (fragments.md §7): changing content / excerpt /
   * sourceUrl / kind / verification source requires a fresh explicit
   * confirmation in the same request; the store bumps captureRevision.
   */
  async editFragment(id: string, patch: FragmentPatch): Promise<FragmentSaveOutcome> {
    const existing = await this.store.getFragment(id)
    if (!existing) return { success: false, error: 'NOT_FOUND' }
    const touchesProtected =
      (patch.content !== undefined && patch.content.trim() !== existing.content.trim()) ||
      (patch.excerpt !== undefined && patch.excerpt !== existing.context.excerpt) ||
      (patch.sourceUrl !== undefined && patch.sourceUrl !== existing.context.sourceUrl) ||
      (patch.kind !== undefined && patch.kind !== existing.kind) ||
      (patch.verified !== undefined && patch.verified.source !== existing.processing.verified.source)
    if (touchesProtected && patch.verified === undefined) {
      return { success: false, error: 'VERIFICATION_REQUIRED' }
    }
    return this.store.editFragment(id, patch)
  }

  deleteFragment(id: string) {
    return this.store.deleteFragment(id)
  }

  findDuplicate(content: string, excerpt: string, sourceUrl: string) {
    return this.store.findDuplicate({ content, excerpt, sourceUrl })
  }

  getStats() {
    return this.store.getStats()
  }

  getDeliveryStats() {
    return this.store.getDeliveryStats()
  }

  findOrphanAssets() {
    return this.store.findOrphanAssets()
  }

  cleanupOrphanAssets() {
    return this.store.cleanupOrphanAssets()
  }

  // ── the single user export: Markdown + images ZIP (storage.md §7) ────

  async exportContentZip(): Promise<{ blob: Blob; manifest: ExportManifest }> {
    const [fragments, highlights, clips, screenshots] = await Promise.all([
      this.store.getAllFragments(),
      HighlightService.getInstance().getHighlights(),
      ClipService.getInstance().getClips(),
      this.store.listScreenshots(),
    ])
    const exportHighlights: ExportHighlight[] = highlights
      .filter(h => h.status === 'active')
      .map(h => ({
        id: h.id,
        text: h.originalText,
        note: h.user_note,
        sourceUrl: h.metadata.sourceUrl ?? h.url,
        sourceTitle: h.metadata.pageTitle,
        createdAt: h.timestamp,
      }))
    const exportClips: ExportClip[] = clips.map(c => ({
      id: c.id,
      text: c.content,
      sourceUrl: c.source_detail_url ?? c.source_url,
      sourceTitle: c.source_title,
      createdAt: Date.parse(c.capture_time) || Date.now(),
    }))
    return buildExportZip({
      exportedAt: Date.now(),
      fragments,
      highlights: exportHighlights,
      clips: exportClips,
      screenshots: screenshots.map(({ asset, ...record }) => record),
      getAsset: async id => this.store.getAsset(id),
    })
  }

  // ── capture config (chrome.storage.local — preferences never enter the learning core) ──

  async getCaptureConfig(): Promise<CaptureConfig> {
    const result = await chrome.storage.local.get(CAPTURE_CONFIG_KEY)
    const stored = result[CAPTURE_CONFIG_KEY] as Partial<CaptureConfig> | undefined
    return { ...DEFAULT_CAPTURE_CONFIG, ...(stored ?? {}) }
  }

  async setCaptureConfig(config: Partial<CaptureConfig>): Promise<CaptureConfig> {
    const current = await this.getCaptureConfig()
    const next = { ...current, ...config }
    await chrome.storage.local.set({ [CAPTURE_CONFIG_KEY]: next })
    return next
  }

  // ── Desktop per-item delivery (storage.md §8) ────────────────────────

  async getDirectConnectConfig(): Promise<DirectConnectConfig> {
    const result = await chrome.storage.local.get(DIRECT_CONNECT_STORAGE_KEY)
    const stored = result[DIRECT_CONNECT_STORAGE_KEY] as Partial<DirectConnectConfig> | undefined
    return { ...DEFAULT_DIRECT_CONNECT, ...(stored ?? {}) }
  }

  async setDirectConnectConfig(config: Partial<DirectConnectConfig>): Promise<DirectConnectConfig> {
    const current = await this.getDirectConnectConfig()
    const next = { ...current, ...config }
    await chrome.storage.local.set({ [DIRECT_CONNECT_STORAGE_KEY]: next })
    return next
  }

  async pingDirectConnect(): Promise<DirectConnectStatus> {
    return pingHub(await this.getDirectConnectConfig())
  }

  async getDeliveryState(): Promise<DeliveryState> {
    const result = await chrome.storage.local.get(DELIVERY_STATE_KEY)
    return (result[DELIVERY_STATE_KEY] as DeliveryState | undefined) ?? {}
  }

  private async setDeliveryState(state: DeliveryState): Promise<void> {
    await chrome.storage.local.set({ [DELIVERY_STATE_KEY]: state })
  }

  /** Delivers pending fragments + assets; safe to call concurrently (single flight). */
  async flushDeliveries(): Promise<DeliveryResult> {
    if (this.flushInFlight) return this.flushInFlight
    this.flushInFlight = this.doFlush().finally(() => {
      this.flushInFlight = null
    })
    return this.flushInFlight
  }

  private async doFlush(): Promise<DeliveryResult> {
    const config = await this.getDirectConnectConfig()
    const result = await flushPendingDeliveries(config, {
      deviceId: this.store.deviceId,
      getEvents: () => this.store.getOutboxEvents(),
      getFragment: id => this.store.getFragment(id),
      getAsset: id => this.store.getAsset(id),
      prune: ids => this.store.pruneEvents(ids),
      markAttempt: id => this.store.markEventAttempt(id),
    })
    const deliveryState: DeliveryState = { lastSyncAt: Date.now(), lastResult: result, lastError: result.errors[0] }

    // R3: after delivery, drain Desktop-originated review changes. Auth
    // failure stops both directions.
    if (config.token && !result.authFailed) {
      const pull = await pullDesktopChanges(config, {
        getCursor: () => this.store.getSyncCursor(),
        setCursor: cursor => this.store.setSyncCursor(cursor),
        apply: changes => this.store.applyDesktopChanges(changes),
      })
      deliveryState.lastPullAt = Date.now()
      deliveryState.lastPull = {
        appliedChanges: pull.appliedChanges,
        reports: pull.reports,
        errors: pull.errors,
        authFailed: pull.authFailed,
        unreachable: pull.unreachable,
      }
      if (!result.errors.length && pull.errors.length) deliveryState.lastError = pull.errors[0]
    }
    await this.setDeliveryState(deliveryState)
    return result
  }

  async getSyncReports(limit = 20): Promise<Array<{ id: string; type: string; reason: string; detail?: string; at: number }>> {
    const reports = await this.store.getSyncReports(limit)
    return reports.map(r => ({ id: r.id, type: r.type, reason: r.reason, detail: r.detail, at: r.at }))
  }

  // ── capture metrics (R1.4): event counters only ─────────────────────

  async getCaptureMetrics(): Promise<CaptureMetrics> {
    const result = await chrome.storage.local.get(METRICS_KEY)
    const stored = result[METRICS_KEY] as Partial<CaptureMetrics> | undefined
    return {
      ...EMPTY_CAPTURE_METRICS,
      ...(stored ?? {}),
      exited: { ...(stored?.exited ?? {}) },
      fallbacks: { ...EMPTY_CAPTURE_METRICS.fallbacks, ...(stored?.fallbacks ?? {}) },
    }
  }

  async recordCaptureMetric(
    event: 'modal-opened' | 'reached-verify' | 'reached-apply' | 'saved' | 'exited',
    step?: string,
    details?: { hadInput?: boolean; fallback?: ExitFallback },
  ): Promise<CaptureMetrics> {
    const metrics = await this.getCaptureMetrics()
    if (event === 'modal-opened') metrics.modalOpened++
    else if (event === 'reached-verify') metrics.reachedVerify++
    else if (event === 'reached-apply') metrics.reachedApply++
    else if (event === 'saved') metrics.saved++
    else if (event === 'exited') {
      if (step) metrics.exited[step] = (metrics.exited[step] ?? 0) + 1
      if (details?.hadInput) metrics.exitedWithInput++
      if (details?.fallback === 'highlight' || details?.fallback === 'clip') metrics.fallbacks[details.fallback]++
    }
    await chrome.storage.local.set({ [METRICS_KEY]: metrics })
    return metrics
  }

  /**
   * Fire-and-forget delivery nudge after local commits: never blocks the
   * capture path; failures stay queued for the next flush (alarm or manual).
   */
  nudgeDelivery(): void {
    void this.getDirectConnectConfig()
      .then(config => {
        if (!config.token || !config.autoSync) return
        return this.flushDeliveries()
      })
      .catch(error => Logger.warn('[FragmentService] delivery nudge failed:', error instanceof Error ? error.message : error))
  }
}

/** Local annhub:// sources keep fixed hosts (fragments.md §7). */
function localSourceHost(sourceUrl: string): string {
  if (sourceUrl.startsWith('annhub://manual/')) return 'manual'
  return normalizeHost(sourceUrl)
}

export type { FragmentLocator, VerifiedResult, FragmentRecord }
