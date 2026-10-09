import type { Entry, Highlight, HighlightColor, PropertyDef, ThumbKind } from './types'

// Sample content for the product windows. The story is docs/v2/examples.md §2: someone writing a design document for a
// payment retry strategy. Sources are neutral example domains, never a real site (docs/v2/AGENTS.md).

export type SampleLocale = 'zh-CN' | 'en'

export interface RetriesPage {
  siteNav: string[]
  title: string
  byline: string
  intro: string
  storm: { heading: string; body: string; selection: string }
  backoff: { heading: string; before: string; bold: string; after: string; steps: string[]; foot: string }
  budget: { heading: string; body: string }
}

export interface Sample {
  entries: Entry[]
  registry: PropertyDef[]
  counts: { all: number; clip: number; highlight: number; screenshot: number; props: number }
  retries: RetriesPage
  /** What the quick-edit bubble shows after the first clip. */
  quickEdit: { title: string; tags: string[]; note: string }
  /** The saved clip the reading view opens in the hero. */
  hero: string
  /** The entry the walkthrough reads and highlights. */
  reading: string
  search: { query: string; propertyChip: string; hits: string[] }
  exportFile: { name: string; frontmatter: [string, string][]; body: { heading: string; lines: string[] }; files: string[] }
}

function hl(entryId: string, index: number, content: string, quote: string, color: HighlightColor, note?: string): Highlight {
  const start = content.indexOf(quote)
  if (start < 0) throw new Error(`Highlight quote is not in the clip: ${quote}`)
  return { id: `${entryId}-h${index}`, start, end: start + quote.length, quote, color, note }
}

function clip(e: Omit<Entry, 'type' | 'highlights' | 'path'> & { path: string; marks?: [string, HighlightColor, string?][] }): Entry {
  const { marks = [], ...rest } = e
  return { ...rest, type: 'clip', highlights: marks.map(([quote, color, note], i) => hl(e.id, i, e.content, quote, color, note)) }
}

function shot(e: Omit<Entry, 'type' | 'highlights' | 'content'> & { image: ThumbKind }): Entry {
  return { ...e, type: 'screenshot', content: '', highlights: [] }
}

const REGISTRY: PropertyDef[] = [
  { name: 'title', type: 'text', builtin: true, fixed: true, defaultValue: '', used: 95, presets: ['clip', 'screenshot'] },
  { name: 'tags', type: 'list', builtin: true, fixed: true, used: 70, presets: ['clip', 'screenshot'] },
  { name: 'author', type: 'list', builtin: true, used: 41, presets: ['clip'] },
  { name: 'published', type: 'date', builtin: true, used: 38, presets: ['clip'] },
  { name: 'description', type: 'text', builtin: true, used: 44, presets: ['clip'] },
  { name: 'project', type: 'text', builtin: false, used: 6, presets: ['clip'] },
  { name: 'reviewed', type: 'checkbox', builtin: false, used: 4, presets: [] },
  { name: 'priority', type: 'number', builtin: false, used: 3, presets: [] },
  { name: 'due', type: 'date', builtin: false, used: 0, presets: [] },
]

const COUNTS = { all: 95, clip: 71, highlight: 33, screenshot: 24, props: 9 }

