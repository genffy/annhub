# 标注架构重构计划

更新时间：2026-06-01

本文档分析 AnnHub 高亮标注与生词标注的重合逻辑，并记录 annotation core 重构的实施范围、验收标准和后续边界。

实现状态：

- Phase 1 已完成：X/Twitter 平台规则统一到 `entrypoints/content/annotation-core/platform-rules.ts`。
- Phase 2 已完成：生词 DOM policy 迁移到 `entrypoints/content/annotation-core/dom-policy.ts`，旧路径保留兼容导出。
- Phase 3 已完成主体：高亮恢复 text range 与生词 marker wrap/unwrap/cleanup 已抽到 `annotation-core/text-range.ts` 和 `annotation-core/markers.ts`。
- Phase 4 已完成（2026-06-01）：高亮**创建路径**也接入 `wrapRange/unwrapMarker`；`findTextRangeInElement` 支持 `intent` 参数，高亮恢复路径以 `manual-highlight` intent 真实消费 `dom-policy`；`manual-highlight` 与 `auto-vocab` policy 在生产代码中均有调用方，不再是 dead code。
- 生词选词精准化（2026-06-01）：新增 `annotation-core/lemmatize.ts`（词形还原，仅用于查表）；难度门由小 CEFR 表换成通用语料词频带 `vocab-label/frequency-band-data.ts`（OpenSubtitles 50k，离线脚本 `scripts/build-frequency-data.ts` 生成），`frequency-filter.ts` 反转默认——**不在词频表的长尾词（专名/术语/噪声）默认不标**；`isLikelyProperNounCandidate` 增补词频信号修掉句首专名逃逸。数据契约未变。
- 重构清理（2026-06-14，按 code review）：① 统一 X host 判断——permalink 解析（`parseTwitterStatusHref`）改用与规则匹配一致的子域名感知 `isXHost`，修掉"规则在子域名页面命中、却永远抽不到 permalink"的漂移，并删除冗余的 `TWITTER_HOST_RE`；② vocab 增量扫描的 marker 自触发判定接入共享 `isWithinAnnotationMarker`（同时识别高亮 marker），删除已无调用方的 `isWithinVocabMarker`，落实 §9 Phase 2「增量扫描使用共享 marker 判断」；③ `findNearestRescanContainer` 与其别名合并为单一公共名 `findNearestAnnotatableBlock`；④ `collectTextNodes` 默认 intent 改为 `manual-highlight`，省略 intent 的调用方不再误匹配 `script`/隐藏/已有 marker 内文本。数据契约未变。
- 数据契约始终未改变：`HighlightRecord.metadata.sourceUrl`、`data-ann-vocab`、`data-highlight-id` 均保持原名和语义。

> 与本文档配套的全局规则见 `AGENTS.md §七` 第 12 条"文档同步（强制）"与 `CLAUDE.md` "Docs stay in sync"：任何 annotation-core 行为或接口变更，**必须**同步更新本文档对应章节，否则任务不算完成。

## 1. 概览

核心判断：

- 高亮是用户主动标注：从 `Range` 出发，生成持久化记录、`sourceUrl`、`selector`，并恢复到页面。
- 生词是自动标注：从内容区域、词库和规则出发，扫描文本节点并生成临时 DOM 标记。
- 两者目标不同，但在站点内容识别、DOM 跳过策略、文本范围定位、标记包裹/清理、SPA 增量扫描上有明显重复。
- 当前 X quoted tweet 问题就是两套规则漂移导致的：高亮认为 quoted tweet 是内容源，生词标注却可能把它当成交互链接跳过。

重构方向是新增共享的 content annotation core，让高亮和生词共享“页面理解”和 DOM 安全工具，各自保留业务决策。

## 2. 现状分析

### 高亮链路

```text
selection Range
  -> selector / context / sourceUrl
  -> HighlightRecord
  -> DOM wrap
  -> restore
```

关键模块：

- `entrypoints/content/highlight/highlight-dom.ts`
- `entrypoints/content/highlight/service.ts`
- `background-service/services/highlight/*`

高亮的主要职责：

- 接收用户选区。
- 生成稳定 selector、上下文和 `metadata.sourceUrl`。
- 保存 `HighlightRecord`。
- 在当前页或 sourceUrl 指向的详情页恢复 DOM 高亮。

### 生词链路

