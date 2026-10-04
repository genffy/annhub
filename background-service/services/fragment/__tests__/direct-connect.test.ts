import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_DIRECT_CONNECT, pullDesktopChanges } from '../direct-connect'
import type { SeqChange } from '../../../../learning-core/sync'

const config = { ...DEFAULT_DIRECT_CONNECT, token: 'tok' }

function page(changes: SeqChange[], nextCursor?: string): Response {
  return new Response(JSON.stringify({ changes, nextCursor }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

const ratedChange: SeqChange = {
  seq: 7,
  type: 'review.rated',
  fragmentId: 'f1',
  review: { state: 'review', repetitions: 1, lapses: 0, intervalDays: 1, easeFactor: 2.5, nextReviewAt: 1 },
  log: {
    id: 'log_1',
    target: { type: 'fragment', fragmentId: 'f1' },
    rating: 'good',
    reviewedAt: 1,
    previousIntervalDays: 0,
    nextIntervalDays: 1,
    usedHint: false,
    schedulerVersion: 'four-tier-v1',
  },
}

describe('pullDesktopChanges (storage.md §9)', () => {
  it('drains pages and only advances the cursor after applying', async () => {
    const applied: SeqChange[][] = []
    const cursors: string[] = []
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(page([ratedChange], '7'))
      .mockResolvedValueOnce(page([{ seq: 8, type: 'fragment.deleted', fragmentId: 'f2' }], '8'))
      .mockResolvedValueOnce(page([], undefined))
    const result = await pullDesktopChanges(
      config,
      {
        getCursor: async () => undefined,
        setCursor: async (c: string) => {
          cursors.push(c)
        },
        apply: async changes => {
          applied.push(changes)
          return { reports: [] }
        },
      },
      fetchImpl as unknown as typeof fetch,
    )

    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(fetchImpl.mock.calls[0]![0]).toContain('/v1/changes?cursor=0')
    expect(applied).toHaveLength(2)
    expect(cursors).toEqual(['7', '8'])
    expect(result.appliedChanges).toBe(2)
    expect(result.errors).toHaveLength(0)
  })

  it('auth failure stops the pull without moving the cursor', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 401 }))
    const setCursor = vi.fn()
    const result = await pullDesktopChanges(
      config,
      {
        getCursor: async () => '12',
        setCursor,
        apply: async () => ({ reports: [] }),
      },
      fetchImpl as unknown as typeof fetch,
    )
    expect(result.authFailed).toBe(true)
    expect(setCursor).not.toHaveBeenCalled()
  })

  it('network failure keeps state for a later retry', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom'))
    const result = await pullDesktopChanges(
      config,
      {
        getCursor: async () => '3',
        setCursor: async () => {},
        apply: async () => ({ reports: [] }),
      },
      fetchImpl as unknown as typeof fetch,
    )
    expect(result.unreachable).toBe(true)
    expect(result.errors[0]).toContain('Desktop 未运行')
  })

  it('missing token reports without calling the hub', async () => {
    const fetchImpl = vi.fn()
    const result = await pullDesktopChanges(
      { ...config, token: '' },
      {
        getCursor: async () => undefined,
        setCursor: async () => {},
        apply: async () => ({ reports: [] }),
      },
      fetchImpl as unknown as typeof fetch,
    )
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.errors[0]).toContain('未配置配对码')
  })
})
