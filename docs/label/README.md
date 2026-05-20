# 生词标注模块说明

更新时间：2026-05-20

本文档描述 AnnHub 生词标注模块的当前实现基线、核心策略、架构重构方案、数据契约和测试覆盖。

## 1. 目标与范围

生词标注模块面向英文网页，在宿主 DOM 中对候选英文单词添加轻量标注，目标是“少而准”：

1. 减少常见词误标。
2. 避免扫描导航、侧栏、评论等非正文区域。
3. 只处理可视窗口附近内容，降低长页面和 SPA 场景的性能成本。
4. 在无欧路快照时仍支持 LLM-only 标注模式。
5. 在滚动、动态加载和用户反馈后保持幂等，避免重复标注、重复内容和误扫 UI 文案。

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
  - 管理标注反馈菜单：`Known` / `Skip` / `Add`
- `entrypoints/content/vocab-label/annotate.ts`
  - TreeWalker 扫描文本节点
  - 逆序 DOM 包裹，避免 offset 漂移
  - 词库熟练度、CEFR、预算和缓存过滤
  - 使用 `WeakMap` 保存句子上下文，避免把长文本写入宿主 DOM 属性
  - `cleanupAnnotations()` 回收标注
- `entrypoints/content/vocab-label/content-scope.ts`
  - 正文根解析、语义评分、Readability 回退、块收集
- `entrypoints/content/vocab-label/dom-policy.ts`
  - DOM 可扫描性判断、交互元素过滤、短 UI 文案过滤和增量 rescan 容器定位
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

## 3. 架构重构方案

本轮 annotation 架构重构把标注链路拆成五个清晰层次：

```text
Page gate
  -> Content root / platform rule
  -> Visible block scheduler
  -> Text node policy + candidate ranking
  -> DOM annotation + feedback sync
```

### 3.1 Page gate

- `index.ts` 负责一次性判断配置、白名单和英文页。
- 页面未命中时不注入样式、不启动观察器、不请求词库快照。
- 快照缺失时构造空 `VocabSnapshot`，保留 LLM-only 模式。

### 3.2 Content root 与平台规则

- 默认链路使用 `resolveContentRoot()` 从正文语义、Readability 回退和 `document.body` 中选择 root。
- `platform-rules.ts` 可覆盖 root 选择和 block 收集；X/Twitter 场景优先按推文文本块处理。
- 初始化后会在 1.2s 和 3s 做 root recheck，解决 SPA 首屏先渲染壳、正文延迟出现的问题。
- root 切换时清理旧标注和 pending 队列，避免 fallback root 上的重复内容残留。

### 3.3 可视块调度

- `IntersectionObserver` 观察正文块进入扩展视口。
- scroll/resize 触发 `scheduleViewportReconcile()`，只把当前可视窗口附近块加入 `pendingBlocks`。
- `MutationObserver` 只从新增节点或变更文本定位最近可扫描容器，不再整页重扫。
- `flushPendingBlocks()` 分批处理 pending block，每批最多 40 个，通过 `requestIdleCallback` 或短 `setTimeout` 调度。

### 3.4 DOM policy 与幂等

- `dom-policy.ts` 统一判断哪些节点不能扫描：隐藏内容、脚本/样式、表单控件、代码块、媒体、翻译禁区、已有标注等。
- 交互元素默认跳过，X quoted tweet 的正文区域作为特例允许扫描。
- 短 UI label、URL、邮箱、路径、版本号、日期、时间、颜色值、模板占位符等文本直接跳过。
- MutationObserver 遇到已有 `[data-ann-vocab]` 时忽略，避免标注 DOM 触发自身重复扫描。
- `annotate.ts` 按同一 text node 的 offset 逆序 apply，跨 text node 保持收集顺序，避免 offset 漂移导致部分词或重复内容。

### 3.5 反馈同步

- 右键标注词打开反馈菜单：
  - `Known`：将本词提升到跳过阈值，当前页同词标注立即移除。
  - `Skip`：标记为完全掌握，写入 mastered book，并从反馈目标词本移除。
  - `Add`：以 star 1 加入反馈目标词本。
- 反馈事件先写入本地 `vocabSnapshot` 和 pending 队列，再尝试同步欧路。
- `pendingStarOverlay` 覆盖当前 session 的候选过滤，防止刚反馈的词被 MutationObserver 重新标注。
- 旧事件类型 `suppress` 兼容映射为 `skip`。

## 4. 选词策略

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

## 5. 释义策略

`resolvePendingGlosses` 的解析顺序：

1. 词库条目有 `exp`：直接使用本地释义。
2. 词库条目存在但无 `exp`：保留下划线标注。
3. Content Script L1 内存缓存命中：复用。
4. Background L2 `glossCache` 命中：复用。
5. 调用 LLM 解析，单轮最多 12 个不同 `wordNorm:sentenceHash`。

缓存设计：

- L1：Content Script 内存 LRU，按 `wordNorm:sentenceHash` 存储。
- L2：Background `chrome.storage.local` 中的 `glossCache`，TTL 7 天。
- 未知词向 LLM 发送句子上下文前仍需按隐私策略继续收敛，当前为已知 TODO。

## 6. 正文范围策略

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

## 7. 性能策略

可视窗口：

- 处理范围为当前视口上下各扩展 0.5 屏，总约 2 屏高度。
- 支持 `IntersectionObserver` 时，标注按块离开扩展视口自动清理。
- 不支持 `IntersectionObserver` 时，扫描前按 marker 数量和时间间隔做降级清理。

