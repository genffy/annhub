/**
 * Chrome Web Store listing assets, captured from the real extension rather than
 * drawn: 1280×800 screenshots plus the 440×280 small and 1400×560 marquee tiles.
 * Skipped in normal runs.
 *
 *   npm run store:assets      # writes store-assets/zh/*.png and store-assets/en/*.png (not committed)
 *
 * The files are reproducible from the source, so nothing here can go stale the
 * way hand-made mockups did. One set per interface language (docs/v2 D-15): the
 * browser UI language decides what the extension itself shows, and the demo
 * content is written in the same language, so the English listing never shows
 * a Chinese label. See docs/releasing.md.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext, Page } from '@playwright/test'
import { test } from './fixtures'
import { getAnnShadowRoot, selectText, waitForCaptureModal, waitForHoverMenu } from './helpers'

test.skip(!process.env.STORE_ASSETS, 'Set STORE_ASSETS=1 (or run `npm run store:assets`) to capture the store listing assets.')
test.describe.configure({ mode: 'serial' })

interface Sample {
  kind: string
  content: string
  excerpt: string
  use: string
  tags: string[]
  detail: unknown
}

const SOURCE = { url: 'https://docs.example.com/streams/backpressure', title: 'Streams · Backpressure' }

type Language = 'zh' | 'en'

interface Copy {
  /** Browser UI language the extension picks its wording from. */
  locale: string
  samples: Sample[]
  article: { title: string; before: string; target: string; after: string; second: string }
  tagline: { title: string; subtitle: string }
}

