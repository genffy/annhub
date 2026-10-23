import { describe, expect, it } from 'vitest'
import {
  bucketCaptureDuration,
  bucketCount,
  CAPTURE_DURATION_BUCKETS,
  LocalMetrics,
  metricSummaries,
  type MetricEventName,
  type MetricEventProps,
  type MetricsStoreShape,
} from '../metrics'

function memoryStorage(initial: MetricsStoreShape = {}) {
  let shape = initial
  return {
    get: async () => shape,
    set: async (next: MetricsStoreShape) => {
      shape = next
    },
  }
}

describe('bucketing (metrics.md §9)', () => {
  it('buckets counts, never raw numbers', () => {
    expect(bucketCount(0)).toBe('0')
    expect(bucketCount(2)).toBe('1-2')
    expect(bucketCount(5)).toBe('3-5')
    expect(bucketCount(10)).toBe('6-10')
    expect(bucketCount(11)).toBe('>10')
  })

  it('buckets the click-to-write time finely enough to see the 300 ms guard (metrics.md §9)', () => {
    expect(bucketCaptureDuration(0)).toBe('<150ms')
    expect(bucketCaptureDuration(149)).toBe('<150ms')
    expect(bucketCaptureDuration(150)).toBe('150-300ms')
    expect(bucketCaptureDuration(299)).toBe('150-300ms')
    // 300 ms is a bucket edge: everything under the guard sits in the first two buckets
    expect(bucketCaptureDuration(300)).toBe('300-600ms')
    expect(bucketCaptureDuration(599)).toBe('300-600ms')
    expect(bucketCaptureDuration(600)).toBe('600-1500ms')
    expect(bucketCaptureDuration(1_499)).toBe('600-1500ms')
    expect(bucketCaptureDuration(1_500)).toBe('1.5-5s')
    expect(bucketCaptureDuration(4_999)).toBe('1.5-5s')
    expect(bucketCaptureDuration(5_000)).toBe('>=5s')
    expect(bucketCaptureDuration(600_000)).toBe('>=5s')
    // every bucket the function can return is one the dictionary accepts
    for (const ms of [0, 200, 400, 800, 2_000, 9_000]) expect(CAPTURE_DURATION_BUCKETS).toContain(bucketCaptureDuration(ms))
  })
})

describe('LocalMetrics', () => {
  it('rejects unknown events, fields and content-shaped values at runtime', async () => {
    const metrics = new LocalMetrics(memoryStorage())
    await expect(metrics.record('unknown.event' as never, { url: 'https://private.example/page' })).rejects.toThrow()
    await expect(metrics.record('library.queried', { has_text: true, filters: 'https://private.example/page', results: '0' })).rejects.toThrow()
    await expect(metrics.record('entry.reopened', { type: 'clip', title: 'private title' })).rejects.toThrow()
    expect(await metrics.snapshot()).toEqual({})
  })

  it('keeps every event when independent callers record concurrently', async () => {
    let shape: MetricsStoreShape = {}
    const metrics = new LocalMetrics({
      get: async () => structuredClone(shape),
      set: async next => {
        await new Promise(resolve => setTimeout(resolve, 1))
        shape = next
      },
    })
    await Promise.all(Array.from({ length: 10 }, () => metrics.record('library.queried', { has_text: false, filters: '0', results: '0' })))
    expect((await metrics.snapshot())['library.queried']?.total).toBe(10)
  })

  it('accepts only the click-to-write buckets for a capture duration', async () => {
    const metrics = new LocalMetrics(memoryStorage())
    await expect(metrics.record('capture.saved', { type: 'clip', via: 'menu', duration: '<15s' })).rejects.toThrow()
    await expect(metrics.record('capture.saved', { type: 'clip', via: 'menu', duration: '212' })).rejects.toThrow()
    await metrics.record('capture.saved', { type: 'clip', via: 'menu', duration: '150-300ms' })
    expect((await metrics.snapshot())['capture.saved']?.total).toBe(1)
  })

  it('accumulates totals and prop-bucketed counters per day', async () => {
    const metrics = new LocalMetrics(memoryStorage())
    await metrics.record('capture.saved', { type: 'clip', via: 'menu', duration: '<150ms' })
    await metrics.record('capture.saved', { type: 'clip', via: 'menu', duration: '<150ms' })
    await metrics.record('capture.saved', { type: 'screenshot', via: 'shortcut' })
    const snapshot = await metrics.snapshot()
    expect(snapshot['capture.saved']!.total).toBe(3)
    expect(snapshot['capture.saved']!.byProps['duration=<150ms|type=clip|via=menu']).toBe(2)
    expect(snapshot['capture.saved']!.byProps['type=screenshot|via=shortcut']).toBe(1)
  })

  it('drops day buckets older than the retained window', async () => {
    const old = Date.now() - 61 * 24 * 60 * 60 * 1000
    const metrics = new LocalMetrics(memoryStorage())
    await metrics.record('library.queried', { has_text: true }, old)
    await metrics.record('library.queried', { has_text: false })
    const snapshot = await metrics.snapshot()
    expect(snapshot['library.queried']?.total).toBe(1)
  })
})

