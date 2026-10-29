/**
 * Local metrics — the event dictionary and its counters (docs/product/metrics.md §9).
 *
 * Events are only accumulated locally and shown as aggregate numbers in the
 * settings page; no upload path exists. Event properties may only be enums,
 * booleans or bucketed numbers — never content, URLs, titles, tag text or
 * property names/values.
 */
import { ENTRY_ERROR_CODES, PROPERTY_TYPES } from './types'

export type CaptureVia = 'menu' | 'block' | 'shortcut' | 'ink'
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
 * `capture.saved` measures from the user's click to the committed write (the exception in metrics.md §9) and so needs
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
const via = oneOf(['menu', 'block', 'shortcut', 'ink'])

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
    return aggregateShape(await this.storage.get())
  }

  /** Everything the settings panel shows (metrics.md §10): per-event totals plus the §5 summaries. */
  async panel(now = Date.now()): Promise<MetricsPanelData> {
    await this.pendingWrite
    const shape = await this.storage.get()
    return { events: aggregateShape(shape), summaries: metricSummaries(shape, now) }
  }
}

function aggregateShape(shape: MetricsStoreShape): Record<string, { total: number; byProps: Record<string, number> }> {
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

// ── Panel summaries (metrics.md §5, §10) ────────────────────────────────
//
// The events carry no entry, tab, page or property-name identifiers (§9), so
// the share-of-users metrics reduce to this one install's standing and the
// counting metrics are approximations by event counts; metrics.md §5 records
// each bias. Everything here is computed from day buckets only.

/** M-03 per entrance: durations are only known as buckets, so the median and p95 are the buckets holding those events. */
export interface CaptureTimingSummary {
  count: number
  byBucket: Record<CaptureDurationBucket, number>
  median: CaptureDurationBucket | null
  p95: CaptureDurationBucket | null
  /** The clip guardrail (M-03): the p95 event sits below 300 ms. */
  within300ms: boolean
}

/** M-11 at day granularity: the store keeps days, not the install moment or clock times. */
export interface ActivationSummary {
  /** First local day with a `capture.saved`; null before any save. */
  firstSaveDay: string | null
  firstReopenDay: string | null
  /** A reopen on the first save's day or the next day — up to 48 h, the honest day-granularity reading of the 24 h rule. */
  activated: boolean
}

/** One Monday-start week of M-19. */
export interface WeekSummary {
  /** The week's Monday, local time, `YYYY-MM-DD`. */
  weekStart: string
  reopens: number
  exports: number
  /** M-19: reopens + exports. */
  retrieved: number
  /** The same week's searches and filters, shown alongside (metrics.md §5). */
  queried: number
  /** M-19's weekly path: searched or filtered and reopened in the same week, or exported (metrics.md §5). */
  soughtBack: boolean
}

/** A share-of-users habit, reduced to this install: the panel cannot see other installs. */
export interface HabitSummary {
  /** The counted activity's events in the window. */
  numerator: number
  /** The defining activity's events in the window (what puts an install in the denominator). */
  denominator: number
  /** This install counts in the metric's numerator; null when not in the denominator either. */
  satisfied: boolean | null
}

/** A rate over event counts, fully computable locally. */
export interface RateSummary {
  numerator: number
  denominator: number
  /** 0–1, null on an empty denominator. */
  rate: number | null
}

export interface MetricSummaries {
  /** M-03, per entrance, over the retained window. */
  timing: { selection: CaptureTimingSummary; block: CaptureTimingSummary; screenshot: CaptureTimingSummary }
  activation: ActivationSummary
  /** M-19: the last six weeks, oldest first; the newest is the partial current week. */
  weeks: WeekSummary[]
  /** M-20: property edits among active use, last 14 days. */
  propertyUse: HabitSummary
  /** M-21: highlight creators among clip capturers, last 14 days. */
  highlightUse: HabitSummary
  /** M-22: copy or download among screenshot takers, last 14 days. */
  screenshotExternalUse: HabitSummary
  /** M-23: block saves without a level change minus block undos, over block saves. */
  blockFirstHit: RateSummary & { unchangedLevels: number; undos: number }
  /** M-24: beautified output among copiers or downloaders, last 14 days. */
  beautifyUse: HabitSummary
  /** M-25: reused frames among screenshots, over the retained window (the denominator counts every page's first shot). */
  frameReuse: RateSummary
}

/** What `GET_METRICS` answers: the per-event totals and the §5 summaries in one read. */
export interface MetricsPanelData {
  events: Record<string, { total: number; byProps: Record<string, number> }>
  summaries: MetricSummaries
}

const WINDOW_DAYS = 14
const WEEKS_SHOWN = 6

function parseProps(serialized: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pair of serialized.split('|')) {
    if (!pair) continue
    const at = pair.indexOf('=')
    if (at > 0) out[pair.slice(0, at)] = pair.slice(at + 1)
  }
  return out
}

