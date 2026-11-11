import { expect, test } from './fixtures'
import { clearLibrary, ensureServiceWorker, getCapturePageUrl, stopServiceWorker } from './helpers'

/**
 * RV-CORE-11's measurement, rerunnable: at the review's realistic 10,000-entry body, the first
 * list query after the service worker was stopped (cold: worker start plus the full summaries
 * read) against the same query again (hot). This spec changes nothing about the query path; it
 * prints the two numbers, and asserts only that both answered.
 */
test('cold and hot first-page query latency at 10,000 entries (RV-CORE-11)', async ({ page, extensionId }) => {
  test.setTimeout(240_000)
  const context = page.context()
  await clearLibrary(context)

  // A library with the body sizes the review measured (RV-BG-04), written straight into
  // IndexedDB the way e2e/library-browse.spec.ts seeds its perf cases.
  const sw = await ensureServiceWorker(context)
  await sw.evaluate(
    total =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('annhub')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const tx = open.result.transaction('entries', 'readwrite')
          const entries = tx.objectStore('entries')
          const small = 'retry '.repeat(85)
          const medium = 'backoff '.repeat(750)
          const large = 'jitter '.repeat(7_100)
          for (let i = 0; i < total; i++) {
            entries.put({
              id: `ent_perf_${String(i).padStart(5, '0')}`,
              type: 'clip',
              content: i % 10 === 0 ? large : i % 10 < 3 ? medium : small,
              sourceUrl: `https://host-${i % 40}.example.com/${i}`,
              sourceHost: `host-${i % 40}.example.com`,
              properties: { title: `Record ${i}`, tags: [i % 10 === 0 ? 'jitter' : 'retry'] },
              createdAt: i + 1,
              updatedAt: i + 1,
            })
          }
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        }
      }),
    10_000,
  )

  // The library page answers in place: one QUERY_ENTRIES round trip, timed from the page.
  const library = await context.newPage()
  await library.goto(`chrome-extension://${extensionId}/library.html#/all`)
  const timeQuery = () =>
    library.evaluate(async () => {
      const startedAt = performance.now()
      const response = await new Promise<{ success: boolean }>(resolve => {
        chrome.runtime.sendMessage({ type: 'QUERY_ENTRIES', query: { limit: 50 } }, (answer: { success: boolean }) => resolve(answer))
      })
      return { ms: Math.round(performance.now() - startedAt), success: response.success }
    })

  // The very first query also builds the derived search documents the seeding skipped, and the
  // 65 MB write keeps the store busy after it: settle, then warm up, then measure.
  await library.waitForLoadState('domcontentloaded')
  await library.waitForTimeout(3_000)
  await timeQuery()
  await timeQuery()
  const hot = await timeQuery()
  await stopServiceWorker(context, library)
  const cold = await timeQuery()

  console.log(`[RV-CORE-11] 10,000 entries: cold first query ${cold.ms} ms (worker start + summaries read), hot ${hot.ms} ms`)
  expect(cold.success).toBe(true)
  expect(hot.success).toBe(true)
  await library.close()
  await page.goto(getCapturePageUrl()).catch(() => undefined)
})
