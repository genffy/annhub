import { test, expect } from './fixtures'
import { ensureServiceWorker } from './helpers'

/**
 * The local-metrics panel (metrics.md §5, §10; roadmap V-prep): the settings
 * page answers M-03, M-11 and M-19–M-25 as aggregate numbers computed from the
 * event store. The store is seeded across a Sunday/Monday boundary in the browser's local
 * calendar, then both weeks are checked. Adjacent days do not always share a week.
 */

test('the settings panel covers M-03, M-11 and M-19–M-25 from the event store', async ({ page, extensionId }) => {
  const sw = await ensureServiceWorker(page.context())
  const { firstSaveDay, captureWeek, reopenWeek } = await sw.evaluate(async () => {
    const monday = new Date()
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    const pad = (n: number) => String(n).padStart(2, '0')
    const dayKey = (offset: number) => {
      const d = new Date(monday)
      d.setDate(d.getDate() + offset)
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    }
    const shape: Record<string, Record<string, { total: number; byProps: Record<string, number> }>> = {}
    const add = (event: string, day: string, props: Record<string, string | boolean>) => {
      const bucket = ((shape[event] ??= {})[day] ??= { total: 0, byProps: {} })
      bucket.total++
      const key = Object.keys(props)
        .sort()
        .map(name => `${name}=${String(props[name])}`)
        .join('|')
      bucket.byProps[key] = (bucket.byProps[key] ?? 0) + 1
    }
    // Sunday, in the previous week: block saves (4 without a level change, 1 with), one undo, two screenshots (one frame reused), one beautified copy, two queries
    for (let i = 0; i < 4; i++) add('capture.saved', dayKey(-1), { type: 'clip', via: 'block', block_kind: 'code', level_changed: false, duration: '<150ms' })
    add('capture.saved', dayKey(-1), { type: 'clip', via: 'block', block_kind: 'code', level_changed: true, duration: '150-300ms' })
    add('capture.undone', dayKey(-1), { type: 'clip', via: 'block' })
    add('capture.saved', dayKey(-1), { type: 'screenshot', via: 'shortcut', frame: 'drag', duration: '<150ms' })
    add('capture.saved', dayKey(-1), { type: 'screenshot', via: 'shortcut', frame: 'reused', duration: '<150ms' })
    add('screenshot.copied', dayKey(-1), { watermark: false, beautify: true })
    add('library.queried', dayKey(-1), { has_text: false, filters: '1-2', results: '1-2' })
    add('library.queried', dayKey(-1), { has_text: true, filters: '0', results: '0' })
    // Monday, in the current week: two selection clips, a reopen the day after the first save, one highlight, one custom property edit
    add('capture.saved', dayKey(0), { type: 'clip', via: 'menu', duration: '<150ms' })
    add('capture.saved', dayKey(0), { type: 'clip', via: 'menu', duration: '<150ms' })
    add('entry.reopened', dayKey(0), { type: 'clip' })
    add('highlight.created', dayKey(0), { has_note: false, via: 'toolbar' })
    add('entry.property_edited', dayKey(0), { scope: 'custom', property_type: 'text' })
    // A query in the reopen week satisfies H-16 there; Sunday's queries must stay in the previous week.
    add('library.queried', dayKey(0), { has_text: true, filters: '0', results: '1-2' })
    await chrome.storage.local.set({ 'annhub.metrics': shape })
    return { firstSaveDay: dayKey(-1), captureWeek: dayKey(-7), reopenWeek: dayKey(0) }
  })

  await page.goto(`chrome-extension://${extensionId}/library.html#/settings`)
  await page.getByRole('button', { name: '刷新指标' }).click()

  const summary = page.getByTestId('metrics-summary')
  // M-03: per entrance, durations as the buckets holding the median and p95, plus the clip guardrail
  await expect(summary).toContainText('选区剪藏')
  await expect(summary).toContainText('2 次 · 中位 <150ms · 95 分位 <150ms')
  await expect(summary).toContainText('95 分位低于 300ms')
  // M-11: a reopen on the day after the first save activates, at day granularity
  await expect(summary).toContainText('已激活')
  await expect(summary).toContainText(firstSaveDay)
  // M-20: this install edited a property in the window
  await expect(summary).toContainText('是 · 编辑 1 次')
  // M-23: (4 unlevelled − 1 undo) / 5 block saves
  await expect(summary).toContainText('60%')
  await expect(summary).toContainText('撤销 1')
  // M-25: 1 reused frame of 2 screenshots
  await expect(summary).toContainText('50%')

  const weeks = page.getByTestId('metrics-weeks')
  await expect(weeks.locator('tbody tr')).toHaveCount(6)
  const previousWeek = weeks.locator('tbody tr').filter({ hasText: captureWeek })
  await expect(previousWeek.locator('td').nth(1)).toHaveText('0') // Monday's reopen belongs to the next week
  await expect(previousWeek.locator('td').nth(4)).toHaveText('2') // Sunday's searches & filters
  await expect(previousWeek.locator('td').nth(5)).toHaveText('否')
  const currentWeek = weeks.locator('tbody tr').filter({ hasText: reopenWeek })
  await expect(currentWeek.locator('td').nth(1)).toHaveText('1')
  await expect(currentWeek.locator('td').nth(4)).toHaveText('1')
  await expect(currentWeek.locator('td').nth(5)).toHaveText('是') // H-16 requires a query and a reopen in the same week

  const events = page.getByTestId('metrics-table')
  await expect(events.locator('tr').filter({ hasText: 'capture.saved' }).locator('td').nth(1)).toHaveText('9')
})
