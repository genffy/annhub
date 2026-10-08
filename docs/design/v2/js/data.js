// 设计稿共用的文案与样例数据。规则取自 docs/v2（entry.md、extension.md、examples.md），
// 这里只做复制，规则以 docs/v2 为准；示例来源均为中性域名。

// 两种条目类型（entry.md §2）。菜单顺序固定为：剪藏、截图。
const TYPES = {
  clip: { zh: '剪藏', en: 'Clip', plural: 'Clips', icon: 'bookmark', tip: '保存选中的内容，之后在资料库里读和高亮', tipEn: 'Save what you selected; read and highlight it in the library later' },
  screenshot: { zh: '截图', en: 'Screenshot', plural: 'Screenshots', icon: 'scan', tip: '框选区域或单击元素 · 保存为图片', tipEn: 'Drag a region or click an element · saved as an image' },
}
const TYPE_ORDER = ['clip', 'screenshot']

// 高亮不是条目类型：它是剪藏里的标注。这里只给导航、入口和高亮视图提供名称与图标。
const HLV = { zh: '高亮', en: 'Highlight', plural: 'Highlights', icon: 'highlighter', tip: '在资料库里读剪藏时划出重点', tipEn: 'Mark what matters while you read a clip in the library' }

// 属性的六种类型（entry.md §5.2）
const PTYPES = {
  text: { zh: '文本', en: 'Text', icon: 'text', stored: '单行字符串', limit: '至多 1,000 字符', ops: '包含、等于', sample: '支付重试' },
  list: { zh: '列表', en: 'List', icon: 'list', stored: '字符串数组，去重', limit: '至多 50 项，每项 1–100 字符', ops: '含有某一项', sample: 'retry、reliability' },
  number: { zh: '数字', en: 'Number', icon: 'hash', stored: '有限数字', limit: '整数或小数，不接受表达式', ops: '等于、大于、小于、区间', sample: '3' },
  checkbox: { zh: '复选框', en: 'Checkbox', icon: 'square-check', stored: '布尔', limit: 'true / false', ops: '是、否', sample: '已读' },
  date: { zh: '日期', en: 'Date', icon: 'calendar', stored: 'YYYY-MM-DD', limit: '必须是真实存在的日期', ops: '区间', sample: '2026-10-07' },
  datetime: { zh: '日期时间', en: 'Date & time', icon: 'calendar-clock', stored: 'YYYY-MM-DDTHH:mm:ss', limit: '本地时区，不带偏移', ops: '区间', sample: '2026-10-07 10:30' },
}
const PTYPE_ORDER = ['text', 'list', 'number', 'checkbox', 'date', 'datetime']

// 高亮调色板（entry.md §4）：颜色是用户的选择，不承担含义；每个色块都有文字名称
const HL_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple']
const HL_NAMES = { yellow: '黄色', green: '绿色', blue: '蓝色', pink: '粉色', purple: '紫色' }

// 属性注册表（entry.md §5.3、§5.4）。used = 使用数；presets = 采集时自动附加该属性的类型。
const REGISTRY0 = [
  { name: 'title', type: 'text', builtin: true, fixed: true, def: '页面标题', used: 95, presets: ['clip', 'screenshot'] },
  { name: 'tags', type: 'list', builtin: true, fixed: true, def: '', used: 70, presets: ['clip', 'screenshot'] },
  { name: 'author', type: 'list', builtin: true, def: '页面 meta', used: 41, presets: ['clip'] },
  { name: 'published', type: 'date', builtin: true, def: '页面 meta', used: 38, presets: ['clip'] },
  { name: 'description', type: 'text', builtin: true, def: '页面 meta', used: 44, presets: ['clip'] },
  { name: 'project', type: 'text', builtin: false, def: '支付重试', used: 6, presets: ['clip'] },
  { name: 'reviewed', type: 'checkbox', builtin: false, def: '', used: 4, presets: [] },
  { name: 'priority', type: 'number', builtin: false, def: '', used: 3, presets: [] },
  { name: 'due', type: 'date', builtin: false, def: '', used: 0, presets: [] },
]

// 保留名（entry.md §5.3）
const RESERVED = ['id', 'type', 'source', 'created', 'updated', 'content', 'note']