```text
contentRoot / blocks
  -> viewport gating (IntersectionObserver, ±50% rootMargin)
  -> idle-callback batched flush
  -> text node scan (annotation-core/dom-policy)
  -> vocab rules + CEFR / 学习态过滤
  -> DOM wrap (annotation-core/markers)
  -> MutationObserver rescan + scroll/resize 重 reconcile
```

关键模块：

- `entrypoints/content/vocab-label/index.ts`
- `entrypoints/content/vocab-label/annotate.ts`
- `entrypoints/content/vocab-label/dom-policy.ts`（已变为 annotation-core/dom-policy 的 re-export）
- `entrypoints/content/vocab-label/platform-rules.ts`（annotation-core 平台规则的适配层）
- `entrypoints/content/vocab-label/content-scope.ts`
- `entrypoints/content/vocab-label/viewport.ts`
- `entrypoints/content/vocab-label/frequency-filter.ts`
- `entrypoints/content/vocab-label/cefr-data.ts`

生词标注的主要职责：

- 判断配置、域名和英文页。
- 定位正文 root 和可扫描 block。
- 扫描文本节点，按词库、CEFR、熟练度、预算过滤候选词。
- 从本地 `exp`、缓存或 LLM 获取释义。
- 写入临时 DOM marker，并在视口变化或销毁时清理。

### 当前重复点

- X/Twitter 规则：quoted tweet、普通 tweet、tweet text、permalink 提取。
- Content container：正文 root、article/feed block、quoted card container。
- Interactive skip：链接、按钮、action bar、用户名、可交互卡片。
- Text range search：从文本和上下文恢复 `Range`。
- DOM marker lifecycle：安全包裹、解包、清理、避免 MutationObserver 自触发。

## 3. 问题归因

1. `highlight/highlight-dom.ts` 与 `vocab-label/platform-rules.ts` 分别维护 X 规则。
2. `vocab-label/dom-policy.ts` 的跳过策略和高亮恢复的搜索策略没有共享语义。
3. 同一 DOM 场景下，高亮认为 quoted tweet 是内容源，生词标注却可能认为它是交互链接。
4. 站点适配目前是功能局部补丁，缺少统一的页面内容模型。
5. SPA 增量扫描、视口清理和 marker 幂等逻辑只服务生词标注，高亮恢复不能复用这些能力。

## 4. 目标架构

新增共享 content annotation core，负责：

- 平台识别。
- 内容容器定位。
- permalink / `sourceUrl` 提取。
- 可标注文本区域判断。
- 文本范围查找。
- DOM marker 安全包裹和清理。

高亮和生词只保留各自业务决策：

- 高亮决定用户选区、颜色、备注、持久化。
- 生词决定候选词、释义、熟练度、标注预算。

目标结构建议：

```text
entrypoints/content/
  annotation-core/
    platform-rules.ts
    dom-policy.ts
    text-range.ts
    markers.ts
    types.ts
  highlight/
    ...
  vocab-label/
    ...
```

## 5. 重构计划

分三阶段实施，避免一次性大改。

### 5.1 Phase 1：抽共享站点规则

新增 `entrypoints/content/annotation-core/`，先抽平台规则。

建议文件：

- `entrypoints/content/annotation-core/types.ts`
- `entrypoints/content/annotation-core/platform-rules.ts`

提供稳定入口：

```typescript
getActiveAnnotationPlatformRule(url?: URL): AnnotationPlatformRule | null
```

X/Twitter rule 必须同时服务：

- 高亮 `sourceUrl` 提取。
- 高亮恢复时按 `sourceUrl` 找容器。
- 生词标注时收集 `[data-testid="tweetText"]`，包含 quoted tweet。

迁移顺序：

1. 把 X/Twitter permalink parsing、source container lookup 从 `highlight-dom.ts` 抽到 core。
2. 把 `vocab-label/platform-rules.ts` 中的 X/Twitter block 收集迁到 core。
3. `highlight-dom.ts` 和 `vocab-label/index.ts` 改为调用同一个 rule。
4. 保留原文件薄封装，先降低测试和 import 迁移风险。

### 5.2 Phase 2：抽共享 DOM policy

将 `vocab-label/dom-policy.ts` 改为共享 `annotation-core/dom-policy.ts`。

暴露统一接口：