function zh(): Sample {
  const project = '支付重试'
  const backoff = [
    '## 指数退避加抖动',
    '',
    '重试不要立刻发出：每次失败后把等待时间翻倍，直到上限，再乘一个 0–1 的**随机因子**，让客户端不再同时重试。',
    '',
    '1. 从一个较小的基础间隔开始。',
    '2. 每次失败后翻倍，不超过上限。',
    '3. 乘一个 0–1 的随机因子（抖动）。',
    '',
    '完整推导见 [AWS 架构博客](https://example.com/backoff)。',
  ].join('\n')
  const storm = '依赖已经饱和时，每一次重试都在给一个正在失败的系统加负载；没有预算，所有客户端会同时重试。'
  const circuit = [
    '## 熔断器',
    '',
    '依赖持续失败时快速失败，给下游留出恢复时间。',
    '',
    '- **关闭**：请求正常通过，同时统计失败率。',
    '- **打开**：直接拒绝请求，不再调用依赖。',
    '- **半开**：放行少量探测请求，成功就恢复。',
  ].join('\n')
  const backpressure = [
    '## Backpressure',
    '',
    'When a producer emits events faster than a consumer can process them, something has to give.',
    '',
    '**Backpressure** is how a system pushes that pain back where it belongs. Instead of letting buffers absorb the mismatch indefinitely, the consumer signals demand upstream.',
    '',
    '### Three common strategies',
    '',
    '1. Demand signaling: the consumer grants credits.',
    '2. Bounded buffers: queues with a hard limit.',
    '3. Load shedding: drop the least valuable work first, on purpose.',
  ].join('\n')

  const entries: Entry[] = [
    clip({
      id: 'backpressure',
      title: 'Backpressure in Streams',
      content: backpressure,
      host: 'engineering.example.com',
      path: '/posts/backpressure-in-streams',
      when: '刚刚',
      tags: ['streams', 'reliability'],
      props: { author: ['Platform Engineering'], published: '2026-09-28', description: 'How a system pushes overload back to the producer.', project, reviewed: false },
      marks: [
        ['is how a system pushes that pain back where it belongs.', 'blue'],
        ['Load shedding: drop the least valuable work first, on purpose.', 'pink', '写进方案：先丢低价值请求'],
      ],
    }),
    clip({
      id: 'backoff',
      title: '重试与背压',
      content: backoff,
      host: 'engineering.example.com',
      path: '/posts/retries',
      when: '周一',
      tags: ['retry'],
      note: '写进方案第 3 节',
      props: { project },
      marks: [
        ['每次失败后翻倍，不超过上限', 'green'],
        ['乘一个 0–1 的随机因子（抖动）', 'yellow', '解释为什么要抖动'],
      ],
    }),
    clip({
      id: 'storm',
      title: '重试与背压',
      content: storm,
      host: 'engineering.example.com',
      path: '/posts/retries',
      when: '周一',
      tags: ['retry', 'reliability'],
      note: '对照复盘里的流量曲线。',
      props: { author: ['Jane Doe'], published: '2026-09-12', project, reviewed: false },
      marks: [['没有预算，所有客户端会同时重试', 'yellow', '重试预算']],
    }),
    shot({
      id: 'p99',
      title: '重试开始后 p99 延迟曲线',
      host: 'sre.example.org',
      path: '/incidents/2026-09',
      when: '周一',
      tags: ['incident', 'retry'],
      props: { project },
      image: 'chart',
    }),
    clip({
      id: 'idempotency',
      title: 'Idempotency keys',
      content: '幂等键应在请求首次落库时生成，并与结果一起保存至重试窗口结束。',
      host: 'engineering.example.com',
      path: '/posts/idempotency',
      when: '周四',
      tags: ['retry', 'api'],
      props: { project },
    }),
    clip({
      id: 'circuit',
      title: 'Circuit breakers',
      content: circuit,
      host: 'engineering.example.com',
      path: '/posts/circuit-breakers',
      when: '周五',
      tags: ['reliability'],
      props: {},
      marks: [['依赖持续失败时快速失败，给下游留出恢复时间。', 'green']],
    }),
    shot({
      id: 'state-machine',
      title: '熔断器状态机示意图',
      host: 'engineering.example.com',
      path: '/posts/circuit-breakers',
      when: '周五',
      tags: ['reliability'],
      props: {},
      image: 'diagram',
    }),
    clip({
      id: 'triage',
      title: 'Production incident triage',
      content: '确认影响 → 限制扩散 → 保存证据 → 建立时间线 → 验证恢复',
      host: 'sre.example.org',
      path: '/runbooks/triage',
      when: '昨天',
      tags: ['oncall'],
      props: {},
      marks: [['保存证据', 'pink', '先拍快照再改配置']],
    }),
    shot({
      id: 'budget-dashboard',
      title: '重试预算仪表盘',
      host: 'engineering.example.com',
      path: '/dashboards/retry-budget',
      when: '3 周前',
      tags: ['retry'],
      props: {},
      image: 'bars',
    }),
  ]

  return {
    entries,
    registry: REGISTRY,
    counts: COUNTS,
    retries: {
      siteNav: ['文章', '主题', '关于'],
      title: '重试与背压',
      byline: '平台工程 · 更新于 9 月 12 日 · 7 分钟阅读',
      intro: '重试是一次赌注：赌下一次会成功。依赖已经在失败时，这是拿其他所有人的稳定性在下注。',
      storm: { heading: '重试风暴', body: storm, selection: '每一次重试都在给一个正在失败的系统加负载' },
      backoff: {
        heading: '指数退避加抖动',
        before: '重试不要立刻发出：每次失败后把等待时间翻倍，直到上限，再乘一个 0–1 的',
        bold: '随机因子',
        after: '，让客户端不再同时重试。',
        steps: ['从一个较小的基础间隔开始。', '每次失败后翻倍，不超过上限。', '乘一个 0–1 的随机因子（抖动）。'],
        foot: '完整推导见 AWS 架构博客。',
      },
      budget: { heading: '重试预算', body: '给每个下游设一个重试配额，用完就快速失败。' },
    },
    quickEdit: { title: '重试与背压', tags: ['retry'], note: '对照复盘里的流量曲线。' },
    hero: 'backpressure',
    reading: 'backoff',
    search: { query: '幂等键', propertyChip: 'project = 支付重试', hits: ['idempotency'] },
    exportFile: {
      name: '重试与背压.md',
      frontmatter: [
        ['title', '重试与背压'],
        ['source', 'https://engineering.example.com/posts/retries'],
        ['created', '2026-10-05'],
        ['tags', '[retry]'],
        ['project', '支付重试'],
        ['annhub_type', 'clip'],
      ],
      body: {
        heading: '## 指数退避加抖动',
        lines: [
          '重试不要立刻发出：每次失败后把等待时间翻倍，直到上限，再乘一个 0–1 的**随机因子**……',
          '',
          '1. 从一个较小的基础间隔开始。',
          '2. ==每次失败后翻倍，不超过上限==',
          '3. ==乘一个 0–1 的随机因子（抖动）==',
          '',
        ],
      },
      files: ['重试与背压.md', '幂等键.md', 'p99 延迟曲线.md', 'assets/p99.png'],
    },
  }
}