type PropMatcher = (props: Record<string, string>) => boolean

const withProps =
  (expected: Record<string, string | boolean>): PropMatcher =>
  props =>
    Object.entries(expected).every(([key, value]) => props[key] === String(value))

/** Counts an event's days from `sinceDay` (inclusive), whole retained window when omitted, optionally by prop match. */
function countEvents(shape: MetricsStoreShape, event: MetricEventName, matches?: PropMatcher, sinceDay?: string): number {
  const days = shape[event]
  if (!days) return 0
  let total = 0
  for (const [day, bucket] of Object.entries(days)) {
    if (sinceDay !== undefined && day < sinceDay) continue
    if (!matches) {
      total += bucket.total
      continue
    }
    for (const [key, count] of Object.entries(bucket.byProps)) {
      if (matches(parseProps(key))) total += count
    }
  }
  return total
}

function sortedDays(shape: MetricsStoreShape, event: MetricEventName): string[] {
  return Object.keys(shape[event] ?? {}).sort()
}

function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return dayKey(new Date(y!, m! - 1, d! + 1).getTime())
}

function timingFor(shape: MetricsStoreShape, matches: PropMatcher): CaptureTimingSummary {
  const byBucket = Object.fromEntries(CAPTURE_DURATION_BUCKETS.map(bucket => [bucket, 0])) as Record<CaptureDurationBucket, number>
  for (const bucket of Object.values(shape['capture.saved'] ?? {})) {
    for (const [key, count] of Object.entries(bucket.byProps)) {
      const props = parseProps(key)
      if (!matches(props)) continue
      const duration = props['duration']
      if (duration && (CAPTURE_DURATION_BUCKETS as readonly string[]).includes(duration)) byBucket[duration as CaptureDurationBucket] += count
    }
  }
  const count = CAPTURE_DURATION_BUCKETS.reduce((sum, bucket) => sum + byBucket[bucket], 0)
  const bucketAt = (quantile: number): CaptureDurationBucket | null => {
    if (!count) return null
    const target = Math.ceil(count * quantile)
    let seen = 0
    for (const bucket of CAPTURE_DURATION_BUCKETS) {
      seen += byBucket[bucket]
      if (seen >= target) return bucket
    }
    return null
  }
  const p95 = bucketAt(0.95)
  return { count, byBucket, median: bucketAt(0.5), p95, within300ms: p95 === '<150ms' || p95 === '150-300ms' }
}

function habit(numerator: number, denominator: number): HabitSummary {
  return { numerator, denominator, satisfied: denominator === 0 ? null : numerator > 0 }
}

function rate(numerator: number, denominator: number): RateSummary {
  return { numerator, denominator, rate: denominator === 0 ? null : numerator / denominator }
}