```typescript
isAnnotatableTextNode(node: Node, intent?: AnnotationIntent): boolean
findNearestAnnotatableBlock(startNode: Node, contentRoot: Element, intent?: AnnotationIntent): Element | null
isWithinAnnotationMarker(node: Node | null): boolean
```

`intent` 固定为：

```typescript
type AnnotationIntent = 'manual-highlight' | 'auto-vocab'
```

策略差异：

- `manual-highlight`：允许用户选中更多区域，但仍跳过扩展自身 UI 和已有 annotation marker。
- `auto-vocab`：保持更保守，跳过控件、代码、隐藏区域、`translate="no"`、`.notranslate`、短 UI label 和明显非自然语言文本。

迁移顺序：

1. 在 core 中复刻现有 `auto-vocab` policy，确保测试不变。
2. 增加 `manual-highlight` intent 的更宽松策略。
3. `vocab-label/index.ts` 和 `annotate.ts` 切到 core policy。
4. 高亮恢复的 source container / text search 逐步接入 `manual-highlight` policy。

### 5.3 Phase 3：抽文本定位与 DOM marker

抽出 `text-range.ts`：

```typescript
findTextRangeInElement(element: Element, text: string, context?: TextContext, options?: { intent?: AnnotationIntent }): Range | null
createRangeFromTextIndex(textNodes: Text[], start: number, length: number): Range | null
getTextContext(range: Range): TextContext
```

抽出 `markers.ts`：

```typescript
wrapRange(range: Range, markerConfig: MarkerConfig): Element | null
unwrapMarker(el: Element): void
cleanupMarkers(selector: string): void
```

原则：

- 高亮 marker 和 vocab marker 使用不同 class / data attribute。
- 共享 `Range.surroundContents` 的安全 fallback、marker unwrap、cleanup 逻辑。
- 不改变现有 `data-ann-vocab`、`data-highlight-id` 的外部契约。

迁移顺序：

1. 把生词标注的 ruby/span unwrap 逻辑抽到 marker helper。
2. 把高亮恢复的 `findTextInElement` / `findTextRangeSync` 逐步迁到 `text-range.ts`。
3. 为 text-range 增加 quoted tweet、普通文章、跨 text node 的单测。
4. 最后减少高亮和生词各自内部重复 helper。

## 6. Public Interfaces / Types

建议新增稳定接口：

```typescript
export type AnnotationIntent = 'manual-highlight' | 'auto-vocab'

export interface ContentSource {
  sourceUrl: string | null
  container: Element | null
}

export interface AnnotationPlatformRule {
  name: string
  match(url: URL): boolean
  resolveRoot(): Element | null
  collectContentBlocks(root: Element, intent: AnnotationIntent): Element[]
  findSourceFromElement(element: Element, origin: string): ContentSource
  findContainerBySourceUrl(sourceUrl: string, origin: string): Element | null
}
```

可选补充类型：

```typescript
export interface TextContext {
  before?: string
  after?: string
}

export interface MarkerConfig {
  tagName: 'mark' | 'span' | 'ruby'
  className?: string
  attributes?: Record<string, string>
  children?: (base: Element) => void
}
```

## 7. 兼容原则

- `HighlightRecord.metadata.sourceUrl` 不改名、不迁移。
- 现有 `data-ann-vocab` 不改名。
- 现有 `data-highlight-id` 不改名。
- 先引入共享模块，再逐步迁移调用方，避免一次性破坏测试。
- 保持高亮和生词标注的产品语义分离：共享底层页面理解，不合并业务逻辑。
- 平台 rule 的行为变化必须由高亮和生词两边测试共同覆盖。

## 8. 测试计划

测试策略按“共享 core 行为 + 两个调用方回归”组织。每个阶段都要先补 core 单测，再保留或补齐高亮、生词两侧的薄集成测试，避免共享模块正确但调用语义漂移。

### X quoted tweet

必须覆盖：

- 引用页内的原推文本可被生词标注。
- 高亮引用卡片内文本时，`sourceUrl` 指向原推。
- 原推详情页恢复高亮时，落在原推正文，不落在引用者正文。
- quoted card 外层存在 `role="link"` 时，`auto-vocab` 仍允许 `[data-testid="tweetText"]` 内正文，但不标注卡片里的用户名、时间和 action 文案。

### X 普通 tweet

必须覆盖：

- 普通正文、高亮、生词标注行为不变。
- action bar、用户名、按钮、链接文本不被生词误标。
- tweet permalink 仍优先从 `<time>` 所在链接提取。
- `findContainerBySourceUrl()` 在详情页返回正文所在 tweet container，而不是同页其它推荐 tweet。

