/**
 * What the listing screenshots show, once per listing language: the library's entries, the strings the
 * scenes type into the page, and the phrases they point at. The article pages (demo-article.html,
 * demo-article-zh.html) carry the same text, so a phrase here is found in the page by construction.
 */

export type StoreLocale = 'en' | 'zh'

export interface ClipBody {
  id: string
  title: string
  content: string
  context?: string
  note?: string
  url: string
  host: string
  tags: string[]
  properties?: Record<string, unknown>
  highlights?: Array<{ quote: string; color: string; note?: string }>
  ageDays: number
}

/** The two non-built-in properties the entries use, registered before the entries are seeded. */
export const PROPERTY_NAMES: Record<StoreLocale, { project: string; status: string }> = {
  en: { project: 'project', status: 'status' },
  zh: { project: '项目', status: '状态' },
}

export const SCENE_TEXT: Record<
  StoreLocale,
  {
    articlePage: string
    /** The two real screenshots saved before the library shot: the chart, then the code block. */
    shotTitles: [string, string]
    /** The sentence the highlighter goes over in the lead paragraph and in the paragraph under "Measure it". */
    leadPhrase: string
    measurePhrase: string
    /** The label written next to the chart's peak. */
    peakLabel: string
    /** The label written on the live page, in the empty corner of the chart. */
    stormLabel: string
    /** The title of the tab the recording popup says it is recording. */
    recordedTab: string
    names: {
      highlighter: string
      stepTool: string
      textTool: string
      red: string
      yellow: string
      teal: string
    }
  }
> = {
  en: {
    articlePage: 'demo-article.html',
    shotTitles: ['Retry pressure, fixed vs jittered', 'Full jitter in two lines'],
    leadPhrase: 'retries land on a service that has not recovered',
    measurePhrase: 'The peak dissolved; the dependency came back a minute earlier',
    peakLabel: '6k/s peak',
    stormLabel: 'retry storm',
    recordedTab: 'Why retries need jitter — engineering.example.com',
    names: { highlighter: 'Highlighter', stepTool: 'Step number', textTool: 'Text', red: 'Red', yellow: 'Yellow', teal: 'Teal' },
  },
  zh: {
    articlePage: 'demo-article-zh.html',
    shotTitles: ['重试压力：固定退避与加抖动', '两行代码实现完全抖动'],
    leadPhrase: '下游变慢时，每个超时的客户端都会回来再试一次',
    measurePhrase: '峰值消散了；下游提前一分钟恢复',
    peakLabel: '峰值 6k/s',
    stormLabel: '重试风暴',
    recordedTab: '重试为什么需要抖动 — engineering.example.com',
    names: { highlighter: '荧光笔', stepTool: '序号', textTool: '文字', red: '红', yellow: '黄', teal: '青' },
  },
}