/** The summaries behind the settings panel (metrics.md §5, §10). Pure: same shape and moment, same numbers. */
export function metricSummaries(shape: MetricsStoreShape, now = Date.now()): MetricSummaries {
  const since14d = dayKey(now - (WINDOW_DAYS - 1) * DAY_MS)

  const activationDays = sortedDays(shape, 'capture.saved')
  const firstSaveDay = activationDays[0] ?? null
  const reopenDays = sortedDays(shape, 'entry.reopened')

  const weeks: WeekSummary[] = []
  const monday = new Date(now)
  monday.setHours(0, 0, 0, 0)
  // date arithmetic, not millisecond subtraction: it stays on the same local clock time across DST changes
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  for (let back = WEEKS_SHOWN - 1; back >= 0; back--) {
    const start = new Date(monday)
    start.setDate(monday.getDate() - back * 7)
    const end = new Date(monday)
    end.setDate(monday.getDate() - (back - 1) * 7)
    const weekStart = dayKey(start.getTime())
    const weekEnd = dayKey(end.getTime())
    const reopens = countEvents(shape, 'entry.reopened', undefined, weekStart) - countEvents(shape, 'entry.reopened', undefined, weekEnd)
    const exports = countEvents(shape, 'export.completed', undefined, weekStart) - countEvents(shape, 'export.completed', undefined, weekEnd)
    const queried = countEvents(shape, 'library.queried', undefined, weekStart) - countEvents(shape, 'library.queried', undefined, weekEnd)
    weeks.push({ weekStart, reopens, exports, retrieved: reopens + exports, queried, soughtBack: (queried > 0 && reopens > 0) || exports > 0 })
  }

  const blockSaves = countEvents(shape, 'capture.saved', withProps({ type: 'clip', via: 'block' }))
  const unchangedLevels = countEvents(shape, 'capture.saved', withProps({ type: 'clip', via: 'block', level_changed: false }))
  const undos = countEvents(shape, 'capture.undone', withProps({ type: 'clip', via: 'block' }))

  const anyEvent14d = (Object.keys(shape) as MetricEventName[]).reduce((sum, event) => sum + countEvents(shape, event, undefined, since14d), 0)
  const clipSaves14d = countEvents(shape, 'capture.saved', withProps({ type: 'clip' }), since14d)
  const shotSaves14d = countEvents(shape, 'capture.saved', withProps({ type: 'screenshot' }), since14d)
  const copies14d = countEvents(shape, 'screenshot.copied', undefined, since14d)
  const downloads14d = countEvents(shape, 'screenshot.downloaded', undefined, since14d)
  const outputs14d = copies14d + downloads14d

  return {
    timing: {
      selection: timingFor(shape, withProps({ type: 'clip', via: 'menu' })),
      block: timingFor(shape, withProps({ type: 'clip', via: 'block' })),
      screenshot: timingFor(shape, withProps({ type: 'screenshot' })),
    },
    activation: {
      firstSaveDay,
      firstReopenDay: reopenDays[0] ?? null,
      activated: firstSaveDay !== null && reopenDays.some(day => day === firstSaveDay || day === nextDay(firstSaveDay)),
    },
    weeks,
    propertyUse: habit(
      countEvents(shape, 'entry.property_edited', props => props['scope']! === 'custom' || props['property_type']! === 'list', since14d),
      anyEvent14d,
    ),
    highlightUse: habit(countEvents(shape, 'highlight.created', undefined, since14d), clipSaves14d),
    screenshotExternalUse: habit(outputs14d, shotSaves14d),
    blockFirstHit: { ...rate(Math.max(0, unchangedLevels - undos), blockSaves), unchangedLevels, undos },
    beautifyUse: habit(
      countEvents(shape, 'screenshot.copied', withProps({ beautify: true }), since14d) + countEvents(shape, 'screenshot.downloaded', withProps({ beautify: true }), since14d),
      outputs14d,
    ),
    frameReuse: rate(
      countEvents(shape, 'capture.saved', withProps({ type: 'screenshot', frame: 'reused' })),
      countEvents(shape, 'capture.saved', withProps({ type: 'screenshot' })),
    ),
  }
}
