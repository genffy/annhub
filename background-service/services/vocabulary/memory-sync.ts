/**
 * T1-B: backend-agnostic memory-sync client (stub).
 *
 * Implements the REST contract frozen in docs/vocab-server-memory-model-design.md §3:
 *  - POST {base}/v1/memory/events   → upload anonymized MemoryEvent batches (idempotent)
 *  - POST {base}/v1/memory/recall   → fetch server-computed RecallState per lemma
 *
 * This module is intentionally backend-agnostic and persistence-free: it only knows an
 * endpoint base + an anonymous identity, and turns request/response JSON into typed values.
 * VocabularyService owns the queue, the recall cache, and queue pruning on success.
 *
 * "Stub" = there is no server yet (T1-C). With no endpoint configured the service never
 * constructs a client; with an endpoint it issues real HTTPS calls, so the same code path
 * works end-to-end once a backend exists.
 */

import { MemoryEvent, RecallState } from '../../../types/vocabulary'

export interface MemorySyncEndpointConfig {
  /** Endpoint base, e.g. `https://api.example.com` (no trailing slash required). */
  endpoint: string
  /** Anonymous device id (also used as the bearer token when no account token is set). */
  deviceId: string
  /** Optional bearer token (account or anon). Falls back to `deviceId`. */
  authToken?: string
  /** Per-request timeout (ms). */
  timeoutMs?: number
}

export interface FlushEventsResult {
  accepted: number
  duplicates: number
  serverTime?: number
}

export interface FetchRecallResult {
  states: RecallState[]
  modelVersion?: string
  ttlSeconds?: number
}

/** Single batch cap (design §3.1: "≤ 500"); the service splits larger queues. */
export const MEMORY_EVENT_BATCH_LIMIT = 500

const DEFAULT_TIMEOUT_MS = 15000

export class MemorySyncClient {
  constructor(private readonly config: MemorySyncEndpointConfig) {
    if (!config.endpoint.trim()) {
      throw new Error('MemorySyncClient requires an endpoint')
    }
  }

  /**
   * Upload a batch of events. On HTTP 200 the whole batch is acknowledged (accepted as new
   * or deduped as duplicates) and the caller may prune those eventIds. Throws on
   * network/5xx/4xx so the caller keeps the queue for retry (design §3.3).
   */
  async flushEvents(events: MemoryEvent[]): Promise<FlushEventsResult> {
    if (events.length > MEMORY_EVENT_BATCH_LIMIT) {
      throw new Error(`Event batch exceeds ${MEMORY_EVENT_BATCH_LIMIT}`)
    }
    const body = await this.post('/v1/memory/events', {
      deviceId: this.config.deviceId,
      events,
    })
    return {
      accepted: this.toCount(body?.accepted),
      duplicates: this.toCount(body?.duplicates),
      serverTime: typeof body?.serverTime === 'number' ? body.serverTime : undefined,
    }
  }

  /**
   * Fetch recall states for the given lemmas. Lemmas the model has no data for are simply
   * absent from the response (the caller falls back to the local estimate).
   */
  async fetchRecall(lemmas: string[]): Promise<FetchRecallResult> {
    if (lemmas.length === 0) {
      return { states: [] }
    }
    const body = await this.post('/v1/memory/recall', {
      deviceId: this.config.deviceId,
      lemmas,
    })
    const rawStates = Array.isArray(body?.states) ? body.states : []
    const states: RecallState[] = []
    for (const raw of rawStates) {
      const normalized = this.normalizeRecallState(raw, body?.modelVersion)
      if (normalized) states.push(normalized)
    }
    return {
      states,
      modelVersion: typeof body?.modelVersion === 'string' ? body.modelVersion : undefined,
      ttlSeconds: typeof body?.ttlSeconds === 'number' ? body.ttlSeconds : undefined,
    }
  }

  // ── internals ──

  private async post(path: string, payload: unknown): Promise<any> {
    const url = this.buildUrl(path)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.authToken || this.config.deviceId}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      if (!response.ok) {
        // 401/429/5xx are all retryable by the caller (queue is kept); surface status.
        throw new Error(`Memory sync ${path} failed: HTTP ${response.status}`)
      }
      return await response.json().catch(() => ({}))
    } finally {
      clearTimeout(timeout)
    }
  }

  private buildUrl(path: string): string {
    const base = this.config.endpoint.trim().replace(/\/+$/, '')
    return `${base}${path}`
  }

  private toCount(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
  }

  private normalizeRecallState(raw: any, fallbackModelVersion: unknown): RecallState | null {
    if (!raw || typeof raw.lemma !== 'string' || !raw.lemma) return null
    const recall = typeof raw.recall === 'number' ? Math.min(1, Math.max(0, raw.recall)) : null
    if (recall === null || !Number.isFinite(recall)) return null
    const computedAt = typeof raw.computedAt === 'number' && raw.computedAt > 0 ? raw.computedAt : Date.now()
    const modelVersion = typeof raw.modelVersion === 'string' ? raw.modelVersion : typeof fallbackModelVersion === 'string' ? fallbackModelVersion : 'unknown'
    const state: RecallState = { lemma: raw.lemma, recall, computedAt, modelVersion }
    if (raw.dsr && typeof raw.dsr === 'object') {
      const { difficulty, stability, retrievability } = raw.dsr
      if ([difficulty, stability, retrievability].every(n => typeof n === 'number' && Number.isFinite(n))) {
        state.dsr = { difficulty, stability, retrievability }
      }
    }
    return state
  }
}