export const CLIPS: Record<StoreLocale, ClipBody[]> = {
  en: [
    {
      id: 'ent_backpressure',
      title: 'Retries and backpressure',
      content: `Retries can amplify an outage when the dependency is already saturated. Instead of retrying immediately, wait base × 2^n and add a random factor between 0 and 1 so that clients do not retry in lockstep.

## Why retries amplify outages

When a dependency slows down, every caller that times out retries. The retries arrive on top of traffic that has not drained, so the queue grows, more requests time out, and more retries are issued. The recovery after the dependency heals is then dominated by the retry backlog rather than by fresh work.

## What to do instead

- Cap concurrent retries per client with a token bucket sized to the dependency's healthy capacity.
- Back off exponentially and jitter the delay, so a cohort of clients does not synchronize.
- Treat a retry as new work: it consumes budget like any other request.

The budget metaphor is the useful one: a retry is not free, it is a loan against capacity you hope exists.`,
      context: 'Instead of retrying immediately, wait base × 2^n and add a random factor between 0 and 1.',
      url: 'https://engineering.example.com/posts/retries-and-backpressure',
      host: 'engineering.example.com',
      tags: ['reliability', 'retry'],
      properties: { author: ['Jane Doe'], published: '2026-09-30', project: 'payments-retry', status: 'in-review' },
      highlights: [
        { quote: 'Retries can amplify an outage when the dependency is already saturated.', color: 'yellow', note: 'Compare with the traffic curve in the Sept 12 postmortem.' },
        { quote: 'Back off exponentially and jitter the delay, so a cohort of clients does not synchronize.', color: 'green' },
        { quote: 'a retry is not free, it is a loan against capacity you hope exists', color: 'purple' },
      ],
      ageDays: 3,
    },
    {
      id: 'ent_jitter',
      title: 'Exponential backoff with jitter, explained',
      content: `Full jitter — sleep uniform(0, min(cap, base × 2^n)) — beats equal jitter for cold start storms, because the top of the distribution moves instead of the floor. AWS architecture blog numbers: p99 retry pressure dropped by roughly 40% after switching.

The classic failure is testing with one client. One client cannot retry in lockstep with itself; a fleet can, and does.`,
      url: 'https://blog.example.org/backoff-with-jitter',
      host: 'blog.example.org',
      tags: ['reliability'],
      properties: { author: ['M. Chen'], project: 'payments-retry' },
      highlights: [{ quote: 'a fleet can, and does', color: 'blue' }],
      ageDays: 6,
    },
    {
      id: 'ent_idempotency',
      title: 'Idempotency keys: generate them on first landing',
      content: `Generate the key when the request first lands, before it touches the queue, and store it with the result. Keys minted at enqueue time collide when a fleet retries after a deploy.

\`\`\`sql
INSERT INTO idempotency (key, request_hash, status)
VALUES ($1, $2, 'running')
ON CONFLICT (key) DO NOTHING;
\`\`\`

If the insert lands zero rows, someone else owns the key: return their stored response instead of re-running the work.`,
      url: 'https://gist.example.dev/idempotency-keys-on-first-landing',
      host: 'gist.example.dev',
      tags: ['api-design', 'reliability'],
      ageDays: 9,
    },
    {
      id: 'ent_queues',
      title: 'Design review: queue depth limits are a product decision',
      content: `A queue with no depth limit is an outage with extra steps. The review concluded: depth limits are a product decision dressed as an infrastructure one — at which depth do we start shedding, and who sees the shed requests?

Proposed defaults: shed at p99 depth, surface the shed count on the same dashboard as the error budget, and page a human only when shedding lasts longer than one window.`,
      note: 'Bring the shedding dashboard to Thursday’s review.',
      url: 'https://handbook.example.dev/design-reviews/queue-depth',
      host: 'handbook.example.dev',
      tags: ['design-review'],
      properties: { status: 'to-read' },
      ageDays: 12,
    },
    {
      id: 'ent_audit',
      title: 'Audit trails that read like git log',
      content: `Compliance tooling fails adoption when the audit trail is a separate dungeon. The post argues for immutable, append-only events rendered with blame-style tooling: who changed the rate limit, when, and what the diff was.`,
      url: 'https://boring.example.com/audit-trails-like-git-log',
      host: 'boring.example.com',
      tags: ['compliance'],
      ageDays: 15,
    },
    {
      id: 'ent_p99',
      title: 'A week of p99 charts, annotated',
      content: `Every p99 spike this week lines up with one of three deploys. The interesting one is Tuesday: the spike precedes the deploy by four minutes, which puts the deploy in the clear and the config rollout in the frame.`,
      url: 'https://notes.example.io/p99-week',
      host: 'notes.example.io',
      tags: ['observability'],
      ageDays: 18,
    },
  ],
  zh: [
    {
      id: 'ent_backpressure',
      title: '重试与背压',
      content: `当下游已经饱和时，重试会放大故障。不要立刻重试：先等待 base × 2^n，再乘以一个 0 到 1 之间的随机数，这样各个客户端就不会同步重试。

## 为什么重试会放大故障

下游变慢时，每个超时的调用方都会重试。重试叠加在尚未消化的流量上，队列越来越长，更多请求超时，又产生更多重试。下游恢复之后，主导恢复过程的是重试积压，而不是新的工作。

## 应该怎么做

- 用令牌桶限制每个客户端的并发重试，桶的大小按下游健康时的容量来定。
- 指数退避并给延迟加抖动，避免同一批客户端步调一致。
- 把重试当作新的工作：它和其他请求一样消耗预算。

“预算”这个比喻最有用：重试不是免费的，它是对你希望仍然存在的容量的一笔借款。`,
      context: '不要立刻重试：先等待 base × 2^n，再乘以一个 0 到 1 之间的随机数。',
      url: 'https://engineering.example.com/posts/retries-and-backpressure',
      host: 'engineering.example.com',
      tags: ['可靠性', '重试'],
      properties: { author: ['陈雨'], published: '2026-09-30', 项目: '支付重试', 状态: '评审中' },
      highlights: [
        { quote: '当下游已经饱和时，重试会放大故障。', color: 'yellow', note: '对照 9 月 12 日复盘里的流量曲线。' },
        { quote: '指数退避并给延迟加抖动，避免同一批客户端步调一致。', color: 'green' },
        { quote: '重试不是免费的，它是对你希望仍然存在的容量的一笔借款', color: 'purple' },
      ],
      ageDays: 3,
    },
    {
      id: 'ent_jitter',
      title: '带抖动的指数退避，讲清楚',
      content: `完全抖动——睡眠 uniform(0, min(cap, base × 2^n))——在冷启动风暴里优于等量抖动，因为被挪动的是分布的上沿，而不是下沿。AWS 架构博客给出的数字：改用之后，p99 的重试压力下降了大约 40%。

经典的失败是只用一个客户端测试。一个客户端不会和自己同步重试；一整批客户端会，而且确实会。`,
      url: 'https://blog.example.org/backoff-with-jitter',
      host: 'blog.example.org',
      tags: ['可靠性'],
      properties: { author: ['陈明'], 项目: '支付重试' },
      highlights: [{ quote: '一整批客户端会，而且确实会', color: 'blue' }],
      ageDays: 6,
    },
    {
      id: 'ent_idempotency',
      title: '幂等键：在请求第一次落地时生成',
      content: `请求第一次落地时就生成幂等键，早于它进入队列，并和结果一起存下来。在入队时才生成的键，会在部署之后整批重试时发生冲突。

\`\`\`sql
INSERT INTO idempotency (key, request_hash, status)
VALUES ($1, $2, 'running')
ON CONFLICT (key) DO NOTHING;
\`\`\`

如果插入了零行，说明别人已经占有这个键：直接返回他们存下的响应，不要重新执行。`,
      url: 'https://gist.example.dev/idempotency-keys-on-first-landing',
      host: 'gist.example.dev',
      tags: ['接口设计', '可靠性'],
      ageDays: 9,
    },
    {
      id: 'ent_queues',
      title: '设计评审：队列深度上限是产品决策',
      content: `没有深度上限的队列，是多绕了几步的故障。评审的结论是：深度上限是披着基础设施外衣的产品决策——到哪个深度开始丢弃请求，被丢弃的请求又由谁看到？

建议的默认值：在 p99 深度处开始丢弃，把丢弃数和错误预算放在同一块仪表盘上，只有丢弃持续超过一个窗口才呼叫值班人员。`,
      note: '周四评审前，把丢弃仪表盘带上。',
      url: 'https://handbook.example.dev/design-reviews/queue-depth',
      host: 'handbook.example.dev',
      tags: ['设计评审'],
      properties: { 状态: '待读' },
      ageDays: 12,
    },
    {
      id: 'ent_audit',
      title: '像 git log 一样好读的审计记录',
      content: `当审计记录是一座单独的地牢时，合规工具推不开。这篇文章主张：用不可变、只追加的事件，配上类似 blame 的工具来呈现——谁改了限流、什么时候改的、差异是什么。`,
      url: 'https://boring.example.com/audit-trails-like-git-log',
      host: 'boring.example.com',
      tags: ['合规'],
      ageDays: 15,
    },
    {
      id: 'ent_p99',
      title: '一周的 p99 图表，加批注',
      content: `这周每一次 p99 尖峰，都对得上三次部署中的一次。有意思的是周二：尖峰比部署早了四分钟，部署因此洗清了嫌疑，配置发布成了嫌疑对象。`,
      url: 'https://notes.example.io/p99-week',
      host: 'notes.example.io',
      tags: ['可观测性'],
      ageDays: 18,
    },
  ],
}
