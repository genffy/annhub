# Fragment 数据契约

> 层级：vision
> 状态：目标契约
> 更新：2026-10-04

本文定义知识碎片的共享字段、类型扩展方式、归一化与校验规则。持久化和本机交付见 [存储契约](storage.md)。

## 1. 定义

**知识碎片 = 一个值得内化的最小知识单位 + 完整语境 + 用户加工产物。**

三个部分缺一不可：

- 没有内容，就没有学习对象。
- 没有语境，无法判断来源、边界和适用条件。
- 没有加工，只是高亮、剪藏或截图。

高亮、剪藏和截图可以成为碎片的来源或附件，但它们本身不自动进入学习核心。

## 2. 类型

`kind` 是碎片的判别字段。新增类型通过登记新的 kind 和 detail 校验器完成，不新增顶层实体。

```typescript
type FragmentKind =
  | 'excerpt' // 值得保留的一段原文及个人注释
  | 'concept' // 概念、术语、模型或框架
  | 'claim' // 可被支持、质疑或反驳的主张
  | 'procedure' // 方法、步骤、检查清单
  | 'decision' // 决策、约束、取舍与后果
  | 'question' // 待验证的问题或假设
  | 'visual' // 图表、界面或视觉细节
  | 'media-clip' // 带时间区间的视频或音频片段，区别于普通 ClipRecord
  | 'inspiration' // 用户原创的短篇灵感或随感
```

| kind          | 典型内容       | 核心加工                   |
| ------------- | -------------- | -------------------------- |
| `excerpt`     | 一段值得保留的原文 | 说明为何重要、准备如何使用 |
| `concept`     | 一项理论或术语 | 自己解释、边界、示例与反例 |
| `claim`       | 一项观点       | 前提、证据、可信度与立场   |
| `procedure`   | 一套方法       | 步骤、适用条件和失败模式   |
| `decision`    | 一次取舍       | 背景、约束、备选项和后果   |
| `question`    | 一个待验证问题 | 当前假设、验证方法和结论   |
| `visual`      | 图表或设计细节 | 视觉描述与设计意图         |
| `media-clip`  | 视频或音频区间 | 摘要、要点和时间定位       |
| `inspiration` | 灵感、短篇随感 | 触发背景、观察与推测、延展方向 |

每种 kind 的采集提问、复习题面和示例见 [kinds.md](kinds.md)；本文只定义字段与校验。

## 3. 共享记录

```typescript
interface FragmentRecord<K extends FragmentKind = FragmentKind> {
  schemaVersion: 4
  id: string
  captureRevision: number
  kind: K

  content: string
  normalizedContent: string
  context: FragmentContext

  processing: {
    guess?: string
    verified: VerifiedResult
    use: string
  }

  detail: DetailOf<K>
  tags: string[]
  review: ReviewState
  createdAt: number
  updatedAt: number
}

interface FragmentContext {
  excerpt: string
  sourceUrl: string
  sourceHost: string
  sourceTitle?: string
  locator: FragmentLocator
  capturedAt: number
}

interface VerifiedResult {
  confirmedAt: number
  source: 'source-material' | 'llm' | 'manual'
  summary?: string
  notes?: string
  references?: string[]
  modelId?: string
  promptVersion?: string
  basedOnModel?: { modelId: string; promptVersion: string }
}

interface ReviewState {
  state: 'new' | 'learning' | 'review' | 'relearning'
  repetitions: number
  lapses: number
  easeFactor: number
  intervalDays: number
  lastReviewedAt?: number
  nextReviewAt: number
}
```

新契约继续使用 `guess / verified / use` 字段名，产品语义统一解释为：

| 字段       | 通用语义                                 |
| ---------- | ---------------------------------------- |
| `guess`    | 用户在核验前的理解、判断或问题           |
| `verified` | 用户已明确确认完成核验步骤；不代表内容已被客观证实，摘要和备注可选 |
| `use`      | 用户准备如何应用、解释或验证这条知识     |

## 4. 类型特化

`detail` 只存类型特有字段。来源、上下文、标签和复习状态不得复制到 detail 中。

