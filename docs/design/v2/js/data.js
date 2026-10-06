// 设计稿共用的文案与样例数据。文案取自 docs/v2（kinds.md、examples.md、extension.md），
// 这里只做复制，规则以 docs/v2 为准；示例来源均为中性域名。
const KINDS = {
  concept: {
    zh: '概念', full: '概念', icon: 'atom', rel: 'R1',
    when: '术语、模型或框架',
    guess: '用自己的话解释它。', verify: '对照定义、边界和示例。', use: '它可以解释你当前哪个问题？',
  },
  claim: {
    zh: '论点', full: '论点', icon: 'scale', rel: 'R1',
    when: '可被支持、质疑或反驳的主张',
    guess: '你目前赞同吗？为什么？（立场、前提、怀疑点）', verify: '检查证据和反例。', use: '你会用它支持、质疑或修正什么判断？',
    need: '立场',
  },
  procedure: {
    zh: '方法', full: '方法', icon: 'list-checks', rel: 'R1',
    when: '方法、步骤、检查清单',
    guess: '先写出你记得的步骤。', verify: '对照完整流程与适用条件。', use: '你准备在哪个任务中执行？',
    need: '至少一个步骤',
  },
  decision: {
    zh: '决策', full: '决策', icon: 'git-branch', rel: 'R1',
    when: '一次取舍及其理由',
    guess: '推断做出该决定的约束。', verify: '核对背景、备选项和后果。', use: '以后用什么信号验证它？',
    need: '理由',
  },
  question: {
    zh: '问题', full: '待验证问题', icon: 'circle-question-mark', rel: 'R1',
    when: '待验证的问题或假设',
    guess: '你当前的假设是什么？', verify: '整理已知证据和未知项。', use: '下一步如何验证？',
    need: '状态，加假设、下一步或答案之一',
  },
  inspiration: {
    zh: '灵感', full: '灵感与短随感', icon: 'lightbulb', rel: 'R1',
    when: '用户自己的短篇想法或随感',
    guess: '这个想法从何而来？', verify: '区分观察、推测与反例。', use: '准备在哪篇文章、哪个问题或下次思考中继续？',
    need: '想法形式和触发背景',
  },
  visual: {
    zh: '视觉', full: '视觉细节', icon: 'image', rel: 'R1',
    when: '图表、界面或视觉细节',
    guess: '这张截图的关键细节是什么？', verify: '对照原图和页面语境。', use: '准备在哪个任务中使用或检验？',
    need: '关键细节描述，且至少关联一张图',
  },
  excerpt: {
    zh: '摘录', full: '摘录', icon: 'quote', rel: 'R1',
    when: '有明确保留原因的一段原文',
    guess: '为什么这段话值得保留？', verify: '回看原文和语境。', use: '你准备在哪个任务中引用或使用？',
  },
  'media-clip': {
    zh: '媒体片段', full: '媒体片段', icon: 'film', rel: 'R4',
    when: '视频或音频的一段时间区间',
    guess: '这段内容的要点是什么？', verify: '对照原片段与转写。', use: '准备在哪个任务中使用这段内容？',
    need: '起止时间和要点摘要',
  },
}

// 采集窗口 kind 选择器的顺序（extension.md §4.1 示意图）
const KIND_ORDER = ['concept', 'claim', 'procedure', 'decision', 'question', 'inspiration', 'visual', 'excerpt']

// 样例碎片，来自 examples.md §3 的主线走查（支付系统失败重试策略）
const FRAGS = [
  { id: 'f1', kind: 'concept', title: 'Backpressure', excerpt: '下游通过需求信号、暂停、缓冲或丢弃，把压力传回上游…', host: 'engineering.example.com', when: '3 天前', tags: ['streams', 'reliability'] },
  { id: 'f2', kind: 'procedure', title: 'Production incident triage', excerpt: '确认影响 -> 限制扩散 -> 保存证据 -> 建立时间线 -> 验证恢复', host: 'sre.example.org', when: '昨天', tags: ['oncall'] },
  { id: 'f3', kind: 'concept', title: '重试风暴', excerpt: 'Retries can amplify an outage when the dependency is already saturated.', host: 'engineering.example.com', when: '周一', tags: ['retry', 'reliability'] },
  { id: 'f4', kind: 'procedure', title: '退避加抖动', excerpt: '指数退避加随机抖动：基础间隔 × 2^n，再乘一个 0–1 的随机因子。', host: 'engineering.example.com', when: '周一', tags: ['retry'] },
  { id: 'f5', kind: 'concept', title: '幂等', excerpt: '同一请求重复执行多次，结果与执行一次相同；重试的安全前提。', host: 'engineering.example.com', when: '周四', tags: ['retry', 'api'] },
  { id: 'f6', kind: 'concept', title: '熔断', excerpt: '依赖持续失败时快速失败，给下游留出恢复时间。', host: 'engineering.example.com', when: '周五', tags: ['reliability'] },
  { id: 'f7', kind: 'claim', title: 'Most microservice failures are organizational failures.', excerpt: '立场：不确定 · 证据：团队边界、部署责任、接口治理的三个例子', host: 'arch.example.net', when: '上周', tags: ['architecture'] },
  { id: 'f8', kind: 'decision', title: '首版不做实时协作', excerpt: '单人本地优先是核心验证，协作会引入账号、权限和冲突复杂度。', host: 'product.example.org', when: '上周', tags: ['scope'] },
  { id: 'f9', kind: 'question', title: '主动加工是否会让采集完成率低于可接受水平？', excerpt: '假设：Highlight/Fragment 分流可以降低放弃率 · 状态：open', host: 'annhub://manual', when: '上周', tags: ['validation'] },
  { id: 'f10', kind: 'visual', title: '重试开始后 5 分钟，下游 p99 延迟从 120ms 升到 2s', excerpt: '红线标出了重试放大的时间点。', host: 'sre.example.org', when: '周二', tags: ['incident'], img: true },
  { id: 'f11', kind: 'inspiration', title: '软件的提醒不应该只问“今天完成了什么”，还应让我看见哪些判断改变了', excerpt: '触发背景：设计碎片库首页时，发现任务计数无法表达理解的演化。', host: 'annhub://manual', when: '周三', tags: ['design'] },
  { id: 'f12', kind: 'excerpt', title: 'Retries can amplify an outage when the dependency is already saturated.', excerpt: '为什么留：支付网关故障复盘时需要引用。', host: 'engineering.example.com', when: '周一', tags: ['retry'] },
]

const DOC_FILES = {
  product: 'product.md', extension: 'extension.md', capture: 'capture.md', screenshot: 'screenshot.md', kinds: 'kinds.md',
  processing: 'processing.md', search: 'search.md', ai: 'ai.md', storage: 'storage.md', fragments: 'fragments.md',
  metrics: 'metrics.md', validation: 'validation.md', roadmap: 'roadmap.md', examples: 'examples.md', stories: 'user-stories.md', readme: 'README.md', visual: 'visual.md',
}