// ── Panel summaries (metrics.md §5, §10) ────────────────────────────────

/** Builds a store shape the way `serializeProps` writes it, so the summaries read real keys. */
function shapeOf(days: Record<string, [MetricEventName, MetricEventProps][]>): MetricsStoreShape {
  const shape: MetricsStoreShape = {}
  for (const [day, events] of Object.entries(days)) {
    for (const [event, props] of events) {
      const bucket = (shape[event] ??= {})
      const dayBucket = (bucket[day] ??= { total: 0, byProps: {} })
      dayBucket.total++
      const key = Object.keys(props)
        .sort()
        .map(name => `${name}=${String(props[name])}`)
        .join('|')
      if (key) dayBucket.byProps[key] = (dayBucket.byProps[key] ?? 0) + 1
    }
  }
  return shape
}

/** A fixed Monday noon in local time: week starts and the 14-day window are stable around it. */
const NOW = new Date(2026, 9, 12, 12, 0, 0).getTime()

describe('metricSummaries (metrics.md §5)', () => {
  it('keeps the M-03 entrances apart and reports the median and p95 as buckets', () => {
    const shape = shapeOf({
      '2026-10-12': [
        ['capture.saved', { type: 'clip', via: 'menu', duration: bucketCaptureDuration(100) }],
        ['capture.saved', { type: 'clip', via: 'menu', duration: bucketCaptureDuration(200) }],
        ['capture.saved', { type: 'clip', via: 'menu', duration: bucketCaptureDuration(350) }],
        ['capture.saved', { type: 'clip', via: 'menu', duration: bucketCaptureDuration(400) }],
        ['capture.saved', { type: 'clip', via: 'block', block_kind: 'code', level_changed: false, duration: bucketCaptureDuration(100) }],
        ['capture.saved', { type: 'clip', via: 'block', block_kind: 'code', level_changed: true, duration: bucketCaptureDuration(120) }],
        ['capture.saved', { type: 'screenshot', via: 'shortcut', frame: 'drag', duration: bucketCaptureDuration(400) }],
      ],
    })
    const { timing } = metricSummaries(shape, NOW)
    expect(timing.selection).toMatchObject({ count: 4, median: '150-300ms', p95: '300-600ms', within300ms: false })
    expect(timing.block).toMatchObject({ count: 2, median: '<150ms', p95: '<150ms', within300ms: true })
    expect(timing.screenshot).toMatchObject({ count: 1, median: '300-600ms', p95: '300-600ms', within300ms: false })
  })

  it('M-11 activates on a reopen in the first save day or the next one, at day granularity', () => {
    const sameDay = metricSummaries(
      shapeOf({
        '2026-10-01': [
          ['capture.saved', { type: 'clip', via: 'menu', duration: '<150ms' }],
          ['entry.reopened', { type: 'clip' }],
        ],
      }),
      NOW,
    )
    expect(sameDay.activation).toMatchObject({ firstSaveDay: '2026-10-01', firstReopenDay: '2026-10-01', activated: true })

    const nextDay = metricSummaries(
      shapeOf({ '2026-10-01': [['capture.saved', { type: 'screenshot', via: 'shortcut' }]], '2026-10-02': [['entry.reopened', { type: 'screenshot' }]] }),
      NOW,
    )
    expect(nextDay.activation.activated).toBe(true)

    const daysLater = metricSummaries(shapeOf({ '2026-10-01': [['capture.saved', { type: 'clip', via: 'menu' }]], '2026-10-03': [['entry.reopened', { type: 'clip' }]] }), NOW)
    expect(daysLater.activation.activated).toBe(false)

    const nothing = metricSummaries({}, NOW)
    expect(nothing.activation).toMatchObject({ firstSaveDay: null, firstReopenDay: null, activated: false })
  })

  it('M-19 sums reopens and exports per Monday-start week and marks the weeks that searched and reopened, or exported', () => {
    const shape = shapeOf({
      // week of 2026-09-28: searched but never came back
      '2026-09-29': [['library.queried', { has_text: true, filters: '0', results: '1-2' }]],
      // week of 2026-10-05: two reopens, one export, one query
      '2026-10-07': [
        ['entry.reopened', { type: 'clip' }],
        ['entry.reopened', { type: 'screenshot' }],
        ['library.queried', { has_text: false, filters: '3-5', results: '0' }],
      ],
      '2026-10-08': [['export.completed', { result: 'full', missing_assets: '0' }]],
      // week of 2026-10-12 (current, partial): export only
      '2026-10-12': [['export.completed', { result: 'partial', missing_assets: '1-2' }]],
    })
    const { weeks } = metricSummaries(shape, NOW)
    expect(weeks.map(week => week.weekStart)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'])
    const byWeek = new Map(weeks.map(week => [week.weekStart, week]))
    expect(byWeek.get('2026-09-28')).toMatchObject({ reopens: 0, exports: 0, retrieved: 0, queried: 1, soughtBack: false })
    expect(byWeek.get('2026-10-05')).toMatchObject({ reopens: 2, exports: 1, retrieved: 3, queried: 1, soughtBack: true })
    expect(byWeek.get('2026-10-12')).toMatchObject({ reopens: 0, exports: 1, retrieved: 1, soughtBack: true })
  })

  it('M-20 counts any custom or built-in-list edit in the last 14 days; anything older is out', () => {
    const shape = shapeOf({
      // 20 days before now: outside the window entirely
      '2026-09-22': [
        ['entry.property_edited', { scope: 'custom', property_type: 'text' }],
        ['library.queried', { has_text: true }],
      ],
      '2026-10-01': [['entry.property_edited', { scope: 'builtin', property_type: 'list' }]],
      // a built-in text edit (title) never satisfies M-20's numerator
      '2026-10-02': [['entry.property_edited', { scope: 'builtin', property_type: 'text' }]],
    })
    const { propertyUse } = metricSummaries(shape, NOW)
    expect(propertyUse).toMatchObject({ numerator: 1, satisfied: true })
    // the two September events still count nowhere in the window: the denominator holds the October ones only
    expect(propertyUse.denominator).toBe(2)
  })

  it('M-21, M-22 and M-24 read their windows from the defining activity', () => {
    const shape = shapeOf({
      '2026-10-03': [
        ['capture.saved', { type: 'clip', via: 'menu', duration: '<150ms' }],
        ['capture.saved', { type: 'screenshot', via: 'shortcut', frame: 'drag' }],
        ['highlight.created', { has_note: false, via: 'toolbar' }],
        ['screenshot.copied', { watermark: false, beautify: false }],
        ['screenshot.downloaded', { format: 'png', watermark: false, beautify: true }],
      ],
      '2026-10-04': [
        ['capture.saved', { type: 'screenshot', via: 'menu', frame: 'element' }],
        ['screenshot.copied', { watermark: true, beautify: true }],
      ],
    })
    const { highlightUse, screenshotExternalUse, beautifyUse } = metricSummaries(shape, NOW)
    expect(highlightUse).toMatchObject({ numerator: 1, denominator: 1, satisfied: true })
    expect(screenshotExternalUse).toMatchObject({ numerator: 3, denominator: 2, satisfied: true })
    expect(beautifyUse).toMatchObject({ numerator: 2, denominator: 3, satisfied: true })
  })

  it('M-23 subtracts every block undo from the unlevelled saves — the lower bound the events can give', () => {
    const blockDay: [MetricEventName, MetricEventProps][] = [
      ['capture.saved', { type: 'clip', via: 'block', block_kind: 'code', level_changed: false, duration: '<150ms' }],
      ['capture.saved', { type: 'clip', via: 'block', block_kind: 'code', level_changed: false, duration: '<150ms' }],
      ['capture.saved', { type: 'clip', via: 'block', block_kind: 'code', level_changed: true, duration: '<150ms' }],
      ['capture.saved', { type: 'clip', via: 'menu', duration: '<150ms' }],
      ['capture.undone', { type: 'clip', via: 'block' }],
      ['capture.undone', { type: 'clip', via: 'menu' }],
    ]
    const { blockFirstHit } = metricSummaries(shapeOf({ '2026-10-06': blockDay }), NOW)
    expect(blockFirstHit).toMatchObject({ unchangedLevels: 2, undos: 1, numerator: 1, denominator: 3, rate: 1 / 3 })
  })

  it('M-25 divides reused frames by every screenshot, first shot per page included', () => {
    const shape = shapeOf({
      '2026-10-05': [
        ['capture.saved', { type: 'screenshot', via: 'shortcut', frame: 'drag', duration: '<150ms' }],
        ['capture.saved', { type: 'screenshot', via: 'shortcut', frame: 'reused', duration: '<150ms' }],
        ['capture.saved', { type: 'screenshot', via: 'shortcut', frame: 'reused', duration: '<150ms' }],
        ['capture.saved', { type: 'screenshot', via: 'menu', frame: 'element', duration: '<150ms' }],
      ],
    })
    expect(metricSummaries(shape, NOW).frameReuse).toMatchObject({ numerator: 2, denominator: 4, rate: 0.5 })
  })
})

describe('LocalMetrics.panel', () => {
  it('answers the per-event totals and the summaries in one read', async () => {
    const metrics = new LocalMetrics(memoryStorage())
    await metrics.record('capture.saved', { type: 'clip', via: 'menu', duration: '<150ms' })
    await metrics.record('entry.reopened', { type: 'clip' })
    const panel = await metrics.panel()
    expect(panel.events['capture.saved']?.total).toBe(1)
    expect(panel.summaries.activation.activated).toBe(true)
    expect(panel.summaries.timing.selection.count).toBe(1)
  })
})