```typescript
interface FragmentDetailMap {
  excerpt: { note?: string }
  concept: {
    definition?: string
    boundaries?: string[]
    examples?: string[]
    counterExamples?: string[]
  }
  claim: {
    stance?: 'support' | 'oppose' | 'uncertain'
    evidence?: string[]
    assumptions?: string[]
  }
  procedure: {
    steps: string[]
    prerequisites?: string[]
    failureModes?: string[]
  }
  decision: {
    rationale: string
    alternatives?: string[]
    consequences?: string[]
  }
  question: {
    status: 'open' | 'testing' | 'answered'
    hypothesis?: string
    evidence?: string[]
    nextStep?: string
    answer?: string
  }
  visual: {
    attachmentIds: string[]
  }
  'media-clip': {
    startMs: number
    endMs: number
    attachmentIds?: string[]
  }
  inspiration: {
    form: 'idea' | 'reflection'
  }
}

type DetailOf<K extends FragmentKind> = FragmentDetailMap[K]
```

当前启用全部注册 kind：七种文本 kind（含 `inspiration`）、基础 `visual` 与 `media-clip`（R4：视频/音频时间区间，`content` 为要点摘要，手工转写随 `context.excerpt` 保存，LLM 转写为可选加速）。普通剪藏始终叫 `ClipRecord`，不使用 `media-clip` kind。未来新增类型在注册而未实现时必须返回 `KIND_NOT_IMPLEMENTED`，不能静默写入不受校验的数据。

## 5. 定位符

```typescript
type FragmentLocator =
  | { type: 'dom'; selector: string; textOffset?: number }
  | { type: 'image'; assetId: string; rect?: [number, number, number, number] }
  | { type: 'time'; startMs: number; endMs: number }
  | { type: 'page'; pageNumber: number; rect?: [number, number, number, number] }
  | { type: 'none' }
```

`image.rect` 与 `page.rect` 均为对应图片或页面上的归一化 `[x, y, width, height]`，每项在 0 到 1 之间且矩形不越界；省略表示整张图片或页面。`pageNumber` 从 1 开始，媒体 `time` 满足 `0 <= startMs < endMs`，DOM selector 非空。`image.assetId` 必须在本地资产库中存在，向 Desktop 交付时可暂时缺失图片字节并显示待重试。定位符用于回到原始位置，但不是真源。页面变化或文件移动后，即使定位失败，`content` 与 `context.excerpt` 仍必须足以理解碎片。

## 6. 归一化

归一化只在共享领域层实现一次：

```typescript
function normalizeContent(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, '')
    .trim()
}
```

Host 只转小写并剥离 `www.`。去重键为：

```text
normalizedContent + NUL + sourceUrl + NUL + normalize(excerpt)
```

命中重复时提示已有记录，但允许用户明确保存，因为同一内容在不同上下文中可能有不同价值。

## 7. 校验顺序

```text
kind 已注册
  -> 基础字段范围
  -> normalizedContent 一致
  -> excerpt 包含 content
  -> processing.verified 有效确认
  -> processing.use 非空
  -> detail 按 kind 校验
```

通用规则：

- `content`：trim 后非空，最多 500 字符。
- `captureRevision`：扩展创建时为 1；每次修改采集字段时递增。扩展删除仅作用于本地，不产生 Desktop 修订。Desktop 的复习评分不得改变它。
- `excerpt`：非空，最多 2000 字符，并包含归一化后的 content。
- `sourceUrl`：网页来源使用绝对 `http(s)` URL；本地创建使用 `annhub://manual/<id>`。本地来源不可伪装成网页 URL，`sourceHost` 为 `manual`。
- `tags`：去重，最多 20 项，每项 1 到 32 字符。
- `processing.use`：非空，且不能只复制 `content` 或完整 `excerpt`。
- `processing.verified`：必须有有限的 `confirmedAt` epoch 毫秒和合法来源；`summary`、`notes`、`references` 均可不填。
- 时间字段必须是有限的 epoch 毫秒值。

类型校验示例：

