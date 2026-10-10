import { describe, expect, it } from 'vitest'
import { bucketCaptureDuration, bucketCount, CAPTURE_DURATION_BUCKETS, LocalMetrics, type MetricsStoreShape } from '../metrics'

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

  it('buckets the click-to-write time finely enough to see the 300 ms guard (D-22)', () => {
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
    expect(snapshot['library.queried']!.total).toBe(1)
  })
})
