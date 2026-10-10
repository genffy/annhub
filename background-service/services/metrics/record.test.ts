import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
/** The event recorders, over a fake chrome.storage.local (metrics.md §9). */

let stored: Record<string, unknown>

beforeEach(() => {
  stored = {}
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: structuredClone(stored[key]) }),
        set: async (items: Record<string, unknown>) => {
          Object.assign(stored, structuredClone(items))
        },
      },
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

/** A fresh module graph: the recorder caches its store, and `instanceof` needs the classes of the same graph. */
async function recorders() {
  vi.resetModules()
  const record = await import('./record')
  const { QuotaError } = await import('../../../learning-core/store')
  const { EntryValidationError } = await import('../../../learning-core/types')
  return { ...record, QuotaError, EntryValidationError }
}

describe('capture.saved (D-22)', () => {
  it('records the click-to-write time in the fine buckets', async () => {
    const { recordCaptureSaved, metricsSnapshot } = await recorders()
    await recordCaptureSaved({ type: 'clip', via: 'menu', durationMs: 120 })
    await recordCaptureSaved({ type: 'clip', via: 'menu', durationMs: 220 })
    await recordCaptureSaved({ type: 'clip', via: 'block', blockKind: 'code', levelChanged: true, truncated: false, durationMs: 3_400 })
    const { byProps, total } = (await metricsSnapshot())['capture.saved']!
    expect(total).toBe(3)
    expect(byProps['duration=<150ms|type=clip|via=menu']).toBe(1)
    expect(byProps['duration=150-300ms|type=clip|via=menu']).toBe(1)
    expect(byProps['block_kind=code|duration=1.5-5s|level_changed=true|truncated=false|type=clip|via=block']).toBe(1)
  })

  it('never lets a measuring failure break the save it measures', async () => {
    const { recordCaptureSaved } = await recorders()
    await expect(recordCaptureSaved({ type: 'clip', via: 'sideways' as never, durationMs: 10 })).resolves.toBeUndefined()
  })
})

describe('capture.save_failed', () => {
  it('maps a quota failure to its stable code instead of an unknown one', async () => {
    const { recordCaptureFailed, metricsSnapshot, QuotaError, EntryValidationError } = await recorders()
    await recordCaptureFailed(new QuotaError({ usage: 9, quota: 10, incomingBytes: 5 }), 'screenshot')
    await recordCaptureFailed(new EntryValidationError('ENTRY_ASSET_MISSING'), 'screenshot')
    await recordCaptureFailed(new Error('something nobody planned for'), 'clip')
    const { byProps } = (await metricsSnapshot())['capture.save_failed']!
    expect(byProps['error_code=STORAGE_QUOTA_EXCEEDED|type=screenshot']).toBe(1)
    expect(byProps['error_code=ENTRY_ASSET_MISSING|type=screenshot']).toBe(1)
    expect(byProps['error_code=OPERATION_FAILED|type=clip']).toBe(1)
  })
})
