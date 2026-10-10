/**
 * Local metrics — the event dictionary and its counters (docs/v2/metrics.md §9).
 *
 * Events are only accumulated locally and shown as aggregate numbers in the
 * settings page; no upload path exists. Event properties may only be enums,
 * booleans or bucketed numbers — never content, URLs, titles, tag text or
 * property names/values.
 */
import { ENTRY_ERROR_CODES, PROPERTY_TYPES } from './types'

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

/**
 * Bucketing (metrics.md §9): durations and counts never travel as raw numbers.
 *
 * `capture.saved` measures from the user's click to the committed write (D-22, default A) and so needs
 * steps fine enough to see the 300 ms write guard of M-03; the coarse minute-scale buckets of the general
 * rule cannot, with everything under 15 s in one bucket.
 */
export type CaptureDurationBucket = '<150ms' | '150-300ms' | '300-600ms' | '600-1500ms' | '1.5-5s' | '>=5s'

export const CAPTURE_DURATION_BUCKETS: readonly CaptureDurationBucket[] = ['<150ms', '150-300ms', '300-600ms', '600-1500ms', '1.5-5s', '>=5s']

export function bucketCaptureDuration(ms: number): CaptureDurationBucket {
  if (ms < 150) return '<150ms'
  if (ms < 300) return '150-300ms'
  if (ms < 600) return '300-600ms'
  if (ms < 1_500) return '600-1500ms'
  if (ms < 5_000) return '1.5-5s'
  return '>=5s'
}

export function bucketCount(n: number): '0' | '1-2' | '3-5' | '6-10' | '>10' {
  if (n <= 0) return '0'
  if (n <= 2) return '1-2'
  if (n <= 5) return '3-5'
  if (n <= 10) return '6-10'
  return '>10'
}

export type MetricEventProps = Record<string, string | boolean>

type PropertyCheck = (value: unknown) => boolean
const isBoolean: PropertyCheck = value => typeof value === 'boolean'
const oneOf =
  (values: readonly string[]): PropertyCheck =>
  value =>
    typeof value === 'string' && values.includes(value)
const countBucket = oneOf(['0', '1-2', '3-5', '6-10', '>10'])
const captureDuration = oneOf(CAPTURE_DURATION_BUCKETS)
const entryType = oneOf(['clip', 'screenshot'])
const via = oneOf(['menu', 'block', 'shortcut'])

const EVENT_FIELDS: Record<MetricEventName, Record<string, PropertyCheck>> = {
  'capture.saved': {
    type: entryType,
    via,
    duration: captureDuration,
    block_kind: oneOf(['post', 'code', 'table', 'figure', 'quote', 'section', 'article']),
    level_changed: isBoolean,
    truncated: isBoolean,
    frame: oneOf(['drag', 'element', 'reused']),
  },
  'capture.undone': { type: entryType, via },
  'capture.save_failed': { type: entryType, error_code: oneOf(ENTRY_ERROR_CODES) },
  'highlight.created': { has_note: isBoolean, via: oneOf(['toolbar', 'shortcut']) },
  'entry.reopened': { type: entryType },
  'entry.property_edited': { scope: oneOf(['builtin', 'custom']), property_type: oneOf(PROPERTY_TYPES) },
  'library.queried': { has_text: isBoolean, filters: countBucket, results: countBucket },
  'export.completed': { result: oneOf(['full', 'partial']), missing_assets: countBucket },
  'screenshot.copied': { watermark: isBoolean, beautify: isBoolean },
  'screenshot.downloaded': { format: oneOf(['png', 'jpeg', 'webp']), watermark: isBoolean, beautify: isBoolean },
}

export function validateMetricEvent(event: unknown, props: unknown): void {
  if (typeof event !== 'string' || !Object.prototype.hasOwnProperty.call(EVENT_FIELDS, event)) throw new Error('Unknown metric event')
  if (!props || typeof props !== 'object' || Array.isArray(props)) throw new Error('Invalid metric properties')
  const fields = EVENT_FIELDS[event as MetricEventName]
  for (const [key, value] of Object.entries(props)) {
    if (!Object.prototype.hasOwnProperty.call(fields, key) || !fields[key]!(value)) throw new Error('Invalid metric property')
  }
}

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
  private pendingWrite: Promise<void> = Promise.resolve()

  constructor(private readonly storage: MetricsStorage) {}

  async record(event: MetricEventName, props: MetricEventProps = {}, at = Date.now()): Promise<void> {
    validateMetricEvent(event, props)
    const write = this.pendingWrite.catch(() => undefined).then(() => this.recordOnce(event, props, at))
    this.pendingWrite = write
    return write
  }

  private async recordOnce(event: MetricEventName, props: MetricEventProps, at: number): Promise<void> {
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
      const days = shape[event]
      if (!days) continue
      for (const day of Object.keys(days)) {
        if (day < cutoff) delete days[day]
      }
      if (Object.keys(days).length === 0) delete shape[event]
    }
  }

  /** Aggregate snapshot for the settings panel: totals per event and per prop-bucket. */
  async snapshot(): Promise<Record<string, { total: number; byProps: Record<string, number> }>> {
    await this.pendingWrite
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