// 样例条目，来自 examples.md §2 的主线走查（为支付系统设计失败重试策略）。
// clip 的 content 是 Markdown；hl 是高亮的 [引文, 颜色, 备注]，下面按引文在 content 里的位置换算成 { s, e }（entry.md §4）。
const ENTRIES0 = [
  {
    id: 'e1', type: 'clip', title: 'Retries and backpressure', content: 'Retries can amplify an outage when the dependency is already saturated. Without a budget, every client retries at once.',
    ctx: 'When the dependency is saturated, every retry adds load to a system that is already failing. Retries can amplify an outage when the dependency is already saturated. Without a budget, every client retries at once.',
    host: 'engineering.example.com', path: '/posts/retries', when: '周一', tags: ['retry', 'reliability'], note: '对照复盘里的流量曲线。',
    props: { author: ['Jane Doe'], published: '2026-09-12', project: '支付重试', reviewed: false },
    hl: [['Without a budget, every client retries at once.', 'yellow', '重试预算']],
  },
  {
    id: 'e2', type: 'clip', title: 'Retries and backpressure', host: 'engineering.example.com', path: '/posts/retries', when: '周一', tags: ['retry'], note: '写进方案第 3 节',
    content: '## 指数退避加抖动\n\n重试不要立刻发出：每次失败后把等待时间翻倍，直到上限，再乘一个 0–1 的**随机因子**，让客户端不再同时重试。\n\n1. 从一个较小的基础间隔开始。\n2. 每次失败后翻倍，不超过上限。\n3. 乘一个 0–1 的随机因子（抖动）。\n\n完整推导见 [AWS 架构博客](https://example.com/backoff)。',
    props: { project: '支付重试' },
    hl: [['每次失败后翻倍，不超过上限', 'green', ''], ['乘一个 0–1 的随机因子（抖动）', 'yellow', '解释为什么要抖动']],
  },
  { id: 'e3', type: 'screenshot', title: '重试开始后 p99 延迟曲线', content: '', host: 'sre.example.org', path: '/incidents/2026-09', when: '周一', tags: ['incident', 'retry'], img: 'chart', props: { project: '支付重试' }, hl: [] },
  { id: 'e4', type: 'clip', title: 'Idempotency keys', content: '幂等键应在请求首次落库时生成，并与结果一起保存至重试窗口结束。', host: 'engineering.example.com', path: '/posts/idempotency', when: '周四', tags: ['retry', 'api'], props: { project: '支付重试' }, hl: [] },
  {
    id: 'e5', type: 'clip', title: 'Circuit breakers', host: 'engineering.example.com', path: '/posts/circuit-breakers', when: '周五', tags: ['reliability'], props: {},
    content: '## 熔断器\n\n依赖持续失败时快速失败，给下游留出恢复时间。\n\n- **关闭**：请求正常通过，同时统计失败率。\n- **打开**：直接拒绝请求，不再调用依赖。\n- **半开**：放行少量探测请求，成功就恢复。',
    hl: [['依赖持续失败时快速失败，给下游留出恢复时间。', 'green', '']],
  },
  { id: 'e6', type: 'clip', title: 'Conway’s law in practice', content: 'Most microservice failures are organizational failures.', host: 'arch.example.net', path: '/essays/org-failures', when: '上周', tags: ['architecture'], props: { priority: 2 }, hl: [] },
  { id: 'e7', type: 'screenshot', title: '熔断器状态机示意图', content: '', host: 'engineering.example.com', path: '/posts/circuit-breakers', when: '周五', tags: ['reliability'], img: 'diagram', props: {}, hl: [] },
  {
    id: 'e8', type: 'clip', title: 'Backpressure in Streams', host: 'engineering.example.com', path: '/posts/backpressure-in-streams', when: '3 天前', tags: ['streams'], props: {},
    content: '## Backpressure\n\nWhen a producer emits events faster than a consumer can process them, something has to give.\n\n**Backpressure** is how a system pushes that pain back where it belongs. Instead of letting buffers absorb the mismatch indefinitely, the consumer signals demand upstream.\n\n### Three common strategies\n\n1. Demand signaling: the consumer grants credits.\n2. Bounded buffers: queues with a hard limit.\n3. Load shedding: drop the least valuable work first, on purpose.',
    hl: [['is how a system pushes that pain back where it belongs.', 'blue', ''], ['Load shedding: drop the least valuable work first, on purpose.', 'pink', '']],
  },
  { id: 'e9', type: 'clip', title: 'Scope notes', content: '单人本地优先是核心验证，协作会引入账号、权限和冲突复杂度。', host: 'product.example.org', path: '/notes/scope', when: '上周', tags: ['scope'], props: { reviewed: true }, hl: [] },
  { id: 'e10', type: 'screenshot', title: '容量规划表（二季度）', content: '', host: 'arch.example.net', path: '/capacity', when: '上周', tags: [], img: 'table', props: {}, hl: [] },
  {
    id: 'e11', type: 'clip', title: 'Production incident triage', content: '确认影响 → 限制扩散 → 保存证据 → 建立时间线 → 验证恢复', host: 'sre.example.org', path: '/runbooks/triage', when: '昨天', tags: ['oncall'], props: {},
    hl: [['保存证据', 'pink', '先拍快照再改配置']],
  },
  { id: 'e12', type: 'screenshot', title: '重试预算仪表盘', content: '', host: 'engineering.example.com', path: '/dashboards/retry-budget', when: '3 周前', tags: ['retry'], img: 'bars', props: {}, hl: [] },
]
let hlSeq = 0
ENTRIES0.forEach(e => {
  e.hls = (e.hl || []).map(([q, c, note]) => {
    const s = e.content.indexOf(q)
    if (s < 0) throw new Error(`样例高亮的引文不在正文里：${q}`)
    return { id: `h${++hlSeq}`, t: hlSeq, s, e: s + q.length, q, c, note }
  })
  delete e.hl
})

// 导航上显示的总数（设计示例数字，与 extension.md 的线框图一致）：全部 = 剪藏 + 截图；高亮 = 高亮的条数
const COUNTS = { all: 95, clip: 71, highlight: 33, screenshot: 24, props: 9 }

// 原型的共享状态：两个可交互原型读写同一份，页面里剪藏的内容会出现在资料库原型里。
const STORE = {
  entries: JSON.parse(JSON.stringify(ENTRIES0)),
  registry: JSON.parse(JSON.stringify(REGISTRY0)),
  seq: 100,
  listeners: new Set(),
  emit() {
    this.listeners.forEach(fn => fn())
  },
}

const DOC_FILES = {
  product: 'product.md', entry: 'entry.md', extension: 'extension.md', capture: 'capture.md', screenshot: 'screenshot.md', search: 'search.md',
  storage: 'storage.md', metrics: 'metrics.md', validation: 'validation.md', roadmap: 'roadmap.md', examples: 'examples.md',
  stories: 'user-stories.md', readme: 'README.md', visual: 'visual.md', market: 'market.md', website: 'website.md',
}