观察与调度：

- `IntersectionObserver`：观察正文块进入/离开扩展视口。
- `MutationObserver`：处理 SPA 动态内容。
- scroll/resize：debounce 后重新协调可见块。
- `pendingBlocks` 批处理，每批限制数量，通过 `requestIdleCallback` 或 `setTimeout` 调度。
- 全页标注预算按已有 `[data-ann-vocab]` 计数扣减，避免长页面滚动后无限增长。

## 8. 数据契约

### `vocabConfig`

- `enabled`
- `eudicToken`
- `eudicCategoryIds`
- `masteryThreshold`
- `syncPeriodMinutes`
- `maxAnnotationsPerPage`
- `cefrLevel`
- `adaptiveLearningEnabled`
- `annotationAggressiveness: 'review-light' | 'balanced' | 'aggressive'`
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
- `learningCategoryId?`
- `masteredCategoryId?`
- `learningLastSyncAt?`
- `learningLastSyncStatus?`
- `learningLastError?`
- `learningPendingCount?`

### `vocabLearningPendingEvents`

- `id`
- `word`
- `star`
- `eventType?: 'seen' | 'reveal' | 'known' | 'unknown' | 'suppress' | 'skip' | 'addToVocab' | 'reset'`
- `sentence?`
- `language`
- `createdAt`
- `updatedAt`
- `attempts`
- `lastError?`

### `glossCache`

- `Record<wordNorm:sentenceHash, { gloss, updatedAt }>`

## 9. 消息协议

配置与同步：

- `GET_VOCAB_CONFIG`
- `SET_VOCAB_CONFIG`
- `GET_LLM_CONFIG`
- `SET_LLM_CONFIG`
- `GET_VOCAB_SNAPSHOT`
- `REFRESH_VOCAB`
- `CONTEXT_GLOSS`
- `GET_VOCAB_LEARNING_PROFILE`
- `GET_VOCAB_LEARNING_SYNC_STATE`
- `RECORD_VOCAB_LEARNING_EVENT`
- `FLUSH_VOCAB_LEARNING_PENDING`
- `SYNC_VOCAB_LEARNING_PROFILE`
- `ENSURE_VOCAB_LEARNING_CATEGORY`
- `SELECT_VOCAB_LEARNING_CATEGORY`
- `ENSURE_VOCAB_MASTERED_CATEGORY`
- `SELECT_VOCAB_MASTERED_CATEGORY`

欧路词本管理：

- `GET_EUDIC_CATEGORIES`
- `CREATE_EUDIC_CATEGORY`
- `RENAME_EUDIC_CATEGORY`
- `DELETE_EUDIC_CATEGORY`
- `GET_EUDIC_WORDS`
- `ADD_EUDIC_WORD`
- `DELETE_EUDIC_WORDS`
- `GET_EUDIC_WORD`

## 10. 欧路接口注意事项

- Authorization token 由用户配置，GET 配置时不回传明文。
- `studylist/words` 使用 0-based 分页，页码最小 0、最大 50，`page_size` 最大 100。
- `eudicCategoryIds` 为空表示同步全部欧路词本；非空时只同步指定词本。
- Feedback target 默认使用第一个配置词本，也可以在设置页选择或创建 `AnnHub Learning`。
- Mastered book 用于 `Skip` 事件，默认创建或复用 `AnnHub Mastered`。
- 单词加入指定词本优先使用 `POST /studylist/words`；需要更新 star 或 context 时再调用 `POST /studylist/word`。
- API wrapper 不应输出 token、请求正文或响应正文到 console，避免泄漏词库和上下文。
- 前端词表管理页按分类分页拉取，避免默认一次性扫描所有分类时产生过多请求。
- `WordsManagementPage` 的 UI 文案统一走 `locales/en.yaml` 的 `options.words.*` key。

## 11. 测试基线

当前单元测试覆盖：

- `entrypoints/content/vocab-label/__tests__/annotate.test.ts`
- `entrypoints/content/vocab-label/__tests__/content-scope.test.ts`
- `entrypoints/content/vocab-label/__tests__/frequency-filter.test.ts`
- `entrypoints/content/vocab-label/__tests__/viewport.test.ts`
- `entrypoints/content/vocab-label/__tests__/detect-page.test.ts`
- `entrypoints/content/vocab-label/__tests__/platform-rules.test.ts`
- `types/__tests__/vocabulary.test.ts`
- `background-service/services/vocabulary/__tests__/vocabulary-config.test.ts`
- `background-service/services/vocabulary/__tests__/vocabulary-learning.test.ts`
- `background-service/services/llm/__tests__/openai-compatible.test.ts`
- `background-service/services/llm/__tests__/factory.test.ts`
- `utils/__tests__/eudic-openapi.test.ts`

当前验证命令：

```bash
npm test
npm run build
```

最近验证结果：

- 以当前分支实际执行结果为准。

## 12. 已知约束

1. CEFR C2 暂无有效数据，当前效果接近 C1。
2. 未知词默认进入 LLM 释义链路，依赖用户 LLM 配置和隐私策略。
3. Readability 只用于正文识别回退，不改变实际标注 DOM 结构。
4. Feed 页面标注会更保守，优先避免误标导航、评论和侧栏。
5. X/Twitter 的 quoted tweet 允许扫描正文，但仍跳过普通链接、按钮和短 UI 文案。
