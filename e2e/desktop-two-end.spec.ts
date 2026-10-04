/**
 * Extension ↔ Desktop, both ends real (roadmap §5 "扩展到 Desktop 的真机两端连测";
 * examples.md §5 scenarios A and B; storage.md §8).
 *
 * The extension is the built one in Chromium and captures through its real UI, including a real
 * screenshot converted into a `visual` fragment. The Desktop is the built macOS app, started as a
 * child process on its own data directory and a free loopback port. Everything between them is the
 * real service worker `fetch` over a real socket; the Desktop's own SQLite file is read back to
 * check what arrived. The Desktop serves only the published extension's origin; the unpacked build
 * under test is named to it with `extensionIds`. macOS only; skipped when the app has not been built.
 */
import { fileURLToPath } from 'node:url'
import { test, expect } from './fixtures'
import { DESKTOP_SKIP_REASON, desktopAvailable, PUBLISHED_EXTENSION_ID, RunningDesktop } from './desktop'
import {
  captureFragmentViaUi,
  clearFragmentStoreViaServiceWorker,
  dragRegion,
  getAssetsFromServiceWorker,
  getFragmentsFromServiceWorker,
  getOutboxFromServiceWorker,
  navigateToFragmentPage,
  setCaptureConfigViaServiceWorker,
  triggerScreenshot,
} from './helpers'
import type { BrowserContext, Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

interface Reply<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

interface DeliveryResult {
  deliveredFragments: number
  deliveredAssets: number
  pruned: number
  rejected: number
  errors: string[]
  authFailed: boolean
  unreachable: boolean
}

/** The service worker only accepts connection changes from an extension page. */
async function send<T = unknown>(page: Page, message: Record<string, unknown>): Promise<Reply<T>> {
  return page.evaluate(m => chrome.runtime.sendMessage(m), message) as Promise<Reply<T>>
}

async function connect(page: Page, desktop: RunningDesktop, overrides: { token?: string; autoSync?: boolean } = {}): Promise<void> {
  const reply = await send(page, {
    type: 'SET_DESKTOP_DIRECT_CONNECT',
    config: { endpoint: desktop.endpoint, token: overrides.token ?? desktop.pairToken, autoSync: overrides.autoSync ?? false },
  })
  expect(reply.success).toBe(true)
}

async function flush(page: Page): Promise<DeliveryResult> {
  const reply = await send<DeliveryResult>(page, { type: 'FLUSH_DESKTOP_DIRECT_CONNECT' })
  expect(reply.success, reply.error).toBe(true)
  return reply.data!
}

const USE_CONCEPT = '在下周的宏观复盘文章里解释这轮债券抛售。'

/** A concept from a web page, an inspiration from the library, a visual from a real screenshot. */
async function captureThreeFragments(context: BrowserContext, page: Page, extensionId: string): Promise<void> {
  await clearFragmentStoreViaServiceWorker(context)
  await setCaptureConfigViaServiceWorker(context, { deepMode: false })

  await navigateToFragmentPage(page)
  await captureFragmentViaUi(page, { kind: 'concept', use: USE_CONCEPT })

  await page.goto(`chrome-extension://${extensionId}/library.html`)
  await page.getByTestId('new-inspiration').click()
  const modal = page.locator('[data-ann-ui="capture-modal"]')
  await expect(modal).toBeVisible()
  await modal.locator('textarea').first().fill('把核验步骤做成一键回到原文')
  await modal.getByTestId('modal-next').click()
  await modal.locator('textarea[placeholder="什么触发了这个想法？（必填）"]').fill('读到间隔重复文献时想到的。')
  await modal.getByRole('checkbox', { name: '确认已核对' }).check()
  await modal.getByTestId('modal-next').click()
  await modal.locator('textarea[placeholder="写下准备如何使用、验证或迁移（必填）"]').fill('下次设计采集流程时先做这个。')
  await modal.getByRole('button', { name: '保存到碎片库' }).click()
  await expect(modal).toHaveCount(0, { timeout: 5000 })

  await page.goto('http://localhost:8173/screenshot.html')
  await page.waitForSelector('ann-selection', { state: 'attached' })
  await triggerScreenshot(page)
  await dragRegion(page)
  const preview = page.locator('[data-ann-ui="screenshot-preview"]')
  await expect(preview).toBeVisible({ timeout: 10_000 })
  await page.locator('[data-ann-ui="screenshot-save"]').click()
  await expect(preview).toHaveCount(0, { timeout: 10_000 })
  await page.goto(`chrome-extension://${extensionId}/library.html`)
  await page.getByTestId('view-screenshots').click()
  const card = page.getByTestId('screenshots-list').getByTestId('screenshot-card').first()
  await expect(card.locator('img')).toBeVisible({ timeout: 10_000 })
  await card.getByTestId('screenshot-to-fragment').click()
  const form = page.locator('[data-ann-ui="visual-form"]')
  await form.getByTestId('visual-content').fill('净值曲线在加息后出现三次深回撤')
  await form.getByTestId('visual-verify').click()
  await form.getByTestId('visual-use').fill('用于下周风险复盘的图示。')
  await form.getByTestId('visual-save').click()
  await expect(form).toHaveCount(0, { timeout: 5000 })
}

test.describe('extension ↔ Desktop — the real app over loopback', () => {
  test.skip(!desktopAvailable(), DESKTOP_SKIP_REASON)
  test.setTimeout(120_000)

  let desktop: RunningDesktop | undefined

  test.afterEach(async () => {
    await desktop?.stop()
    desktop = undefined
  })

  // ── the app itself ────────────────────────────────────────────────────

  test('a normal launch shows the main window; menu-bar-only mode has none; both listen', async () => {
    desktop = await RunningDesktop.start({ window: true })
    const shown = await desktop.waitForState(s => s.mainWindowVisible)
    expect(shown.mainWindowVisible).toBe(true)
    expect(shown.visibleWindowCount).toBe(1)
    expect(shown.activationPolicy).toBe('regular') // a Dock icon and a menu bar while the window is open
    expect(shown.hub).toBe(`ready:${desktop.port}`)
    expect(shown.section).toBe('library') // first run: the empty state that explains pairing
    expect((await fetch(`${desktop.endpoint}/health`)).status).toBe(200)
    await desktop.stop()

    desktop = await RunningDesktop.start({ window: false })
    const hidden = await desktop.state()
    expect(hidden.mainWindowVisible).toBe(false)
    expect(hidden.visibleWindowCount).toBe(0)
    expect(hidden.activationPolicy).toBe('accessory')
    expect((await fetch(`${desktop.endpoint}/health`)).status).toBe(200)
  })

  test('the keyboard works in the real window: ⌘1–⌘3, ⌘K with ↑↓ ↵ Esc, ⌘, and 开始复习', async () => {
    desktop = await RunningDesktop.start({ window: true })
    // One fragment, so there is something due.
    const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../app/Tests/AnnHubCoreTests/Fixtures/fragment-put-concept.json')
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
    const put = await fetch(`${desktop.endpoint}/v1/fragments/${fixture.fragment.id}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${desktop.pairToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(fixture),
    })
    expect(put.status).toBe(201)
    await desktop.waitForState(s => s.fragmentCount === 1)

    // Pages are menu commands.
    expect((await desktop.press('cmd+3')).section).toBe('system')
    expect((await desktop.press('cmd+2')).section).toBe('library')
    expect((await desktop.press('cmd+1')).section).toBe('today')

    // ⌘K opens the palette, Esc closes it.
    expect((await desktop.press('cmd+k')).paletteVisible).toBe(true)
    expect((await desktop.press('escape')).paletteVisible).toBe(false)

    // Type, move down twice with ↓, run with ↵: "打开" lists 今日, 碎片库, 系统页 … — the third one runs.
    const toSystem = await desktop.press('cmd+1', 'cmd+k', 'type:打开', 'down', 'down', 'return')
    expect(toSystem).toMatchObject({ section: 'system', paletteVisible: false })
    // ↑ moves back up one: the second runs.
    const toLibrary = await desktop.press('cmd+1', 'cmd+k', 'type:打开', 'down', 'down', 'up', 'return')
    expect(toLibrary).toMatchObject({ section: 'library', paletteVisible: false })

    // 开始复习 is offered because something is due, and opens the review sheet.
    const review = await desktop.press('cmd+1', 'cmd+k', 'type:开始', 'return')
    expect(review).toMatchObject({ section: 'today', paletteVisible: false, reviewSheetPresented: true })

    // ⌘, opens the settings window next to the main one (the review sheet counts as a window too).
    const before = (await desktop.state()).visibleWindowCount
    expect((await desktop.press('cmd+,')).visibleWindowCount).toBe(before + 1)
  })

  // ── scenario A → B ────────────────────────────────────────────────────

  test('saved offline, then paired: every fragment and the image arrive once, intact; a revision does not touch the review', async ({ page, context, extensionId }) => {
    await captureThreeFragments(context, page, extensionId)

    const local = await getFragmentsFromServiceWorker(context)
    expect(local.map(f => f.kind).sort()).toEqual(['concept', 'inspiration', 'visual'])
    const outbox = await getOutboxFromServiceWorker(context)
    expect(outbox.filter(e => e.type.startsWith('fragment.'))).toHaveLength(3) // nothing is lost while no Desktop is known
    expect(outbox.filter(e => e.type === 'asset.created')).toHaveLength(1)
    const [asset] = await getAssetsFromServiceWorker(context)
    expect(asset.byteLength).toBeGreaterThan(0)

    // Install and pair the Desktop later (examples.md §3.2): the code comes from the app.
    desktop = await RunningDesktop.start({ extensionIds: [extensionId] })
    expect((await desktop.state()).fragmentCount).toBe(0)
    await page.goto(`chrome-extension://${extensionId}/library.html`)
    await connect(page, desktop)

    const result = await flush(page)
    expect(result.errors).toEqual([])
    expect(result.deliveredFragments).toBe(3)
    expect(result.deliveredAssets).toBe(1)
    expect(await getOutboxFromServiceWorker(context)).toHaveLength(0) // only a confirmed write clears a task

    // The app saw them without anyone touching it.
    const state = await desktop.waitForState(s => s.fragmentCount === 3)
    expect(state.fragmentCount).toBe(3)
    expect(state.deliveredFragmentCount).toBe(3)
    expect(state.dueCount).toBe(3) // new fragments are due at once
    expect(state.section).toBe('today') // the empty state gave way to 今日
    expect(state.hasConnected).toBe(true)
    expect([...state.recentDeliveryStatuses].sort()).toEqual([201, 201, 201, 201])

    // And its own database holds exactly what the extension sent.
    const rows = desktop.sql<{ id: string; kind: string; content: string; capture_revision: number; source_device_id: string; processing_json: string; review_json: string }>(
      'select id, kind, content, capture_revision, source_device_id, processing_json, review_json from fragments order by id',
    )
    expect(rows.map(r => r.id).sort()).toEqual(local.map(f => f.id).sort())
    expect(new Set(rows.map(r => r.source_device_id)).size).toBe(1)
    expect(rows[0].source_device_id).not.toBe('')
    for (const row of rows) {
      const original = local.find(f => f.id === row.id)!
      expect(row.kind).toBe(original.kind)
      expect(row.content).toBe(original.content)
      expect(row.capture_revision).toBe(1)
      expect(JSON.parse(row.processing_json).use).toBe(original.processing.use)
      expect(JSON.parse(row.review_json).state).toBe('new') // initialized by the Desktop, never sent by the extension
    }
    const images = desktop.sql<{ id: string; byte_length: number; sha256: string; mime_type: string }>('select id, byte_length, sha256, mime_type from assets')
    expect(images).toEqual([{ id: asset.id, byte_length: asset.byteLength, sha256: asset.sha256, mime_type: asset.mimeType }])

    // Delivering again is a no-op: nothing pending, nothing duplicated.
    expect(await flush(page)).toMatchObject({ deliveredFragments: 0, deliveredAssets: 0, errors: [] })
    expect(desktop.sql<{ n: number }>('select count(*) n from fragments')[0].n).toBe(3)

    // The user reviews on the Desktop (stood in for here: the app can't be clicked headlessly) ...
    const concept = local.find(f => f.kind === 'concept')!
    desktop.sqlWrite(
      `update fragments set review_json = json_set(review_json, '$.state', 'review', '$.repetitions', 2, '$.intervalDays', 6, '$.lastReviewedAt', 1790000000000, '$.nextReviewAt', 4102444800000) where id = '${concept.id}'`,
    )
    // ... then edits the fragment in the extension: a new revision is delivered.
    const edited = await send(page, { type: 'UPDATE_FRAGMENT', id: concept.id, patch: { use: '改写后的应用：复盘时先检查客户端重试。' } })
    expect(edited.success, edited.error).toBe(true)
    const again = await flush(page)
    expect(again).toMatchObject({ deliveredFragments: 1, errors: [] })

    const after = desktop.sql<{ capture_revision: number; processing_json: string; review_json: string }>(
      `select capture_revision, processing_json, review_json from fragments where id = '${concept.id}'`,
    )[0]
    expect(after.capture_revision).toBe(2)
    expect(JSON.parse(after.processing_json).use).toBe('改写后的应用：复盘时先检查客户端重试。')
    const review = JSON.parse(after.review_json)
    expect(review).toMatchObject({ state: 'review', repetitions: 2, intervalDays: 6 }) // the Desktop's own facts survive
    expect(desktop.sql<{ n: number }>('select count(*) n from fragments')[0].n).toBe(3)
  })

  test('auto sync: a fragment saved after pairing reaches the Desktop with no further action', async ({ page, context, extensionId }) => {
    await clearFragmentStoreViaServiceWorker(context)
    await setCaptureConfigViaServiceWorker(context, { deepMode: false })
    desktop = await RunningDesktop.start({ extensionIds: [extensionId] })
    await page.goto(`chrome-extension://${extensionId}/library.html`)
    await connect(page, desktop, { autoSync: true })

    await navigateToFragmentPage(page)
    await captureFragmentViaUi(page, { kind: 'concept', use: USE_CONCEPT })

    const state = await desktop.waitForState(s => s.fragmentCount === 1, 15_000)
    expect(state.deliveredFragmentCount).toBe(1)
    expect(state.section).toBe('today')
    expect(await getOutboxFromServiceWorker(context)).toHaveLength(0)

    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${extensionId}/popup.html`)
    await expect(popup.getByTestId('popup-status')).toContainText('已连接', { timeout: 10_000 })
  })

  // ── the connection breaking and coming back ───────────────────────────

  test('the Desktop being closed loses nothing: the queue waits, then drains on the same address after a restart', async ({ page, context, extensionId }) => {
    await clearFragmentStoreViaServiceWorker(context)
    await setCaptureConfigViaServiceWorker(context, { deepMode: false })
    desktop = await RunningDesktop.start({ extensionIds: [extensionId] })
    const { dir, port } = desktop
    await page.goto(`chrome-extension://${extensionId}/library.html`)
    await connect(page, desktop)

    // First fragment: delivered.
    await navigateToFragmentPage(page)
    await captureFragmentViaUi(page, { kind: 'concept', use: USE_CONCEPT })
    await page.goto(`chrome-extension://${extensionId}/library.html`)
    expect(await flush(page)).toMatchObject({ deliveredFragments: 1, errors: [] })
    const first = await getFragmentsFromServiceWorker(context)
    await desktop.stop()

    // The Desktop is closed: saving still works, delivery reports "unreachable" and keeps the task.
    await page.goto('http://localhost:8173/fragment.html')
    await page.waitForSelector('ann-selection', { state: 'attached' })
    await page.evaluate(() => (document.querySelector('[data-testid="fragment-target"]')!.textContent = 'rate-sensitive technology shares'))
    await captureFragmentViaUi(page, { kind: 'concept', use: '看科技股估值对利率的敏感度。' })
    await page.goto(`chrome-extension://${extensionId}/library.html`)
    const offline = await flush(page)
    expect(offline.unreachable).toBe(true)
    expect(offline.deliveredFragments).toBe(0)
    expect((await getOutboxFromServiceWorker(context)).filter(e => e.type.startsWith('fragment.'))).toHaveLength(1)
    expect(await getFragmentsFromServiceWorker(context)).toHaveLength(2) // and nothing was lost locally

    // Back on the same port with the same data: what arrived before the quit is still there.
    desktop = await RunningDesktop.start({ dir, port, extensionIds: [extensionId] })
    expect(desktop.pairToken).toBeTruthy()
    const restarted = await desktop.state()
    expect(restarted.fragmentCount).toBe(1)
    expect(restarted.hub).toBe(`ready:${port}`)
    const drained = await flush(page)
    expect(drained).toMatchObject({ deliveredFragments: 1, errors: [] })
    expect(await getOutboxFromServiceWorker(context)).toHaveLength(0)
    const state = await desktop.waitForState(s => s.fragmentCount === 2)
    expect(state.fragmentCount).toBe(2)
    expect(
      desktop
        .sql<{ id: string }>('select id from fragments')
        .map(r => r.id)
        .sort(),
    ).toEqual((await getFragmentsFromServiceWorker(context)).map(f => f.id).sort())
    expect(first).toHaveLength(1)
  })

  // ── pairing ───────────────────────────────────────────────────────────

  test('a wrong pairing code stops delivery, keeps the queue, and the right code then delivers', async ({ page, context, extensionId }) => {
    await clearFragmentStoreViaServiceWorker(context)
    await setCaptureConfigViaServiceWorker(context, { deepMode: false })
    await navigateToFragmentPage(page)
    await captureFragmentViaUi(page, { kind: 'concept', use: USE_CONCEPT })

    desktop = await RunningDesktop.start({ extensionIds: [extensionId] })
    await page.goto(`chrome-extension://${extensionId}/library.html`)
    await connect(page, desktop, { token: 'WRONG-CODE-0000' })
    const refused = await flush(page)
    expect(refused.authFailed).toBe(true)
    expect(refused.deliveredFragments).toBe(0)
    expect((await getOutboxFromServiceWorker(context)).filter(e => e.type.startsWith('fragment.'))).toHaveLength(1)
    const state = await desktop.state()
    expect(state.fragmentCount).toBe(0)
    expect(state.recentDeliveryStatuses).toEqual([401])

    await connect(page, desktop) // the real code from the Desktop's 系统 page
    expect(await flush(page)).toMatchObject({ deliveredFragments: 1, authFailed: false, errors: [] })
    expect((await desktop.waitForState(s => s.fragmentCount === 1)).fragmentCount).toBe(1)
  })

  // ── deleting on the Desktop ───────────────────────────────────────────

  test('a fragment the Desktop deleted is not brought back by the extension, which keeps its own copy', async ({ page, context, extensionId }) => {
    await clearFragmentStoreViaServiceWorker(context)
    await setCaptureConfigViaServiceWorker(context, { deepMode: false })
    desktop = await RunningDesktop.start({ extensionIds: [extensionId] })
    await page.goto(`chrome-extension://${extensionId}/library.html`)
    await connect(page, desktop)
    await navigateToFragmentPage(page)
    await captureFragmentViaUi(page, { kind: 'concept', use: USE_CONCEPT })
    await page.goto(`chrome-extension://${extensionId}/library.html`)
    expect(await flush(page)).toMatchObject({ deliveredFragments: 1 })
    const [fragment] = await getFragmentsFromServiceWorker(context)

    // What the app's 删除本地副本 does to its database (stood in for here): the row and its logs go,
    // a deletion marker stays.
    desktop.sqlWrite(
      `delete from fragments where id = '${fragment.id}'; delete from review_logs where target_fragment_id = '${fragment.id}'; insert into fragment_deletions (fragment_id, deleted_at) values ('${fragment.id}', ${Date.now()});`,
    )

    // The extension edits it and delivers the new revision: 410. Nothing returns to the Desktop, and the
    // task is not silently dropped either: it stays, marked rejected, for the user to see and dismiss.
    expect((await send(page, { type: 'UPDATE_FRAGMENT', id: fragment.id, patch: { use: '改写：不应让它复活。' } })).success).toBe(true)
    const result = await flush(page)
    expect(result.deliveredFragments).toBe(0)
    expect(result.rejected).toBe(1)
    expect(result.errors.join(' ')).toContain('已在 Desktop 本地删除')
    const parked = await getOutboxFromServiceWorker(context)
    expect(parked).toHaveLength(1)
    expect(parked[0].rejection).toMatchObject({ code: 'DESKTOP_DELETED', status: 410 })
    // A parked task is not retried by itself: the Desktop is not asked again.
    const asked = (await desktop.state()).recentDeliveryStatuses.length
    expect(await flush(page)).toMatchObject({ deliveredFragments: 0, rejected: 0, errors: [] })
    expect((await desktop.state()).recentDeliveryStatuses).toHaveLength(asked)
    // Dismissing it is the user's decision; then the queue is empty.
    expect((await send(page, { type: 'RESOLVE_REJECTED_DELIVERIES', action: 'dismiss' })).success).toBe(true)
    expect(await getOutboxFromServiceWorker(context)).toHaveLength(0)
    expect(desktop.sql<{ n: number }>('select count(*) n from fragments')[0].n).toBe(0)
    expect(desktop.sql<{ n: number }>(`select count(*) n from fragment_deletions where fragment_id = '${fragment.id}'`)[0].n).toBe(1)
    expect((await getFragmentsFromServiceWorker(context)).map(f => f.id)).toEqual([fragment.id]) // deletes never cross
  })

  // ── who may talk to it ────────────────────────────────────────────────

  test('an extension that is not the published one is refused (403) until the Desktop is told to allow it', async ({ page, context, extensionId }) => {
    test.skip(extensionId === PUBLISHED_EXTENSION_ID, 'this build carries the store key, so it is the published extension')
    await clearFragmentStoreViaServiceWorker(context)
    await setCaptureConfigViaServiceWorker(context, { deepMode: false })
    await navigateToFragmentPage(page)
    await captureFragmentViaUi(page, { kind: 'concept', use: USE_CONCEPT })

    // A Desktop that knows only the published id: the right code is not enough from another origin.
    desktop = await RunningDesktop.start()
    await page.goto(`chrome-extension://${extensionId}/library.html`)
    await connect(page, desktop)
    const refused = await flush(page)
    expect(refused.authFailed).toBe(true)
    expect(refused.deliveredFragments).toBe(0)
    expect(refused.errors.join(' ')).toContain('来源被拒绝')
    expect((await getOutboxFromServiceWorker(context)).filter(e => e.type.startsWith('fragment.'))).toHaveLength(1) // kept, not parked
    const state = await desktop.state()
    expect(state.fragmentCount).toBe(0)
    expect(state.hasConnected).toBe(false) // a refused origin is not "the extension connected"
    expect(state.recentDeliveryStatuses).toEqual([403])
    await desktop.stop()

    // The same build, named at launch (what this suite does everywhere else), is served.
    desktop = await RunningDesktop.start({ extensionIds: [extensionId] })
    await connect(page, desktop)
    expect(await flush(page)).toMatchObject({ deliveredFragments: 1, authFailed: false, errors: [] })
    expect((await desktop.waitForState(s => s.fragmentCount === 1)).fragmentCount).toBe(1)
  })

  test('a web page cannot write to the Desktop, even holding the pairing code', async ({ page }) => {
    desktop = await RunningDesktop.start()
    await page.goto('http://localhost:8173/test.html')
    const attempts = await page.evaluate(
      async ({ endpoint, token }) => {
        const outcome = async (run: () => Promise<Response>) => {
          try {
            return { reached: true, status: (await run()).status }
          } catch (error) {
            return { reached: false, error: String(error) }
          }
        }
        return {
          write: await outcome(() =>
            fetch(`${endpoint}/v1/fragments/from-a-web-page`, {
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: '{}',
            }),
          ),
          health: await outcome(() => fetch(`${endpoint}/health`)),
        }
      },
      { endpoint: desktop.endpoint, token: desktop.pairToken },
    )
    // Without CORS headers the browser never hands a response to the page ...
    expect(attempts.write.reached).toBe(false)
    expect(attempts.health.reached).toBe(false)
    // ... and the Desktop counted neither as a connection nor a delivery: it refused both by Origin.
    const state = await desktop.state()
    expect(state.fragmentCount).toBe(0)
    expect(state.hasConnected).toBe(false)
    expect(state.recentDeliveryStatuses).toEqual([])
  })
})