function en(): Sample {
  const project = 'Payments retry'
  const backoff = [
    '## Exponential backoff with jitter',
    '',
    'Don’t retry immediately: double the wait after every failure, up to a cap, then multiply by a random **jitter factor** between 0 and 1 so clients stop retrying in lockstep.',
    '',
    '1. Start from a small base interval.',
    '2. Double after each failure, up to the cap.',
    '3. Multiply by a random factor from 0 to 1 (jitter).',
    '',
    'The full derivation is in the [AWS Architecture Blog](https://example.com/backoff).',
  ].join('\n')
  const storm = 'When the dependency is saturated, every retry adds load to a system that is already failing. Without a budget, every client retries at once.'
  const circuit = [
    '## Circuit breakers',
    '',
    'When a dependency keeps failing, fail fast and give it room to recover.',
    '',
    '- **Closed**: requests pass, failures are counted.',
    '- **Open**: requests are rejected without calling the dependency.',
    '- **Half-open**: a few probe requests go through; success closes the circuit.',
  ].join('\n')
  const backpressure = [
    '## Backpressure',
    '',
    'When a producer emits events faster than a consumer can process them, something has to give.',
    '',
    '**Backpressure** is how a system pushes that pain back where it belongs. Instead of letting buffers absorb the mismatch indefinitely, the consumer signals demand upstream.',
    '',
    '### Three common strategies',
    '',
    '1. Demand signaling: the consumer grants credits.',
    '2. Bounded buffers: queues with a hard limit.',
    '3. Load shedding: drop the least valuable work first, on purpose.',
  ].join('\n')

  const entries: Entry[] = [
    clip({
      id: 'backpressure',
      title: 'Backpressure in Streams',
      content: backpressure,
      host: 'engineering.example.com',
      path: '/posts/backpressure-in-streams',
      when: 'just now',
      tags: ['streams', 'reliability'],
      props: { author: ['Platform Engineering'], published: '2026-09-28', description: 'How a system pushes overload back to the producer.', project, reviewed: false },
      marks: [
        ['is how a system pushes that pain back where it belongs.', 'blue'],
        ['Load shedding: drop the least valuable work first, on purpose.', 'pink', 'For the design doc: shed low-value work first'],
      ],
    }),
    clip({
      id: 'backoff',
      title: 'Retries and backpressure',
      content: backoff,
      host: 'engineering.example.com',
      path: '/posts/retries',
      when: 'Mon',
      tags: ['retry'],
      note: 'Goes into section 3 of the design',
      props: { project },
      marks: [
        ['Double after each failure, up to the cap.', 'green'],
        ['Multiply by a random factor from 0 to 1 (jitter).', 'yellow', 'Explain why jitter matters'],
      ],
    }),
    clip({
      id: 'storm',
      title: 'Retries and backpressure',
      content: storm,
      host: 'engineering.example.com',
      path: '/posts/retries',
      when: 'Mon',
      tags: ['retry', 'reliability'],
      note: 'Compare with the traffic curve in the postmortem.',
      props: { author: ['Jane Doe'], published: '2026-09-12', project, reviewed: false },
      marks: [['Without a budget, every client retries at once.', 'yellow', 'Retry budget']],
    }),
    shot({
      id: 'p99',
      title: 'p99 latency after retries began',
      host: 'sre.example.org',
      path: '/incidents/2026-09',
      when: 'Mon',
      tags: ['incident', 'retry'],
      props: { project },
      image: 'chart',
    }),
    clip({
      id: 'idempotency',
      title: 'Idempotency keys',
      content: 'Generate the idempotency key when the request is first persisted, and keep it with the result until the retry window ends.',
      host: 'engineering.example.com',
      path: '/posts/idempotency',
      when: 'Thu',
      tags: ['retry', 'api'],
      props: { project },
    }),
    clip({
      id: 'circuit',
      title: 'Circuit breakers',
      content: circuit,
      host: 'engineering.example.com',
      path: '/posts/circuit-breakers',
      when: 'Fri',
      tags: ['reliability'],
      props: {},
      marks: [['When a dependency keeps failing, fail fast and give it room to recover.', 'green']],
    }),
    shot({
      id: 'state-machine',
      title: 'Circuit breaker state machine',
      host: 'engineering.example.com',
      path: '/posts/circuit-breakers',
      when: 'Fri',
      tags: ['reliability'],
      props: {},
      image: 'diagram',
    }),
    clip({
      id: 'triage',
      title: 'Production incident triage',
      content: 'Confirm impact → contain the spread → preserve evidence → build a timeline → verify recovery',
      host: 'sre.example.org',
      path: '/runbooks/triage',
      when: 'Yesterday',
      tags: ['oncall'],
      props: {},
      marks: [['preserve evidence', 'pink', 'Snapshot first, then change config']],
    }),
    shot({
      id: 'budget-dashboard',
      title: 'Retry budget dashboard',
      host: 'engineering.example.com',
      path: '/dashboards/retry-budget',
      when: '3 w ago',
      tags: ['retry'],
      props: {},
      image: 'bars',
    }),
  ]

  return {
    entries,
    registry: REGISTRY,
    counts: COUNTS,
    retries: {
      siteNav: ['Articles', 'Topics', 'About'],
      title: 'Retries and backpressure',
      byline: 'Platform Engineering · Updated Sep 12 · 7 min read',
      intro: 'A retry is a bet that the next attempt will succeed. When the dependency is already failing, it is a bet against everyone else.',
      storm: { heading: 'Retry storms', body: storm, selection: 'every retry adds load to a system that is already failing' },
      backoff: {
        heading: 'Exponential backoff with jitter',
        before: 'Don’t retry immediately: double the wait after every failure, up to a cap, then multiply by a random ',
        bold: 'jitter factor',
        after: ' between 0 and 1 so clients stop retrying in lockstep.',
        steps: ['Start from a small base interval.', 'Double after each failure, up to the cap.', 'Multiply by a random factor from 0 to 1 (jitter).'],
        foot: 'The full derivation is in the AWS Architecture Blog.',
      },
      budget: { heading: 'Retry budgets', body: 'Give every downstream a retry quota, and fail fast once it is spent.' },
    },
    quickEdit: { title: 'Retries and backpressure', tags: ['retry'], note: 'Compare with the traffic curve in the postmortem.' },
    hero: 'backpressure',
    reading: 'backoff',
    search: { query: 'idempotency', propertyChip: 'project = Payments retry', hits: ['idempotency'] },
    exportFile: {
      name: 'Retries and backpressure.md',
      frontmatter: [
        ['title', 'Retries and backpressure'],
        ['source', 'https://engineering.example.com/posts/retries'],
        ['created', '2026-10-05'],
        ['tags', '[retry]'],
        ['project', 'Payments retry'],
        ['annhub_type', 'clip'],
      ],
      body: {
        heading: '## Exponential backoff with jitter',
        lines: [
          'Don’t retry immediately: double the wait after every failure, up to a cap, then multiply by a random **jitter factor**…',
          '',
          '1. Start from a small base interval.',
          '2. ==Double after each failure, up to the cap.==',
          '3. ==Multiply by a random factor from 0 to 1 (jitter).==',
          '',
        ],
      },
      files: ['Retries and backpressure.md', 'Idempotency keys.md', 'p99 latency.md', 'assets/p99.png'],
    },
  }
}

const cache = new Map<SampleLocale, Sample>()

export function getSample(locale: SampleLocale): Sample {
  let sample = cache.get(locale)
  if (!sample) {
    sample = locale === 'zh-CN' ? zh() : en()
    cache.set(locale, sample)
  }
  return sample
}

export function entryById(sample: Sample, id: string): Entry {
  const entry = sample.entries.find(e => e.id === id)
  if (!entry) throw new Error(`Unknown sample entry: ${id}`)
  return entry
}
