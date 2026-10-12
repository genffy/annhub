import { test, expect } from './fixtures'
import { ensureServiceWorker } from './helpers'

/**
 * The local-metrics panel (metrics.md §5, §10; roadmap V-prep): the settings
 * page answers M-03, M-11 and M-19–M-25 as aggregate numbers computed from the
 * event store. The store is seeded with a known shape (relative days, local
 * dates — the panel's weeks and windows are local), then the panel is read.
 */

function localDay(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** The Monday of the week holding `localDay(offset)` — parsed as a local date, not UTC midnight. */
function weekOf(offset: number): string {
  const [y, m, d] = localDay(offset).split('-').map(Number)
  const date = new Date(y!, m! - 1, d!)
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

test('the settings panel covers M-03, M-11 and M-19–M-25 from the event store', async ({ page, extensionId }) => {
  const sw = await ensureServiceWorker(page.context())
  await sw.evaluate(() => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const dayKey = (offset: number) => {
      const d = new Date()
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
    // two days ago: block saves (4 without a level change, 1 with), one undo, two screenshots (one frame reused), one beautified copy, two queries
    for (let i = 0; i < 4; i++) add('capture.saved', dayKey(-2), { type: 'clip', via: 'block', block_kind: 'code', level_changed: false, duration: '<150ms' })
    add('capture.saved', dayKey(-2), { type: 'clip', via: 'block', block_kind: 'code', level_changed: true, duration: '150-300ms' })
    add('capture.undone', dayKey(-2), { type: 'clip', via: 'block' })
    add('capture.saved', dayKey(-2), { type: 'screenshot', via: 'shortcut', frame: 'drag', duration: '<150ms' })
    add('capture.saved', dayKey(-2), { type: 'screenshot', via: 'shortcut', frame: 'reused', duration: '<150ms' })
    add('screenshot.copied', dayKey(-2), { watermark: false, beautify: true })
    add('library.queried', dayKey(-2), { has_text: false, filters: '1-2', results: '1-2' })
    add('library.queried', dayKey(-2), { has_text: true, filters: '0', results: '0' })
    // yesterday: two selection clips, a reopen the day after the first save, one highlight, one custom property edit
    add('capture.saved', dayKey(-1), { type: 'clip', via: 'menu', duration: '<150ms' })
    add('capture.saved', dayKey(-1), { type: 'clip', via: 'menu', duration: '<150ms' })
    add('entry.reopened', dayKey(-1), { type: 'clip' })
    add('highlight.created', dayKey(-1), { has_note: false, via: 'toolbar' })
    add('entry.property_edited', dayKey(-1), { scope: 'custom', property_type: 'text' })
    return chrome.storage.local.set({ 'annhub.metrics': shape })
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
  await expect(summary).toContainText(localDay(-2))
  // M-20: this install edited a property in the window
  await expect(summary).toContainText('是 · 编辑 1 次')
  // M-23: (4 unlevelled − 1 undo) / 5 block saves
  await expect(summary).toContainText('60%')
  await expect(summary).toContainText('撤销 1')
  // M-25: 1 reused frame of 2 screenshots
  await expect(summary).toContainText('50%')

  const weeks = page.getByTestId('metrics-weeks')
  await expect(weeks.locator('tbody tr')).toHaveCount(6)
  const activeWeek = weeks.locator('tbody tr').filter({ hasText: weekOf(-2) })
  await expect(activeWeek.locator('td').nth(1)).toHaveText('1') // reopens
  await expect(activeWeek.locator('td').nth(4)).toHaveText('2') // searches & filters
  await expect(activeWeek.locator('td').nth(5)).toHaveText('是') // H-16's weekly reading

  const events = page.getByTestId('metrics-table')
  await expect(events.locator('tr').filter({ hasText: 'capture.saved' }).locator('td').nth(1)).toHaveText('9')
})