- `procedure.steps` 至少一项。
- `decision.rationale` 非空。
- `visual.content` 非空且能说明关键细节；`detail.attachmentIds` 至少关联一个附件，不重复保存描述文字。
- `media-clip`：`detail` 与 `locator` 的 `endMs` 都必须大于 `startMs` 且不小于 0；`attachmentIds` 可选。
- `image.rect` 和 `page.rect` 四项必须有限、非负，宽高大于零且不越界；pageNumber 必须为正整数，time 区间必须递增。
- `question.status === 'answered'` 时必须有 `answer`。
- `question.status !== 'answered'` 时必须有 `hypothesis` 或 `nextStep`。
- `inspiration.detail.form` 只能是 `idea` 或 `reflection`；其 `content` 是一条短篇原创想法，最多 500 字符，不承载整篇文章。

R1 的 `visual` 来源限于扩展采集的网页截图：`content` 是用户写下的关键细节描述；`excerpt` 以这段描述开头，再补充用户可编辑的页面语境，因而满足包含 `content` 的通用校验。页面原文与用户描述在 UI 中分别标识，不能宣称描述来自网页。`sourceUrl` 指向采集页面，`locator` 使用 `image` 和保存后的 `assetId`。图片字节经 Desktop 本地服务单独写入，不嵌入 Fragment JSON。其他无网页来源的视觉材料留到后续定义。

手工创建 `inspiration` 时，`content` 写用户自己的念头或短随感，`excerpt` 从该内容开始并补充非空的触发背景；使用 `annhub://manual/<id>`、`sourceHost='manual'` 和 `locator=none`，不虚构网页出处。从网页选区得到灵感时，`content` 仍是用户原创文字，`excerpt` 接上被选材料和页面语境，保留真实网页来源。`processing.use` 可写准备在哪篇文章、哪个问题或下次思考中继续发展，不要求立即执行；超过单一知识单位的长篇随笔不属于 AnnHub。

校验失败拒绝落库并返回稳定错误码，UI 不展示原始异常对象。

用户必须在核验步骤主动确认后才能保存；这一步只证明用户看过并确认当前核验状态，不要求写新摘要，也不把有争议主张、未解决问题或个人灵感伪装成确定事实。网页材料可记录 `source-material`，个人反思或手工核对记为 `manual`；只有用户明确接受模型建议才记为 `llm`。确认后若修改 `content`、`context.excerpt`、`sourceUrl`、`kind` 或核验来源，必须清除 `confirmedAt` 并重新确认；修改标签、应用文字或可选备注不影响已确认状态。

无论最终落库门槛如何，`verified.source === 'llm'` 时 `modelId` 和 `promptVersion` 必填。用户修改模型建议后，`source` 改为 `manual`，并在 `basedOnModel` 保留原建议的模型与 prompt 版本；不能把修改后的文字继续标作未改动的模型输出。

## 8. 与其他记录的关系

| 数据       | 用途               | 进入复习              | 进入扩展 Markdown ZIP          |
| ---------- | ------------------ | --------------------- | ----------------------------- |
| Fragment   | 要内化的知识       | 是                    | 可阅读 Markdown               |
| Highlight  | 页面视觉标记与备注 | 否                    | 原文、备注和来源的 Markdown   |
| Clip       | 剪藏               | 否                    | 内容和语境的 Markdown         |
| Screenshot | 本地图片资产       | 否，除非关联 Fragment | Markdown 说明和处理后原图文件 |

Fragment 可以引用高亮或附件 ID，但删除引用不得默认删除独立资产。级联规则由存储层定义。

## 9. UI 派生状态

以下状态不重复写入 Fragment，由核心实体实时派生：

| 状态     | 派生条件                                       |
| -------- | ---------------------------------------------- |
| 新建     | `review.state === 'new'`                       |
| 到期     | `review.nextReviewAt <= now`                   |
| 待加强   | 最近评分为 again/hard，或 `lapses > 0`         |

UI 不得维护第二份布尔字段，否则导入、同步和日志重放后会产生漂移。

## 10. 扩展纪律

新增 kind 的完整清单（采集提问、复习题面、故事与 fixture）见 [kinds.md §5](kinds.md)。属于本文的两项是：登记 `detail` 类型与校验器（第 4、7 节），以及登记但尚未实现的 kind 必须返回 `KIND_NOT_IMPLEMENTED`。

仅把字符串加入 `FragmentKind` 不算完成。
