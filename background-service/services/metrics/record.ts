/**
 * Event recording helpers — the only writers of the local metrics store
 * (docs/v2/metrics.md §9). Props are enums/booleans/bucketed numbers only.
 */
import { bucketDuration, LocalMetrics, type MetricEventName, type MetricEventProps, type MetricsStorage, type MetricsStoreShape } from '../../../learning-core/metrics'
import { EntryValidationError } from '../../../learning-core/types'

let recorder: LocalMetrics | null = null

function chromeMetricsStorage(): MetricsStorage {
  return {
    get: async () => ((await chrome.storage.local.get('annhub.metrics'))['annhub.metrics'] ?? {}) as MetricsStoreShape,
    set: async shape => void chrome.storage.local.set({ 'annhub.metrics': shape }),
  }
}

function metrics(): LocalMetrics {
  recorder ??= new LocalMetrics(chromeMetricsStorage())
  return recorder
}

export async function recordEvent(name: MetricEventName, props: MetricEventProps = {}): Promise<void> {
  try {
    await metrics().record(name, props)
  } catch {
    // Metrics must never break the flow they measure.
  }
}

export interface CaptureSavedInput {
  type: 'clip' | 'screenshot'
  via: 'menu' | 'block' | 'shortcut'
  blockKind?: string
  levelChanged?: boolean
  truncated?: boolean
  durationMs?: number
  frame?: 'drag' | 'element' | 'reused'
}

export async function recordCaptureSaved(input: CaptureSavedInput): Promise<void> {
  await recordEvent('capture.saved', {
    type: input.type,
    via: input.via,
    ...(input.blockKind ? { block_kind: input.blockKind } : {}),
    ...(input.levelChanged !== undefined ? { level_changed: input.levelChanged } : {}),
    ...(input.truncated !== undefined ? { truncated: input.truncated } : {}),
    ...(input.durationMs !== undefined ? { duration: bucketDuration(input.durationMs) } : {}),
    ...(input.frame ? { frame: input.frame } : {}),
  })
}

export async function recordCaptureFailed(error: unknown, type: 'clip' | 'screenshot'): Promise<void> {
  const code = error instanceof EntryValidationError ? error.code : 'UNKNOWN'
  await recordEvent('capture.save_failed', { type, error_code: code })
}

export async function metricsSnapshot(): Promise<Record<string, { total: number; byProps: Record<string, number> }>> {
  return metrics().snapshot()
}