### 通用页面

必须覆盖：

- `a[href]` 文本仍默认跳过自动生词标注。
- 用户手动高亮不受自动标注 skip policy 过度限制。
- 已有 `data-ann-vocab` / `data-highlight-id` marker 不触发重复扫描或重复包裹。
- 跨 text node 文本可以通过共享 `text-range` 找回。
- `cleanupMarkers()` 不把 `ruby rt` 释义文本泄漏回正文。

### 建议新增测试文件

```text
entrypoints/content/annotation-core/__tests__/
  platform-rules.test.ts
  dom-policy.test.ts
  text-range.test.ts
  markers.test.ts
```

测试职责：

- `platform-rules.test.ts`：覆盖 X host match、`collectContentBlocks()`、quoted tweet sourceUrl、详情页 container 反查。
- `dom-policy.test.ts`：覆盖 `manual-highlight` 与 `auto-vocab` 在链接、按钮、quoted tweet、扩展 marker 上的差异。
- `text-range.test.ts`：覆盖 selector 命中、selector 失效 fallback、上下文 disambiguation、跨文本节点。
- `markers.test.ts`：覆盖 `mark` / `span` / `ruby` 的 wrap、fallback wrap、unwrap、批量 cleanup。

原有测试迁移原则：

- 迁移初期不删除 `highlight/__tests__/highlight-dom.test.ts` 和 `vocab-label/__tests__/*` 的关键用例。
- 被 core 覆盖的低层用例可以在后续阶段减少重复，但必须保留调用方语义测试。
- X quoted tweet 至少在 core、highlight、vocab 三层各保留一个回归用例。

### 回归命令

```bash
npx vitest run entrypoints/content/highlight/__tests__/highlight-dom.test.ts
npx vitest run entrypoints/content/vocab-label/__tests__/annotate.test.ts
npx vitest run entrypoints/content/vocab-label/__tests__/platform-rules.test.ts
npx vitest run entrypoints/content/vocab-label/__tests__/content-scope.test.ts
npx vitest run entrypoints/content/annotation-core/__tests__
npm run build
```

阶段内如果还没有创建 `annotation-core/__tests__`，对应命令可先跳过，但该阶段完成前必须补上。

## 9. 分阶段交付定义

### Phase 1 完成标准（已完成）

- 新增 `annotation-core/platform-rules.ts` 与 `types.ts`。
- X/Twitter 的 host match、content root、tweet text block 收集、tweet permalink 提取只在 core 中维护。
- `highlight/highlight-dom.ts` 不再持有独立的 X permalink rule 细节，只通过 core rule 获取 `sourceUrl` / source container。
- `vocab-label/platform-rules.ts` 变成兼容导出或薄封装，调用 core rule。
- quoted tweet 的高亮 `sourceUrl` 和生词标注测试同时通过。

### Phase 2 完成标准（已完成）

- 新增或迁移 `annotation-core/dom-policy.ts`。
- `vocab-label/dom-policy.ts` 只保留兼容导出，真实策略来自 core。
- `auto-vocab` 行为与当前生词标注保持一致，包括保守跳过链接、按钮、代码、隐藏内容、`translate="no"` 和短 UI label。
- `manual-highlight` 只跳过扩展 UI、已有 marker、不可见/不可编辑安全边界，不继承自动生词的短文本和链接限制。
- MutationObserver 增量扫描使用共享 marker 判断，避免 marker 自触发导致重复扫描。

### Phase 3 完成标准（已完成主体；高亮创建路径在 Phase 4 完成）

- 新增 `annotation-core/text-range.ts` 与 `markers.ts`。
- 高亮恢复的文本查找和生词标注的 DOM 包裹共享底层 helper。
- `data-highlight-id`、`data-ann-vocab`、高亮颜色、ruby 展示结构保持兼容。
- `Range.surroundContents()` 失败时的 fallback 行为在 core 中有单测。
- `destroyVocabLabel()`（旧名 `cleanupAnnotations()`）和高亮 remove/restore 均不产生孤立空节点、重复 marker 或释义文本泄漏。

本轮实现说明：

