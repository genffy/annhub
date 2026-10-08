import { describe, expect, it } from 'vitest'
import { bucketCount, bucketDuration, LocalMetrics, type MetricsStoreShape } from '../metrics'

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
  it('buckets durations and counts, never raw numbers', () => {
    expect(bucketDuration(100)).toBe('<15s')
    expect(bucketDuration(20_000)).toBe('15-30s')
    expect(bucketDuration(45_000)).toBe('30-60s')
    expect(bucketDuration(90_000)).toBe('60-120s')
    expect(bucketDuration(300_000)).toBe('>120s')
    expect(bucketCount(0)).toBe('0')
    expect(bucketCount(2)).toBe('1-2')
    expect(bucketCount(5)).toBe('3-5')
    expect(bucketCount(10)).toBe('6-10')
    expect(bucketCount(11)).toBe('>10')
  })
})

describe('LocalMetrics', () => {
  it('accumulates totals and prop-bucketed counters per day', async () => {
    const metrics = new LocalMetrics(memoryStorage())
    await metrics.record('capture.saved', { type: 'clip', via: 'menu', duration: '<15s' })
    await metrics.record('capture.saved', { type: 'clip', via: 'menu', duration: '<15s' })
    await metrics.record('capture.saved', { type: 'screenshot', via: 'shortcut' })
    const snapshot = await metrics.snapshot()
    expect(snapshot['capture.saved']!.total).toBe(3)
    expect(snapshot['capture.saved']!.byProps['duration=<15s|type=clip|via=menu']).toBe(2)
    expect(snapshot['capture.saved']!.byProps['type=screenshot|via=shortcut']).toBe(1)
  })

  it('drops day buckets older than the retained window', async () => {
    const old = Date.now() - 61 * 24 * 60 * 60 * 1000
    const metrics = new LocalMetrics(memoryStorage())
    await metrics.record('library.queried', { has_text: true }, old)
    await metrics.record('library.queried', { has_text: false })
    const snapshot = await metrics.snapshot()
    expect(snapshot['library.queried']!.total).toBe(1)
  })
})
