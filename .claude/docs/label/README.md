# 生词标注模块说明

更新时间：2026-04-28

本文档描述 AnnHub 生词标注模块的当前实现基线、核心策略、数据契约和测试覆盖。

## 1. 目标与范围

生词标注模块面向英文网页，在宿主 DOM 中对候选英文单词添加轻量标注，目标是“少而准”：

1. 减少常见词误标。
2. 避免扫描导航、侧栏、评论等非正文区域。
3. 只处理可视窗口附近内容，降低长页面和 SPA 场景的性能成本。
4. 在无欧路快照时仍支持 LLM-only 标注模式。

主链路：

```text
Options 配置
  -> Background VocabularyService 同步欧路词库 / 调 LLM
  -> Content Script 检测英文页与正文区域
  -> vocab-label 扫描文本、过滤候选词、解析释义、写入 DOM 标注
```

## 2. 模块职责

### Background

- `background-service/services/vocabulary/index.ts`
  - 配置读写：`getVocabConfig` / `setVocabConfig`、`getLlmConfig` / `setLlmConfig`
  - 欧路同步：`syncFromEudic`
  - 欧路词本管理：分类列表、新建、重命名、删除、单词增删查
  - 定时同步：`chrome.alarms`，任务名 `vocab-sync`
  - 释义解析：`resolveGloss`，链路为 `entry.exp -> glossCache -> LLM`
- `background-service/services/vocabulary/message-handles.ts`
  - 对外消息处理：配置、同步、上下文释义、欧路词本管理
- `background-service/services/llm/*`
  - `ILlmClient`
  - `OpenAICompatibleLlmService`
  - `createLlmClient`

### Content

- `entrypoints/content/vocab-label/index.ts`
  - 检查配置开关、域名白名单和英文页检测
  - 解析正文根容器
  - 管理 `IntersectionObserver`、`MutationObserver` 和 scroll/resize 监听
  - 调度可视区域内的增量标注
- `entrypoints/content/vocab-label/annotate.ts`
  - TreeWalker 扫描文本节点
  - 逆序 DOM 包裹，避免 offset 漂移
  - 词库熟练度、CEFR、预算和缓存过滤
  - `cleanupAnnotations()` 回收标注
- `entrypoints/content/vocab-label/content-scope.ts`
  - 正文根解析、语义评分、Readability 回退、块收集
- `entrypoints/content/vocab-label/viewport.ts`
  - 可视窗口判断
- `entrypoints/content/vocab-label/frequency-filter.ts`
  - CEFR 等级查询与过滤
- `entrypoints/content/vocab-label/cefr-data.ts`
  - 构建生成的 CEFR 词表数据

### Options / Words

- `entrypoints/options/pages/VocabPage.tsx`
  - 生词标注开关、熟练度阈值、最大标注数、CEFR 水平、欧路 token、同步周期、域名白名单、LLM 参数
  - API key 和 token 不通过 GET 明文回传
- `entrypoints/options/pages/WordsManagementPage.tsx`
  - 欧路生词本列表、词表分页浏览、搜索、排序、增删词和分类管理
- `entrypoints/words/App.tsx`
  - 读取 `chrome.storage.local` 中的词库快照，不直连欧路 API

## 3. 选词策略

候选词过滤顺序：

1. 正则匹配英文词，normalize 后长度小于 3 的跳过。
2. 已在词库且 `proficiency >= masteryThreshold` 的跳过。
3. 不在词库但 CEFR 等级小于或等于用户水平的跳过。
4. 剩余候选进入释义解析。

CEFR 数据来源：

- Oxford 5000：A1-C1 核心词。
- CEFR-J Vocabulary Profile：补充词表。
- 构建脚本：`scripts/build-cefr-data.ts`

合并策略：

- 同一词不同词性取最低等级。
- Oxford 5000 优先。
- 构建结果固化到 `cefr-data.ts`，运行时不联网。

默认用户水平为 `B1`。不在 CEFR 词表中的词不会被 CEFR 过滤，会继续进入释义链路。

## 4. 释义策略

`resolvePendingGlosses` 的解析顺序：

1. 词库条目有 `exp`：直接使用本地释义。
2. 词库条目存在但无 `exp`：保留下划线标注。
3. Content Script L1 内存缓存命中：复用。
4. Background L2 `glossCache` 命中：复用。
5. 调用 LLM 批量解析。

缓存设计：

- L1：Content Script 内存 LRU，按 `wordNorm:sentenceHash` 存储。
- L2：Background `chrome.storage.local` 中的 `glossCache`，TTL 7 天。