- `text-range.ts` 覆盖高亮恢复路径的文本节点收集、文本匹配和索引转 `Range`。
- `markers.ts` 覆盖通用 `wrapRange()`、`unwrapMarker()`、`cleanupMarkers()`。
- 生词 marker 的可见性观察、block 关联和 sentence metadata 仍保留在 `vocab-label/annotate.ts`，避免把业务运行时状态混进 core。
- Phase 3 阶段高亮 DOM **创建**仍保留独立实现于 `highlight-dom.ts`，恢复查找路径已迁移；本残留在 Phase 4 闭环。

### Phase 4 完成标准（已完成 — 2026-06-01）

补齐 Phase 3 残留 + 真实消费 `manual-highlight` policy：

- `highlight/highlight-dom.ts` 的 `wrapTextNode` 改用 `annotation-core/markers.wrapRange`，统一 `surroundContents` fallback；`removeHighlight` 改用 `unwrapMarker`，并在 unwrap 前移除 `.ann-highlight-tooltip` 子节点防止 tooltip 文本泄漏到正文。
- `wrapTextNode` 在 wrap 前调用 `shouldSkipElement(parent, 'manual-highlight')`：跳过 contenteditable 区域、扩展 UI 与已存在的 `data-highlight-id` / `data-ann-vocab` 容器，避免嵌套 marker。
- `findTextRangeInElement(element, target, context, { intent })` 接受可选 `intent`；`collectTextNodes(element, { intent })` 在 TreeWalker 阶段过滤。
- `highlight/service.ts` 的 `findTextRangeSync` 三级 fallback（platform rule container → selector → document.body）全部以 `intent: 'manual-highlight'` 调用 `findTextRangeInElement`，使 `dom-policy` 在生产路径生效。
- `manual-highlight` 与 `auto-vocab` 两个 intent 在 `entrypoints/content/` 内均有真实调用方，policy 不再是 dead code。
- 新增 `entrypoints/content/highlight/__tests__/wrap-integration.test.ts` 覆盖 wrapRange 接入、unwrap tooltip 防泄漏、contenteditable 跳过、嵌套 marker 跳过、idempotent remove。
- 扩展 `annotation-core/__tests__/text-range.test.ts`，覆盖 intent 在文本节点收集与查找路径上的过滤行为。

### 文档/代码同步标准

- 每完成一个 phase，要更新本文档对应完成状态或新增实现记录。
- 如果新增站点 rule，要在本文档或站点 rule 注释中写明可标注 block、permalink 来源、跳过策略差异。
- 如果改变公开数据契约，必须同步更新 `types/highlight.ts`、`types/vocabulary.ts` 或对应消息协议文档；默认不改变契约。
- 命名漂移（如 `cleanupAnnotations` → `destroyVocabLabel`）必须在本文档勘误。
- 与 `AGENTS.md`、`CLAUDE.md` 的"文档同步（强制）"约束一致：代码与文档必须同 PR 落地。

## 10. 建议实施任务拆分

### PR 1：平台规则统一（已完成）

范围：

- 新增 `annotation-core/types.ts`。
- 新增 `annotation-core/platform-rules.ts`。
- 迁移 X/Twitter permalink、tweet container、tweet text block 收集。
- 保留 `vocab-label/platform-rules.ts` 作为兼容 facade。
- 调整 `highlight-dom.ts` 的 `findSourceUrl()` / `findSourceContainer()` 调用。

不做：

- 不重写 DOM marker。
- 不调整 LLM、生词过滤、欧路同步。
- 不改变 `HighlightRecord` 或 `ClipRecord`。

### PR 2：DOM policy 统一（已完成）

范围：

- 新增共享 `AnnotationIntent`。
- 迁移 `shouldSkipElement()`、`shouldSkipTextNode()`、`isWithinVocabMarker()` 的通用部分。
- 增加 `isWithinAnnotationMarker()`，同时识别 vocab marker 和 highlight marker。
- 让 `vocab-label/annotate.ts`、`content-scope.ts`、`index.ts` 通过 core policy 工作。
- 为高亮文本搜索准备 `manual-highlight` policy（Phase 4 完成接入）。

### PR 3：text range 和 marker helper（已完成）

范围：

- 抽出共享 text node 收集、文本索引转 Range、上下文生成。
- 抽出 marker wrap/unwrap/cleanup，但保留高亮和生词自己的 marker config。
- 高亮恢复使用 `findTextRangeInElement()`。
- 生词标注使用 `wrapRange()` 替代局部 DOM mutation helper。

