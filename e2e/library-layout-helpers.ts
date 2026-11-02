/**
 * Shared setup for the library-layout specs: the message sender, the 1×1 PNG and the card seed that
 * both files use. Moved verbatim from library-layout.spec.ts when the card-grid tests moved to their
 * own file.
 */
import type { Page } from '@playwright/test'
import { clearLibrary } from './helpers'
import { expect } from './fixtures'

export async function send(page: Page, message: Record<string, unknown>): Promise<void> {
  const response = await page.evaluate(payload => chrome.runtime.sendMessage(payload), message)
  expect(response?.success, `${String(message.type)}: ${response?.error}`).toBe(true)
}

// a 1×1 PNG data URL, for entry assets in seeds
export const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/qMwAAAAASUVORK5CYII='

export async function seedCards(page: Page, extensionId: string): Promise<void> {
  await clearLibrary(page.context())
  await page.goto(`chrome-extension://${extensionId}/sample.html`)
  const long = 'Retries amplify the load when every client backs off together and tries again at once. '.repeat(8).trim()
  const clips: Array<[string, string, string[], number]> = [
    ['Retries and backpressure: why a saturated dependency gets worse when every client retries at once', long, ['reliability', 'retry', 'distributed-systems'], 3],
    ['Inbox', 'A short clip.', [], 0],
    ['Exponential backoff with jitter', 'Jitter spreads retries so clients do not stampede.', ['retry'], 1],
    ['Load shedding', 'Reject the request at the edge before it consumes a thread.', [], 2],
    ['Circuit breakers', long, ['sre'], 1],
    ['为什么重试会放大故障', '当下游已经饱和时，每个超时的客户端都会再试一次。', ['可靠性', '重试'], 0],
  ]
  for (const [index, [title, content, tags, highlights]] of clips.entries()) {
    const id = `ent_card_${index}`
    await send(page, {
      type: 'SAVE_CLIP',
      requestId: `r-card-${index}`,
      draft: { id, content, sourceUrl: `https://engineering.example.com/${index}`, properties: { title, ...(tags.length ? { tags } : {}) }, via: 'menu' },
    })
    for (let n = 0; n < highlights; n++) {
      const quote = content.slice(n * 6, n * 6 + 5)
      await send(page, { type: 'ADD_HIGHLIGHT', id, highlight: { id: `hl_card_${index}_${n}`, start: n * 6, end: n * 6 + 5, quote, color: 'yellow', createdAt: Date.now() } })
    }
  }
  for (const [index, title] of ['p99 latency', 'Error budget'].entries()) {
    await send(page, {
      type: 'SAVE_SCREENSHOT',
      requestId: `r-card-shot-${index}`,
      data: { id: `ent_card_shot_${index}`, dataUrl: PNG_1PX, width: 1, height: 1, sourceUrl: 'https://sre.example.org/latency', title, via: 'shortcut' },
    })
  }
}
