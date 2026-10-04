import { describe, expect, it } from 'vitest'
import { popupViewModel, type PopupData } from '../view-model'
import type { Connection } from '../../../utils/connection-status'

const NOW = 1_800_000_000_000
const zhView = (data: PopupData, now: number) => popupViewModel(data, now, 'zh')
const enView = (data: PopupData, now: number) => popupViewModel(data, now, 'en')
const connected: Connection = { online: true, paired: true, detail: 'ok', pendingFragments: 0, pendingAssets: 0, lastSyncAt: NOW - 2 * 60_000 }
const base: PopupData = { connection: connected, lastPullAt: NOW - 5 * 60_000, fragmentCount: 128, dueCount: 5, screenshotCount: 24 }

describe('toolbar popup view model (extension.md §2.3)', () => {
  it('shows status, counts and the Desktop review block when connected with returned data', () => {
    const view = zhView(base, NOW)
    expect(view.status).toEqual({ state: 'connected', label: '已连接 / 2 分钟前交付' })
    expect(view.libraryCount).toBe('128 条')
    expect(view.screenshotCount).toBe('24 张')
    expect(view.desktopReview).toEqual({ text: 'Desktop 上有 5 条到期复习', estimate: '预计 4 分钟', source: '数据来自最近一次回传（5 分钟前）' })
  })

  it('omits the review block entirely when not connected, no data came back, nothing is due or delivery errored', () => {
    expect(zhView({ ...base, connection: { ...connected, paired: false } }, NOW).desktopReview).toBeNull()
    expect(zhView({ ...base, connection: { ...connected, online: false } }, NOW).desktopReview).toBeNull()
    expect(zhView({ ...base, lastPullAt: undefined }, NOW).desktopReview).toBeNull()
    expect(zhView({ ...base, dueCount: 0 }, NOW).desktopReview).toBeNull()
    expect(zhView({ ...base, connection: { ...connected, lastError: 'boom' } }, NOW).desktopReview).toBeNull()
  })

  it('reports the unpaired, pending and error states from the connection', () => {
    expect(zhView({ ...base, connection: { ...connected, paired: false } }, NOW).status?.state).toBe('unpaired')
    expect(zhView({ ...base, connection: { ...connected, pendingFragments: 2, pendingAssets: 1 } }, NOW).status).toEqual({
      state: 'pending',
      label: '待发送 2 条碎片 · 1 张图片',
    })
    expect(zhView({ ...base, connection: { ...connected, lastError: 'x' } }, NOW).status?.state).toBe('error')
  })

  it('leaves counts empty instead of showing zeros when they could not be read', () => {
    const view = zhView({ connection: null, fragmentCount: null, dueCount: null, screenshotCount: null }, NOW)
    expect(view.status).toBeNull()
    expect(view.libraryCount).toBeNull()
    expect(view.screenshotCount).toBeNull()
  })

  it('estimates 45 seconds per due fragment, rounded up to whole minutes', () => {
    expect(zhView({ ...base, dueCount: 1 }, NOW).desktopReview?.estimate).toBe('预计 1 分钟')
    expect(zhView({ ...base, dueCount: 20 }, NOW).desktopReview?.estimate).toBe('预计 15 分钟')
  })

  it('says the same things in English, with singular and plural forms', () => {
    const view = enView(base, NOW)
    expect(view.status).toEqual({ state: 'connected', label: 'Connected / delivered 2 min ago' })
    expect(view.libraryCount).toBe('128 Fragments')
    expect(view.screenshotCount).toBe('24 screenshots')
    expect(view.desktopReview).toEqual({ text: '5 reviews due on Desktop', estimate: 'about 4 min', source: 'from the last sync (5 min ago)' })

    expect(enView({ ...base, fragmentCount: 1, screenshotCount: 1, dueCount: 1 }, NOW)).toMatchObject({
      libraryCount: '1 Fragment',
      screenshotCount: '1 screenshot',
      desktopReview: { text: '1 review due on Desktop' },
    })
    expect(enView({ ...base, connection: { ...connected, pendingFragments: 2, pendingAssets: 1 } }, NOW).status?.label).toBe('Pending · Fragments 2 · images 1')
  })
})