const COPY: Record<Language, Copy> = {
  zh: {
    locale: 'zh-CN',
    samples: [
      {
        kind: 'concept',
        content: '背压（Backpressure）',
        excerpt: '背压（Backpressure）是下游消费速度跟不上时，向上游传递“放慢”的信号，避免无界缓冲耗尽内存。',
        use: '解释线上内存持续上涨的原因。',
        tags: ['并发', '流式处理'],
        detail: { definition: '下游把处理能力反馈给上游，让生产速度与消费速度匹配', boundaries: ['不等于限流', '不等于丢弃数据'] },
      },
      {
        kind: 'claim',
        content: '无界队列只是把故障推迟，而不是消除它。',
        excerpt: '无界队列只是把故障推迟，而不是消除它：延迟会先上升，随后才是内存。',
        use: '作为评审里反对“先加队列”的论据。',
        tags: ['架构评审'],
        detail: { stance: 'support', evidence: ['压测中延迟先于内存上升'] },
      },
      {
        kind: 'procedure',
        content: '排查内存上涨的三步',
        excerpt: '排查内存上涨的三步：先确认堆增长，再对比两次堆快照，最后检查队列深度与消费速率。',
        use: '写进值班手册。',
        tags: ['值班', '排障'],
        detail: { steps: ['确认堆在增长', '对比两次堆快照', '检查队列深度与消费速率'], prerequisites: ['已开启 GC 日志'] },
      },
      {
        kind: 'decision',
        content: '消费端使用有界队列并显式拒绝',
        excerpt: '消费端使用有界队列并显式拒绝：队列满了就让生产者感知，而不是静默缓冲。',
        use: '下个迭代的网关改造。',
        tags: ['网关'],
        detail: { rationale: '过载时尽早失败，比慢速崩溃更容易恢复', alternatives: ['无界队列', '丢弃最旧消息'] },
      },
      {
        kind: 'question',
        content: '背压如何跨服务边界传递？',
        excerpt: '背压如何跨服务边界传递？跨进程时，信号要靠协议显式表达，例如 credit 或 window。',
        use: '下周读 Reactive Streams 规范。',
        tags: ['待研究'],
        detail: { status: 'open', hypothesis: '需要协议层的 credit 机制' },
      },
    ],
    article: {
      title: '流式系统里的背压',
      before: '当消费者处理得比生产者慢时，缓冲区会一直增长。工程上常见的答案是：',
      target: '无界队列只是把故障推迟，而不是消除它',
      after: '。延迟会先上升，随后才是内存，最后是被迫重启。',
      second: '背压把消费者的处理能力反馈给生产者，让两端以同样的节奏工作。它不是限流，也不意味着丢弃数据。',
    },
    tagline: {
      title: '把网页中的知识，变成工作中用得上的能力',
      subtitle: '连同语境采集 · 主动加工 · 在 Mac 上按类型复习 · 本地优先，AI 可选',
    },
  },
  en: {
    locale: 'en-US',
    samples: [
      {
        kind: 'concept',
        content: 'Backpressure',
        excerpt: 'Backpressure is the signal a slow consumer sends upstream to slow down, so an unbounded buffer does not exhaust memory.',
        use: 'Explain why memory keeps climbing in production.',
        tags: ['concurrency', 'streaming'],
        detail: {
          definition: 'The consumer feeds its capacity back to the producer so both sides run at the same pace',
          boundaries: ['Not the same as rate limiting', 'Not the same as dropping data'],
        },
      },
      {
        kind: 'claim',
        content: 'An unbounded queue only postpones the failure; it does not remove it.',
        excerpt: 'An unbounded queue only postpones the failure; it does not remove it: latency climbs first, memory follows.',
        use: 'Argument against “just add a queue” in the design review.',
        tags: ['design review'],
        detail: { stance: 'support', evidence: ['In load tests latency rose before memory'] },
      },
      {
        kind: 'procedure',
        content: 'Three steps to trace a memory climb',
        excerpt: 'Three steps to trace a memory climb: confirm the heap is growing, compare two heap snapshots, then check queue depth and consumption rate.',
        use: 'Write it into the on-call handbook.',
        tags: ['on-call', 'debugging'],
        detail: { steps: ['Confirm the heap is growing', 'Compare two heap snapshots', 'Check queue depth and consumption rate'], prerequisites: ['GC logging is on'] },
      },
      {
        kind: 'decision',
        content: 'Use a bounded queue on the consumer and reject explicitly',
        excerpt: 'Use a bounded queue on the consumer and reject explicitly: when the queue is full the producer finds out, instead of silent buffering.',
        use: 'The gateway rework in the next iteration.',
        tags: ['gateway'],
        detail: { rationale: 'Failing early under overload is easier to recover from than a slow crash', alternatives: ['Unbounded queue', 'Drop the oldest message'] },
      },
      {
        kind: 'question',
        content: 'How does backpressure cross a service boundary?',
        excerpt: 'How does backpressure cross a service boundary? Across processes the signal has to be explicit in the protocol, for example credits or a window.',
        use: 'Read the Reactive Streams spec next week.',
        tags: ['to research'],
        detail: { status: 'open', hypothesis: 'It needs a credit mechanism at the protocol level' },
      },
    ],
    article: {
      title: 'Backpressure in streaming systems',
      before: 'When a consumer is slower than its producer, the buffer keeps growing. The common engineering answer is: ',
      target: 'an unbounded queue only postpones the failure; it does not remove it',
      after: '. Latency climbs first, then memory, and finally a forced restart.',
      second: 'Backpressure feeds the consumer’s capacity back to the producer so both ends work at the same pace. It is not rate limiting, and it does not mean dropping data.',
    },
    tagline: {
      title: 'Turn what you read online into skills you can use at work',
      subtitle: 'Capture with context · Process actively · Review by kind on your Mac · Local-first, AI optional',
    },
  },
}

const outDir = (lang: Language) => {
  const dir = join(process.cwd(), 'store-assets', lang)
  mkdirSync(dir, { recursive: true })
  return dir
}

async function seedFragments(page: Page, extensionId: string, samples: Sample[]) {
  await page.goto(`chrome-extension://${extensionId}/library.html`)
  const failures = await page.evaluate(
    async ({ items, source }) => {
      const errors: string[] = []
      // Screenshots show the working library, not the first-run cards that push the list below the fold.
      await chrome.storage.local.set({ annhubOnboardingDismissed: true, annhubConnectHintDismissed: true })
      for (const item of items) {
        const response = await chrome.runtime.sendMessage({
          type: 'SAVE_FRAGMENT',
          force: true,
          input: {
            kind: item.kind,
            content: item.content,
            excerpt: item.excerpt,
            sourceUrl: source.url,
            sourceTitle: source.title,
            verified: { confirmedAt: Date.now(), source: 'source-material' },
            use: item.use,
            tags: item.tags,
            detail: item.detail,
          },
        })
        if (!response?.success) errors.push(`${item.kind}: ${response?.error}`)
      }
      return errors
    },
    { items: samples, source: SOURCE },
  )
  if (failures.length) throw new Error(`Could not seed demo fragments: ${failures.join('; ')}`)
}

