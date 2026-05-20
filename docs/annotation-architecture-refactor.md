# 标注架构重构计划

更新时间：2026-05-20

本文档分析 AnnHub 高亮标注与生词标注的重合逻辑，并给出可直接实施的分阶段重构方案。本次计划只描述架构和迁移路径，不要求一次性执行代码重构。

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
  -> text node scan
  -> vocab rules
  -> DOM wrap
  -> MutationObserver rescan
```

关键模块：

- `entrypoints/content/vocab-label/index.ts`
- `entrypoints/content/vocab-label/annotate.ts`
- `entrypoints/content/vocab-label/dom-policy.ts`
- `entrypoints/content/vocab-label/platform-rules.ts`
- `entrypoints/content/vocab-label/content-scope.ts`

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
isAnnotatableTextNode(node: Node, intent: AnnotationIntent): boolean
findNearestAnnotatableBlock(node: Node, intent: AnnotationIntent): Element | null
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
findTextRangeInElement(element: Element, text: string, context?: TextContext): Range | null
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

### X quoted tweet

必须覆盖：

- 引用页内的原推文本可被生词标注。
- 高亮引用卡片内文本时，`sourceUrl` 指向原推。
- 原推详情页恢复高亮时，落在原推正文，不落在引用者正文。

### X 普通 tweet

必须覆盖：

- 普通正文、高亮、生词标注行为不变。
- action bar、用户名、按钮、链接文本不被生词误标。
- tweet permalink 仍优先从 `<time>` 所在链接提取。

### 通用页面

必须覆盖：

- `a[href]` 文本仍默认跳过自动生词标注。
- 用户手动高亮不受自动标注 skip policy 过度限制。
- 已有 `data-ann-vocab` / `data-highlight-id` marker 不触发重复扫描或重复包裹。

### 回归命令

```bash
npx vitest run entrypoints/content/highlight/__tests__/highlight-dom.test.ts
npx vitest run entrypoints/content/vocab-label/__tests__/annotate.test.ts
npx vitest run entrypoints/content/vocab-label/__tests__/platform-rules.test.ts
npm run build
```

## 9. Assumptions

- 文档新增到 `docs/annotation-architecture-refactor.md`。
- 本次只落文档和重构计划，不直接执行代码重构。
- 后续重构优先解决 X 平台规则漂移，再抽通用 DOM / text utilities。
- 保持高亮和生词标注的产品语义分离：共享底层页面理解，不合并业务逻辑。