### PR 4：高亮创建路径接入共享 marker + 激活 manual-highlight intent（已完成 — 2026-06-01）

范围：

- `highlight-dom.ts` `wrapTextNode` 改用 `wrapRange`；`removeHighlight` 改用 `unwrapMarker`（先清理 tooltip）。
- 调用 `shouldSkipElement(parent, 'manual-highlight')` 防止嵌套到 contenteditable / 已有 annotation marker。
- `findTextRangeInElement` 与 `collectTextNodes` 接受 `intent`，`highlight/service.ts` 三级 fallback 全程传 `'manual-highlight'`。
- 新增 `wrap-integration.test.ts`；扩展 `text-range.test.ts` 覆盖 intent 过滤。

验收命令：

```bash
npx vitest run entrypoints/content/annotation-core/__tests__/text-range.test.ts
npx vitest run entrypoints/content/highlight/__tests__/wrap-integration.test.ts
npx vitest run entrypoints/content/highlight/__tests__/highlight-dom.test.ts
npm run compile
npm test
```

## 11. 风险与控制

### 风险：共享模块过度抽象

控制：

- core 只抽“页面理解”和“DOM 安全工具”，不抽业务状态。
- 不把高亮存储、生词词库、LLM 释义、UI 状态放进 core。
- 接口优先围绕当前调用方需要设计，避免提前支持不存在的平台能力。

### 风险：自动生词变得过于激进

控制：

- `auto-vocab` 默认沿用现有保守策略。
- quoted tweet 是明确例外：允许 `role="link"` 内的 `[data-testid="tweetText"]`，但不放开全部 link/card 文本。
- 新增站点 rule 时必须说明哪些区域允许自动标注，哪些区域仍跳过。

### 风险：手动高亮被自动标注策略误伤

控制：

- `manual-highlight` 与 `auto-vocab` 分 intent。
- 手动高亮不使用短 UI label、CEFR、链接文本等自动标注过滤。
- 高亮恢复 fallback 到正文搜索时，只避开扩展自身 UI、已有 marker 和明显不可见区域。

### 风险：SPA MutationObserver 自触发

控制：

- core marker helper 统一提供 `isWithinAnnotationMarker()`。
- 生词增量扫描在 mutation target、addedNodes 和 rescan container 阶段都跳过 marker。
- marker wrap/cleanup 单测覆盖重复执行不会重复包裹。

### 风险：详情页恢复落错内容

控制：

- `findContainerBySourceUrl()` 必须优先使用平台 rule 的 permalink 反查。
- 文本相同但 sourceUrl 不同的场景，用 source container 缩小搜索范围。
- source container 不存在时才 fallback 到 `document.body`。

## 12. 首个重构 PR 推荐形态

首个 PR 建议只做 Phase 1，目标是先消除 X/Twitter 规则漂移。该 PR 的 diff 应该主要集中在：

```text
entrypoints/content/annotation-core/
entrypoints/content/highlight/highlight-dom.ts
entrypoints/content/vocab-label/platform-rules.ts
entrypoints/content/vocab-label/content-scope.ts
entrypoints/content/vocab-label/index.ts
```

推荐提交顺序：

1. 添加 core types 和 X platform rule，不接调用方。
2. 添加 core platform 单测，覆盖普通 tweet 和 quoted tweet。
3. 将 vocab platform facade 改为调用 core。
4. 将 highlight sourceUrl/sourceContainer 改为调用 core。
5. 跑完整阶段验收命令，必要时补调用方回归测试。

首个 PR 不应包含：

- 大规模格式化。
- UI 文案调整。
- 设置页、后台服务、LLM 或欧路同步改动。
- 数据迁移。
- 与 annotation core 无关的性能优化。

## 13. Assumptions

- 文档新增到 `docs/annotation-architecture-refactor.md`。
- 本轮已按该计划完成 annotation core 主体重构。
- 后续新增站点时优先扩展 `annotation-core/platform-rules.ts`。
- 保持高亮和生词标注的产品语义分离：共享底层页面理解，不合并业务逻辑。
- 目前已有的 quoted tweet 生词标注测试可以作为 Phase 1 的回归基线，本轮新增了 core 层 quoted tweet sourceUrl/sourceContainer 覆盖。
- 若后续发现其它站点规则与 X 差异过大，先扩展 `AnnotationPlatformRule`，不要在调用方重新写站点特例。