async function routeArticle(context: BrowserContext, lang: Language) {
  const copy = COPY[lang].article
  await context.route('https://docs.example.com/**', route =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : 'en'}"><head><meta charset="utf-8"><title>${SOURCE.title}</title>
<style>
  body { margin: 0; background: #f6f5fb; font-family: Georgia, 'Songti SC', serif; color: #25222f; }
  header { padding: 18px 48px; border-bottom: 1px solid #e3e0ee; background: #fff; font: 600 15px -apple-system, 'Segoe UI', sans-serif; color: #6f5ce7; }
  main { max-width: 700px; margin: 56px auto; padding: 0 24px; line-height: 1.85; font-size: 20px; }
  h1 { font: 700 38px/1.25 -apple-system, 'Segoe UI', sans-serif; margin: 0 0 28px; }
</style></head><body><header>docs.example.com</header><main>
<h1>${copy.title}</h1>
<p>${copy.before}<span id="target">${copy.target}</span>${copy.after}</p>
<p>${copy.second}</p></main></body></html>`,
    }),
  )
}

function tileHtml(width: number, height: number, lang: Language): string {
  const { title, subtitle } = COPY[lang].tagline
  const compact = width < 600
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: ${width}px; height: ${height}px; display: flex; flex-direction: column; justify-content: center; gap: ${compact ? 10 : 18}px;
    padding: 0 ${compact ? 36 : 120}px; color: #fff; font-family: -apple-system, 'Segoe UI', 'PingFang SC', sans-serif;
    background: linear-gradient(135deg, #7c4dff 0%, #4b2e83 100%); }
  .brand { display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: ${compact ? 22 : 34}px; }
  .brand svg { width: ${compact ? 26 : 42}px; height: auto; }
  h1 { font-size: ${compact ? 21 : 46}px; line-height: 1.25; font-weight: 700; max-width: ${compact ? 360 : 1000}px; }
  p { font-size: ${compact ? 12 : 22}px; line-height: 1.5; opacity: .86; max-width: ${compact ? 360 : 1000}px; }
</style></head><body>
  <div class="brand"><svg viewBox="0 0 170 200" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M30 110L70 0H40L0 110V200H30L60 110H30ZM140 110L100 0H130L170 110V200H140L110 110H140Z" fill="#fff"/></svg>AnnHub</div>
  <h1>${title}</h1>
  <p>${subtitle}</p>
</body></html>`
}

for (const lang of ['zh', 'en'] as const) {
  test.describe(`store assets (${lang})`, () => {
    test.use({ uiLocale: COPY[lang].locale, viewport: { width: 1280, height: 800 } })

    test('library, capture window and settings screenshots', async ({ context, page, extensionId }) => {
      const dir = outDir(lang)
      await seedFragments(page, extensionId, COPY[lang].samples)

      await page.goto(`chrome-extension://${extensionId}/library.html`)
      await page.getByTestId('fragment-card').first().waitFor()
      await page.waitForTimeout(400)
      await page.screenshot({ path: join(dir, '01-library.png') })

      await routeArticle(context, lang)
      await page.goto(SOURCE.url)
      await page.waitForSelector('ann-selection', { state: 'attached', timeout: 5000 })
      await page.waitForTimeout(500)
      await selectText(page, '#target')
      const hoverMenu = await waitForHoverMenu(page)
      await page.waitForTimeout(300)
      await page.screenshot({ path: join(dir, '02-select-text.png') })
      await hoverMenu.getByTestId('hover-action-save-fragment').click({ force: true })
      const modal = await waitForCaptureModal(page)
      await modal.waitFor({ state: 'visible' })
      await page.waitForTimeout(500)
      await page.screenshot({ path: join(dir, '03-capture-window.png') })
      await getAnnShadowRoot(page)
        .locator('[data-ann-ui="capture-modal"]')
        .press('Escape')
        .catch(() => undefined)

      await page.goto(`chrome-extension://${extensionId}/options.html#/settings`)
      await page.waitForTimeout(600)
      await page.screenshot({ path: join(dir, '04-settings.png') })
    })

    test('promo tiles', async ({ page }) => {
      const dir = outDir(lang)
      for (const [name, width, height] of [
        ['small-promo-tile-440x280', 440, 280],
        ['marquee-promo-tile-1400x560', 1400, 560],
      ] as const) {
        await page.setViewportSize({ width, height })
        await page.setContent(tileHtml(width, height, lang))
        await page.screenshot({ path: join(dir, `${name}.png`) })
      }
    })
  })
}