## 5. 正文范围策略

正文根解析顺序：

1. 语义根评分：优先 `article`、`main`、`[role="main"]` 等。
2. 主内容缩窄：优先 `article.markdown-body`、`#readme`、`[data-testid="readme-content"]`、`[itemprop="articleBody"]`。
3. Readability 回退：从 clone DOM 中解析正文片段，再映射回真实 DOM。
4. 最终回退：`document.body`。

排除区域包括：

```text
header, nav, footer, aside, hidden, aria-hidden,
sr-only / visually-hidden,
comment/sidebar 相关区域
```

块收集规则：

- 优先收集 `p, li, h1, h2, h3, h4, blockquote`。
- 多 article 页面按 feed 处理，返回各 article。
- 单 article 页面返回该 article。
- 无匹配块时回退到 root。

## 6. 性能策略

可视窗口：

- 处理范围为当前视口上下各扩展 0.5 屏，总约 2 屏高度。
- 视口外标注会在后续扫描中清理。

观察与调度：

- `IntersectionObserver`：观察正文块进入/离开扩展视口。
- `MutationObserver`：处理 SPA 动态内容。
- scroll/resize：debounce 后重新协调可见块。
- `pendingBlocks` 批处理，每批限制数量，通过 `requestIdleCallback` 或 `setTimeout` 调度。

## 7. 数据契约

### `vocabConfig`

- `enabled`
- `eudicToken`
- `eudicCategoryIds`
- `masteryThreshold`
- `syncPeriodMinutes`
- `maxAnnotationsPerPage`
- `cefrLevel`
- `domainWhitelist: { enabled, domains }`

### `llmConfig`

- `provider: 'openai-compatible'`
- `baseUrl`
- `apiKey`
- `model`
- `maxTokens?`
- `systemPrompt?`

### `vocabSnapshot`

- `version`
- `updatedAt`
- `entries: Record<wordNorm, { proficiency, exp?, star? }>`

### `vocabSyncState`

- `lastSyncAt`
- `lastSyncStatus: 'ok' | 'error'`
- `lastError?`

### `glossCache`

- `Record<wordNorm:sentenceHash, { gloss, updatedAt }>`

## 8. 消息协议

配置与同步：

- `GET_VOCAB_CONFIG`
- `SET_VOCAB_CONFIG`
- `GET_LLM_CONFIG`
- `SET_LLM_CONFIG`
- `GET_VOCAB_SNAPSHOT`
- `REFRESH_VOCAB`
- `CONTEXT_GLOSS`

欧路词本管理：

- `GET_EUDIC_CATEGORIES`
- `CREATE_EUDIC_CATEGORY`
- `RENAME_EUDIC_CATEGORY`
- `DELETE_EUDIC_CATEGORY`
- `GET_EUDIC_WORDS`
- `ADD_EUDIC_WORD`
- `DELETE_EUDIC_WORDS`
- `GET_EUDIC_WORD`

## 9. 欧路接口注意事项

- Authorization token 由用户配置，GET 配置时不回传明文。
- `studylist/words` 使用 1-based 分页。
- 前端词表管理页按分类分页拉取，避免默认一次性扫描所有分类时产生过多请求。
- `WordsManagementPage` 的 UI 文案统一走 `locales/en.yaml` 的 `options.words.*` key。

## 10. 测试基线

当前单元测试覆盖：

- `entrypoints/content/vocab-label/__tests__/annotate.test.ts`
- `entrypoints/content/vocab-label/__tests__/content-scope.test.ts`
- `entrypoints/content/vocab-label/__tests__/frequency-filter.test.ts`
- `entrypoints/content/vocab-label/__tests__/viewport.test.ts`
- `entrypoints/content/vocab-label/__tests__/detect-page.test.ts`
- `types/__tests__/vocabulary.test.ts`
- `background-service/services/vocabulary/__tests__/vocabulary-config.test.ts`
- `background-service/services/llm/__tests__/openai-compatible.test.ts`
- `background-service/services/llm/__tests__/factory.test.ts`

当前验证命令：

```bash
npm test
npm run build
```

最近验证结果：

- `npm test`：15 files / 204 tests passed
- `npm run build`：通过

## 11. 已知约束

1. CEFR C2 暂无有效数据，当前效果接近 C1。
2. 未知词默认进入 LLM 释义链路，依赖用户 LLM 配置和隐私策略。
3. Readability 只用于正文识别回退，不改变实际标注 DOM 结构。
4. Feed 页面标注会更保守，优先避免误标导航、评论和侧栏。
