/**
 * Local metrics — the event dictionary and its counters (docs/v2/metrics.md §9).
 *
 * Events are only accumulated locally and shown as aggregate numbers in the
 * settings page; no upload path exists. Event properties may only be enums,
 * booleans or bucketed numbers — never content, URLs, titles, tag text or
 * property names/values.
 */

export type CaptureVia = 'menu' | 'block' | 'shortcut'
export type BlockKind = 'post' | 'code' | 'table' | 'figure' | 'quote' | 'section' | 'article'
export type ScreenshotFrame = 'drag' | 'element' | 'reused'

export type MetricEventName =
  | 'capture.saved'
  | 'capture.undone'
  | 'capture.save_failed'
  | 'highlight.created'
  | 'entry.reopened'
  | 'entry.property_edited'
  | 'library.queried'
  | 'export.completed'
  | 'screenshot.copied'
  | 'screenshot.downloaded'

/** Bucketing (metrics.md §9): durations and counts never travel as raw numbers. */
export function bucketDuration(ms: number): '<15s' | '15-30s' | '30-60s' | '60-120s' | '>120s' {
  if (ms < 15_000) return '<15s'
  if (ms < 30_000) return '15-30s'
  if (ms < 60_000) return '30-60s'
  if (ms < 120_000) return '60-120s'
  return '>120s'
}

export function bucketCount(n: number): '0' | '1-2' | '3-5' | '6-10' | '>10' {
  if (n <= 0) return '0'
  if (n <= 2) return '1-2'
  if (n <= 5) return '3-5'
  if (n <= 10) return '6-10'
  return '>10'
}

export type MetricEventProps = Record<string, string | boolean>

/** Per-day counters per event, keyed by serialized props. */
export interface MetricsStoreShape {
  [event: string]: {
    [day: string]: {
      total: number
      byProps: Record<string, number>
    }
  }
}

export interface MetricsStorage {
  get(): Promise<MetricsStoreShape>
  set(shape: MetricsStoreShape): Promise<void>
}

const DAY_MS = 24 * 60 * 60 * 1000
const RETAINED_DAYS = 60

function dayKey(epochMs: number): string {
  const d = new Date(epochMs)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function serializeProps(props: MetricEventProps): string {
  return Object.keys(props)
    .sort()
    .map(key => `${key}=${String(props[key])}`)
    .join('|')
}

export class LocalMetrics {
  constructor(private readonly storage: MetricsStorage) {}

  async record(event: MetricEventName, props: MetricEventProps = {}, at = Date.now()): Promise<void> {
    const shape = await this.storage.get()
    const day = dayKey(at)
    shape[event] ??= {}
    const bucket = (shape[event]![day] ??= { total: 0, byProps: {} })
    bucket.total++
    const key = serializeProps(props)
    if (key) bucket.byProps[key] = (bucket.byProps[key] ?? 0) + 1
    this.trim(shape, at)
    await this.storage.set(shape)
  }

  private trim(shape: MetricsStoreShape, now: number): void {
    const cutoff = dayKey(now - RETAINED_DAYS * DAY_MS)
    for (const event of Object.keys(shape)) {
      for (const day of Object.keys(shape[event]!)) {
        if (day < cutoff) delete shape[event]![day]!
      }
      if (Object.keys(shape[event]!).length === 0) delete shape[event]
    }
  }

  /** Aggregate snapshot for the settings panel: totals per event and per prop-bucket. */
  async snapshot(): Promise<Record<string, { total: number; byProps: Record<string, number> }>> {
    const shape = await this.storage.get()
    const out: Record<string, { total: number; byProps: Record<string, number> }> = {}
    for (const [event, days] of Object.entries(shape)) {
      const agg = (out[event] ??= { total: 0, byProps: {} })
      for (const day of Object.values(days)) {
        agg.total += day.total
        for (const [key, count] of Object.entries(day.byProps)) {
          agg.byProps[key] = (agg.byProps[key] ?? 0) + count
        }
      }
    }
    return out
  }
}
