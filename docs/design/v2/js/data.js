// 设计稿共用的文案与样例数据。规则取自 docs/v2（entry.md、extension.md、examples.md），
// 这里只做复制，规则以 docs/v2 为准；示例来源均为中性域名。

// 三种条目类型（entry.md §2）。菜单顺序固定为：剪藏、高亮、截图。
const TYPES = {
  clip: { zh: '剪藏', en: 'Clip', plural: 'Clips', icon: 'bookmark', tip: '保存原文和语境，之后查阅', tipEn: 'Save the text and its context for later' },
  highlight: { zh: '高亮', en: 'Highlight', plural: 'Highlights', icon: 'highlighter', tip: '只在页面留痕，可加备注', tipEn: 'Mark it on the page; add a note if you like' },
  screenshot: { zh: '截图', en: 'Screenshot', plural: 'Screenshots', icon: 'scan', tip: '框选区域或单击元素 · 保存为图片', tipEn: 'Drag a region or click an element · saved as an image' },
}
const TYPE_ORDER = ['clip', 'highlight', 'screenshot']

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

// 高亮调色板（color 属性的取值）
const HL_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple']

// 属性注册表（entry.md §5.3、§5.4）。used = 使用数；presets = 采集时自动附加该属性的类型。
const REGISTRY0 = [
  { name: 'title', type: 'text', builtin: true, fixed: true, def: '页面标题', used: 128, presets: ['clip', 'highlight', 'screenshot'] },
  { name: 'tags', type: 'list', builtin: true, fixed: true, def: '', used: 97, presets: ['clip', 'highlight', 'screenshot'] },
  { name: 'author', type: 'list', builtin: true, def: '页面 meta', used: 41, presets: ['clip', 'highlight'] },
  { name: 'published', type: 'date', builtin: true, def: '页面 meta', used: 38, presets: ['clip', 'highlight'] },
  { name: 'description', type: 'text', builtin: true, def: '页面 meta', used: 44, presets: ['clip', 'highlight'] },
  { name: 'color', type: 'text', builtin: true, def: 'yellow', used: 33, presets: ['highlight'] },
  { name: 'project', type: 'text', builtin: false, def: '支付重试', used: 6, presets: ['clip'] },
  { name: 'reviewed', type: 'checkbox', builtin: false, def: '', used: 4, presets: [] },
  { name: 'priority', type: 'number', builtin: false, def: '', used: 3, presets: [] },
  { name: 'due', type: 'date', builtin: false, def: '', used: 0, presets: [] },
]

// 保留名（entry.md §5.3）
const RESERVED = ['id', 'type', 'source', 'created', 'updated', 'content', 'note']

// 样例条目，来自 examples.md §2 的主线走查（为支付系统设计失败重试策略）
const ENTRIES0 = [
  {
    id: 'e1', type: 'clip', title: 'Retries and backpressure', content: 'Retries can amplify an outage when the dependency is already saturated.',
    ctx: 'When the dependency is saturated, every retry adds load to a system that is already failing. Without a budget, every client retries at once.',
    host: 'engineering.example.com', path: '/posts/retries', when: '周一', tags: ['retry', 'reliability'], note: '对照复盘里的流量曲线。',
    props: { author: ['Jane Doe'], published: '2026-09-12', project: '支付重试', reviewed: false },
  },
  {
    id: 'e2', type: 'highlight', title: 'Retries and backpressure', content: '指数退避加抖动：基础间隔 × 2^n，再乘一个 0–1 的随机因子。',
    host: 'engineering.example.com', path: '/posts/retries', when: '周一', tags: ['retry'], color: 'yellow', note: '写进方案第 3 节',
    props: { project: '支付重试' },
  },
  { id: 'e3', type: 'screenshot', title: '重试开始后 p99 延迟曲线', content: '', host: 'sre.example.org', path: '/incidents/2026-09', when: '周一', tags: ['incident', 'retry'], img: 'chart', props: { project: '支付重试' } },
  { id: 'e4', type: 'clip', title: 'Idempotency keys', content: '幂等键应在请求首次落库时生成，并与结果一起保存至重试窗口结束。', host: 'engineering.example.com', path: '/posts/idempotency', when: '周四', tags: ['retry', 'api'], props: { project: '支付重试' } },
  { id: 'e5', type: 'highlight', title: 'Circuit breakers', content: '依赖持续失败时快速失败，给下游留出恢复时间。', host: 'engineering.example.com', path: '/posts/circuit-breakers', when: '周五', tags: ['reliability'], color: 'green', props: {} },
  { id: 'e6', type: 'clip', title: 'Conway’s law in practice', content: 'Most microservice failures are organizational failures.', host: 'arch.example.net', path: '/essays/org-failures', when: '上周', tags: ['architecture'], props: { priority: 2 } },
  { id: 'e7', type: 'screenshot', title: '熔断器状态机示意图', content: '', host: 'engineering.example.com', path: '/posts/circuit-breakers', when: '周五', tags: ['reliability'], img: 'diagram', props: {} },
  { id: 'e8', type: 'highlight', title: 'Backpressure in Streams', content: 'Backpressure is how a system pushes that pain back where it belongs.', host: 'engineering.example.com', path: '/posts/backpressure-in-streams', when: '3 天前', tags: ['streams'], color: 'blue', props: {} },
  { id: 'e9', type: 'clip', title: 'Scope notes', content: '单人本地优先是核心验证，协作会引入账号、权限和冲突复杂度。', host: 'product.example.org', path: '/notes/scope', when: '上周', tags: ['scope'], props: { reviewed: true } },
  { id: 'e10', type: 'screenshot', title: '容量规划表（二季度）', content: '', host: 'arch.example.net', path: '/capacity', when: '上周', tags: [], img: 'table', props: {} },
  { id: 'e11', type: 'highlight', title: 'Production incident triage', content: '确认影响 → 限制扩散 → 保存证据 → 建立时间线 → 验证恢复', host: 'sre.example.org', path: '/runbooks/triage', when: '昨天', tags: ['oncall'], color: 'pink', props: {} },
  { id: 'e12', type: 'screenshot', title: '重试预算仪表盘', content: '', host: 'engineering.example.com', path: '/dashboards/retry-budget', when: '3 周前', tags: ['retry'], img: 'bars', props: {} },
  { id: 'e13', type: 'highlight', title: 'Retries and backpressure', content: 'Without a budget, every client retries at once.', host: 'engineering.example.com', path: '/posts/retries', when: '周一', tags: ['retry'], color: 'yellow', note: '重试预算', props: {} },
  { id: 'e14', type: 'highlight', title: 'Backpressure in Streams', content: 'Load shedding: drop the least valuable work first, on purpose.', host: 'engineering.example.com', path: '/posts/backpressure-in-streams', when: '3 天前', tags: ['streams'], color: 'pink', props: {} },
]

// 导航上显示的总数（设计示例数字，与 extension.md 的线框图一致）
const COUNTS = { all: 128, clip: 71, highlight: 33, screenshot: 24, props: 10 }

// 原型的共享状态：两个可交互原型读写同一份，页面里剪藏的内容会出现在资料库原型里。
const STORE = {
  entries: JSON.parse(JSON.stringify(ENTRIES0)),
  registry: JSON.parse(JSON.stringify(REGISTRY0)),
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
