# AGENTS.md — 项目架构与开发约定

> 面向 AI Agent 和开发者的项目上下文文档。描述 AnnHub 的架构设计、核心模块、数据模型和开发约定。

---

## 一、项目定位

AnnHub 是一个浏览器扩展（Chrome MV3），核心能力是在任意网页上进行 **文本采集**、**高亮标注** 和 **英文生词标注**，支持两种交互模式，并集成了欧路词库同步与 LLM 释义。

---

## 二、交互模式

| 模式               | 触发方式                                 | 行为                                              | 高亮色              |
| ------------------ | ---------------------------------------- | ------------------------------------------------- | ------------------- |
| Mode A（精准模式） | 选中文本后自动弹出 HoverMenu             | 用户点击操作项：采集、备注、进入荧光笔            | `#ffeb3b`（标准黄） |
| Mode B（扫射模式） | `Alt+H` / `Cmd+Shift+H` / 点击浏览器图标 | 选中即自动采集，右上角 Capsule 显示计数，Esc 退出 | `#FFF8B4`（浅黄）   |

---

## 三、目录结构

```
annhub/
├── entrypoints/
│   ├── content/                    # Content Script
│   │   ├── index.tsx               # 主入口，Mode A/B 编排 + vocab-label 动态加载
│   │   ├── HoverMenu.tsx           # Mode A 悬浮菜单
│   │   ├── HighlighterCapsule.tsx  # Mode B 状态胶囊
│   │   ├── mode-manager.ts         # 全局模式单例（非 React 依赖）
│   │   ├── clip-service.ts         # 前端 Clip 采集服务
│   │   ├── content.css             # Shadow DOM 动画 keyframes
│   │   ├── annotation-core/        # 高亮与生词共享的标注底座（见 §5.9）
│   │   │   ├── types.ts            # AnnotationIntent / ContentSource / AnnotationPlatformRule
│   │   │   ├── platform-rules.ts   # 站点规则中心（X/Twitter permalink 识别）
│   │   │   ├── dom-policy.ts       # DOM 跳过/可标注判定（按 intent 区分）
│   │   │   ├── text-range.ts       # 文本节点收集 + Range 定位/匹配
│   │   │   ├── lemmatize.ts         # 轻量词形还原（屈折→词元，仅用于查表）
│   │   │   ├── markers.ts          # 通用 wrap/unwrap/cleanup（span/ruby）
│   │   │   └── __tests__/          # Vitest 单元测试
│   │   ├── highlight/
│   │   │   ├── highlight-dom.ts    # HighlightDOMManager；sourceUrl 委托 annotation-core
│   │   │   ├── service.ts          # 高亮业务逻辑：创建、恢复（含重试）、删除
│   │   │   └── __tests__/          # Vitest 单元测试
│   │   └── vocab-label/            # 英文生词标注（操作宿主 DOM）
│   │       ├── index.ts            # 入口：配置/快照/profile + 混合观察器（见 §5.5）
│   │       ├── detect-page.ts      # 英文页检测 + 域名白名单
│   │       ├── content-scope.ts    # 内容根解析 + 可标注块收集（排除 nav/aside 等）
│   │       ├── platform-rules.ts   # annotation-core 平台规则的 vocab 适配层
│   │       ├── dom-policy.ts       # annotation-core/dom-policy 的兼容 re-export
│   │       ├── cefr-data.ts        # 自动生成的 CEFR 分级词表（Oxford 5000 + CEFR-J，遗留次级信号）
│   │       ├── frequency-band-data.ts # 自动生成的通用语料词频带（OpenSubtitles 50k，band 1..7）
│   │       ├── frequency-filter.ts # 难度门：按词频带过滤；表外长尾词默认不标
│   │       ├── viewport.ts         # 视口窗口判定（±50% 视口）
│   │       ├── annotate.ts         # TreeWalker + 两阶段逆序标注
│   │       ├── styles.ts           # 宿主样式注入/移除
│   │       └── __tests__/          # Vitest 单元测试
│   ├── background/
│   │   └── index.ts                # Service Worker 入口
│   ├── options/                    # 设置页
│   │   ├── App.tsx                 # 路由：Highlights / Words / Settings
│   │   └── pages/VocabPage.tsx     # Vocab + LLM + Eudic + 白名单配置
│   ├── words/                      # 词表浏览页
│   │   └── App.tsx                 # 从 chrome.storage.local 读快照，支持搜索/排序
│   ├── popup/                      # 弹出窗口
│   └── sidepanel/                  # 侧边栏
├── background-service/
│   ├── index.ts                    # BackgroundServiceManager（注册服务 + 事件监听）
│   ├── service-context.ts          # 服务状态上下文（registeredServices 模式）
│   ├── service-manager.ts          # ServiceManager（含 forceReinitialize restart）
│   ├── event-handlers/             # 浏览器事件监听（见 §5.10）
│   │   ├── index.ts                # EventHandlerManager 单例
│   │   ├── command-handler.ts      # 快捷键命令（截图触发）
│   │   ├── installation-handler.ts # onInstalled 安装/升级
│   │   └── runtime-handler.ts      # onMessage PING / onStartup
│   ├── __tests__/                  # ServiceManager 单元测试
│   └── services/
│       ├── config/                 # ConfigService
│       ├── highlight/
│       │   ├── highlight-storage.ts    # IndexedDB 存储（含跨页 sourceUrl 查询）
│       │   ├── message-handles.ts      # 消息处理器
│       │   └── __tests__/              # Vitest 单元测试
│       ├── clip.ts                     # Clip 后台服务（chrome.storage.local）
│       ├── logseq/                     # Logseq 同步服务（client/formatter/sync）
│       ├── vocabulary/                 # VocabularyService
│       │   ├── index.ts                # 欧路同步 + 生词学习 + chrome.alarms + resolveGloss
│       │   ├── message-handles.ts      # vocab/llm/learning 消息处理器（含权限校验）
│       │   └── __tests__/              # 配置 merge + learning 回归测试
│       └── llm/                        # LLM 抽象层
│           ├── types.ts                # ILlmClient, ChatInput
│           ├── openai-compatible.ts    # OpenAICompatibleLlmService
│           ├── factory.ts              # createLlmClient
│           └── __tests__/              # endpoint/请求格式测试
├── components/ui/
│   └── highlight-list/             # 高亮列表 UI（SidePanel）
├── types/
│   ├── vocabulary.ts               # VocabConfig, LlmConfig, VocabSnapshot, GlossResult
│   ├── highlight.ts                # HighlightRecord, HighlightQuery 等
│   ├── clip.ts                     # ClipRecord
│   ├── action.ts                   # HoverMenuAction
│   ├── dom.ts                      # DOM 相关共享类型
│   ├── logseq.ts                   # Logseq 配置/同步类型
│   └── messages.ts                 # 消息协议类型（含 vocab/llm/learning/screenshot）
├── utils/
│   ├── eudic-openapi.ts            # 欧路 API 封装（fetchCategories, fetchAllWords）
│   ├── llm-provider-presets.ts     # LLM 厂商预设
│   ├── helpers/                    # 通用辅助函数
│   ├── message/index.ts            # 消息发送/创建工具
│   └── logger.ts                   # 日志工具
├── constants.ts                    # ANN_SELECTION_KEY 等常量
├── e2e/                            # Playwright E2E 测试
│   ├── fixtures.ts                 # 自定义 fixture（扩展加载）
│   ├── helpers.ts                  # 辅助函数（service worker 交互、导航）
│   ├── test-server.ts              # 本地 HTTP fixture 服务器
│   ├── test.html                   # 主测试页面
│   ├── test-detail.html            # 详情页测试页面
│   └── *.spec.ts                   # 测试用例
├── vitest.config.ts                # 单元测试配置
├── playwright.config.ts            # E2E 测试配置
└── wxt.config.ts                   # WXT 构建配置
```

---

## 四、核心数据模型

### HighlightRecord

```typescript
interface HighlightRecord {
  id: string
  url: string // 创建时的页面 URL
  domain: string
  selector: string // CSS selector（用于恢复时定位）
  originalText: string
  textHash: string
  color: string
  timestamp: number
  lastModified: number
  position: { x: number; y: number; width: number; height: number }
  context: { before: string; after: string }
  status: 'active' | 'archived' | 'deleted'
  user_note?: string // 用户备注
  metadata: {
    pageTitle: string
    pageUrl: string
    sourceUrl?: string // 详情页永久链接（列表页采集时提取）
  }
}
```

### ClipRecord

```typescript
interface ClipRecord {
  id: string // "clip_xxx"
  source_url: string // 采集时页面 URL
  source_title: string
  capture_time: string // ISO 8601
  mode_used: 'Mode A' | 'Mode B'
  content: string
  context_before: string
  context_after: string
  user_note?: string
  source_detail_url?: string // 详情页链接
}
```

---

## 五、关键架构设计

### 5.1 站点规则体系（Site Permalink Rules）

> 站点规则现已统一收敛到 `annotation-core/platform-rules.ts`（见 §5.9）。`highlight-dom.ts` 的 `findSourceUrl/findSourceContainer` 通过 `getActiveAnnotationPlatformRule` 委托到 core，并 re-export `extractTwitterPermalink` 等工具以兼容旧导入路径。下文描述其设计思路。

平台规则用于在列表/Feed 页面提取内容项的详情永久链接：

```
findSourceUrl(range)
  ├─ 匹配 SITE_PERMALINK_RULES → containerSelector → extractPermalink
  └─ 无匹配 → findGenericContainer → extractGenericPermalink（路径深度启发式）
```

扩展新站点只需追加一条规则：

```typescript
{
    name: 'hackernews',
    match: (url) => url.hostname === 'news.ycombinator.com',
    containerSelector: 'tr.athing',
    extractPermalink: (container, origin) => { /* ... */ },
}
```

当前已支持：`x.com` / `twitter.com`。

### 5.2 动态 ID 检测

`generateSelector` 生成 CSS selector 时，通过 `isDynamicId` 跳过不稳定的 ID，优先使用 `data-testid`：

| 模式         | 正则              | 示例               |
| ------------ | ----------------- | ------------------ |
| x.com        | `^id__[a-z0-9]+$` | `id__3ipr8wqpubk`  |
| React        | `^:r[a-z0-9]*:$`  | `:r0:`, `:r1a:`    |
| 随机十六进制 | `^[a-f0-9]{16,}$` | `a1b2c3d4e5f67890` |

### 5.3 跨页高亮回显

`getCurrentPageHighlights(url)` 同时查询：

1. `url` 精确匹配（当前页面创建的高亮）
2. 同域名下 `metadata.sourceUrl === url`（其他页面创建但指向当前页面的高亮）

合并去重后返回，使列表页创建的高亮在对应详情页也能回显。

### 5.4 高亮恢复重试

SPA 页面内容可能延迟渲染，`restorePageHighlights` 采用递增延迟重试：

```
第 1 轮：立即同步尝试
第 2 轮：1000ms 后重试未恢复的
第 3 轮：2000ms 后重试
第 4 轮：3000ms 后重试
```

`findTextRangeSync` 在 selector 匹配失败时自动 fallback 到 `document.body` 全文搜索。

### 5.5 生词标注（Vocab Label）

`entrypoints/content/vocab-label/` 在宿主 DOM（非 Shadow Root）中完成英文生词标注：

- **检测**：`detect-page.ts` 通过 `document.documentElement.lang` + 拉丁字母占比（> 0.7）判定英文页；`shouldAnnotateDomain` 做域名白名单匹配（支持 `*` 通配）
- **内容范围**：`content-scope.ts` 综合 Readability、语义选择器（`main/article/[role=main]`）和内容密度评分解析内容根，`collectAnnotatableBlocks` 收集块并排除 header/nav/footer/sidebar/comment
- **难度门（精准选词）**：核心信号是 `frequency-band-data.ts` 内嵌的通用语料词频带（OpenSubtitles 50k，band 1=最高频…7=最低频），`frequency-filter.ts` 的 `shouldFilterByLevel` 据此判定——
  - 词频带 ≤ 用户 CEFR 对应阈值（高频/简单）→ 过滤（不标）；
  - **不在词频表的长尾词**（专有名词 / 领域术语 / 拼写噪声）→ **默认过滤（不标）**，这是与旧逻辑相反的关键默认值；
  - 仅在表内且带位高于阈值的真·中低频词才进入候选。`cefr-data.ts` 的 CEFR 小表保留为遗留次级信号（`shouldFilterByCEFRLevel`）。
- **词形还原**：查表前先用 `annotation-core/lemmatize.ts` 的 `pickLemma` 把屈折形态（running→run、studied→study、mice→mouse）归一到词元，再查欧路快照与词频表；DOM Range 仍用原始 token 的 offset，词元只用于查表。
- **专有名词过滤**：`isLikelyProperNounCandidate` 在大小写启发式（ACRONYM / camelCase / 句中大写）基础上，对句首 Title-case 词额外用词频信号判别——其词元不在词频表则判为专名跳过，修掉旧逻辑句首专名逃逸的问题。
- **标注流程**：TreeWalker 扫描文本节点 → 正则匹配英文单词 → 词形还原查表 → 难度门/专名过滤 → 本地释义(exp)或 LLM 释义 → 逆序包裹 `<ruby>` 或 `<span>` 避免 offset 漂移（底层用 `annotation-core/markers.ts`）
- **混合观察器**（`index.ts`）：不再是单一 MutationObserver，而是三者协同——
  1. `IntersectionObserver`（rootMargin 50%）：滚动时把进入视口的块入队
  2. `MutationObserver`（childList/characterData，250ms 防抖）：处理 SPA 动态内容
  3. scroll/resize 视口监听（180ms 防抖）：`reconcileVisibleBlocks` 重新收集
     入队块经 `scheduleFlush`（idle callback，约 40 块/批）批量标注，仅标注视口窗口内的块
- **学习反馈**：右键标注弹出 `known/skip/addToVocab` 菜单，发送 `RECORD_VOCAB_LEARNING_EVENT`（见 §5.11）
- **幂等标记**：`data-ann-vocab="1"`，提供 `destroyVocabLabel()` 可回收
- **LLM-only 模式**：无欧路 snapshot 时 fallback 空快照，仍可通过 LLM 标注
- **TODO（隐私策略）**：细化"哪些内容可发送到 LLM"的策略，避免默认把所有候选上下文外发

### 5.6 LLM 抽象

`background-service/services/llm/` 提供与厂商无关的 LLM 接口：

- `ILlmClient`：`completeChat(input) → string`，可选 `glossBatch`
- `OpenAICompatibleLlmService`：智能 endpoint 拼接（`/vN` 已有则不补 `/v1`）；支持 GLM、DeepSeek、OpenAI 等
- `createLlmClient(config)`：工厂函数，当前仅 `openai-compatible` 分支
- 配置 merge：`getLlmConfig()` 采用非空值优先策略，空字符串不覆盖已存储值

### 5.7 消息协议

Content Script / UI 与 Background Service Worker 通过 `chrome.runtime.sendMessage` 通信，所有类型定义在 `types/messages.ts`。写类消息（配置/学习/Eudic 写入）要求 `isExtensionPageSender`（扩展页上下文）校验。

**高亮 / 采集**

| 消息类型                                                                 | 方向                    | 说明                                |
| ------------------------------------------------------------------------ | ----------------------- | ----------------------------------- |
| `SAVE_HIGHLIGHT` / `UPDATE_HIGHLIGHT` / `DELETE_HIGHLIGHT`               | content/UI → background | 高亮记录增改删（IndexedDB）         |
| `GET_HIGHLIGHTS` / `GET_CURRENT_PAGE_HIGHLIGHTS` / `GET_HIGHLIGHT_STATS` | content/UI → background | 查询高亮（含 sourceUrl 匹配）与统计 |
| `CLEAR_ALL_HIGHLIGHTS` / `LOCATE_HIGHLIGHT`                              | UI → background         | 清空 / 定位并导航到高亮所在页面     |
| `SAVE_CLIP`                                                              | content → background    | 保存采集记录到 chrome.storage.local |

**生词标注 / 配置**

| 消息类型                                | 方向                    | 说明                                   |
| --------------------------------------- | ----------------------- | -------------------------------------- |
| `GET_VOCAB_CONFIG` / `SET_VOCAB_CONFIG` | UI → background         | 读写生词配置（GET 脱敏，不回传 token） |
| `GET_VOCAB_SNAPSHOT` / `REFRESH_VOCAB`  | content/UI → background | 获取词库快照 / 触发欧路同步            |
| `CONTEXT_GLOSS`                         | content → background    | 单词上下文释义（exp → cache → LLM）    |

**生词学习（见 §5.11）**

| 消息类型                                                            | 说明                          |
| ------------------------------------------------------------------- | ----------------------------- |
| `ENSURE_VOCAB_LEARNING_CATEGORY` / `SELECT_VOCAB_LEARNING_CATEGORY` | 确保/选择 learning 类别       |
| `ENSURE_VOCAB_MASTERED_CATEGORY` / `SELECT_VOCAB_MASTERED_CATEGORY` | 确保/选择 mastered 类别       |
| `RECORD_VOCAB_LEARNING_EVENT` / `FLUSH_VOCAB_LEARNING_PENDING`      | 记录学习事件 / 刷新待同步队列 |
| `GET_VOCAB_LEARNING_PROFILE` / `GET_VOCAB_LEARNING_SYNC_STATE`      | 读取学习档案 / 同步状态       |
| `SYNC_VOCAB_LEARNING_PROFILE` / `RESET_VOCAB_WORD_LEARNING`         | 同步 learning 类别 / 重置单词 |

**Eudic / LLM**

| 消息类型                                                                                             | 说明                           |
| ---------------------------------------------------------------------------------------------------- | ------------------------------ |
| `GET_EUDIC_CATEGORIES` / `CREATE_EUDIC_CATEGORY` / `RENAME_EUDIC_CATEGORY` / `DELETE_EUDIC_CATEGORY` | 欧路类别 CRUD                  |
| `GET_EUDIC_WORDS` / `GET_EUDIC_WORD` / `ADD_EUDIC_WORD` / `DELETE_EUDIC_WORDS`                       | 欧路词条 CRUD                  |
| `GET_LLM_CONFIG` / `SET_LLM_CONFIG`                                                                  | 读写 LLM 配置（apiKey 不回传） |
| `FETCH_LLM_MODELS` / `TEST_LLM_CONNECTION`                                                           | 拉取模型列表 / 连接测试        |

**Logseq / 截图 / 系统**

| 消息类型                                                                                  | 说明                                 |
| ----------------------------------------------------------------------------------------- | ------------------------------------ |
| `LOGSEQ_GET_CONFIG` / `LOGSEQ_SET_CONFIG` / `LOGSEQ_TEST_CONNECTION`                      | Logseq 配置与连接测试                |
| `LOGSEQ_SYNC_ALL` / `LOGSEQ_SYNC_HIGHLIGHT` / `LOGSEQ_SYNC_CLIP`                          | Logseq 同步                          |
| `TRIGGER_SCREENSHOT` / `CAPTURE_VISIBLE_TAB` / `SCREENSHOT_CAPTURED` / `SCREENSHOT_ERROR` | 截图采集（见 §5.12，链路未完全实现） |
| `TOGGLE_HIGHLIGHTER_MODE`                                                                 | background → content：切换荧光笔模式 |
| `PING` / `GET_STATUS` / `GET_VERSION` / `INITIALIZE`                                      | 健康检查与状态                       |
| `GET_STORAGE` / `SET_STORAGE` / `CLEAR_STORAGE`                                           | 通用存储读写                         |

### 5.8 快捷键

| 快捷键                         | 平台              | 功能                                          |
| ------------------------------ | ----------------- | --------------------------------------------- |
| `Alt+H`                        | Windows/Linux     | 切换荧光笔模式                                |
| `Cmd+Shift+H`                  | macOS             | 切换荧光笔模式                                |
| `Ctrl+Shift+S` / `Cmd+Shift+S` | Win·Linux / macOS | 截图采集触发（`ANN_SELECTION_KEY`，见 §5.12） |
| `Esc`                          | 全平台            | 退出 Mode B / 关闭备注输入                    |
| `Enter`                        | 全平台            | 提交备注                                      |

> 快捷键命令在 `wxt.config.ts` 的 `manifest.commands` 注册，由 `event-handlers/command-handler.ts` 监听 `browser.commands.onCommand` 派发。

### 5.9 Content Annotation Core（共享标注底座）

`entrypoints/content/annotation-core/` 是高亮与生词标注共享的"页面理解 + DOM 安全工具"层，各业务保留自己的决策：

- `types.ts`：共享类型契约。`AnnotationIntent`（`'manual-highlight' | 'auto-vocab'`）、`ContentSource`、`AnnotationPlatformRule`（`match/resolveRoot/collectContentBlocks/findSourceFromElement/findContainerBySourceUrl`）
- `platform-rules.ts`：站点规则中心，实现 X/Twitter 推文识别。`getActiveAnnotationPlatformRule(url)`、`extractTwitterPermalink`、`findTwitterPermalinkContainer`、`findTwitterContainerByPermalink`、`TWEET_STATUS_RE/_PREFIX_RE`
- `dom-policy.ts`：按 `AnnotationIntent` 决定节点可否标注。`shouldSkipElement/shouldSkipTextNode/isAnnotatableTextNode`、`findNearestRescanContainer/findNearestAnnotatableBlock`、`isWithin(Vocab|Annotation)Marker`、`isShortUiLabel/isSkippableText`、`clearDomPolicyCaches`。同时识别 `data-ann-vocab` 与 `data-highlight-id`，防止重复包裹
- `text-range.ts`：文本/Range 工具。`collectTextNodes`、`findBestTextMatch`、`findTextRangeInElement`、`createRangeFromTextIndex`，支持归一化匹配与上下文回退
- `markers.ts`：通用包裹/拆除。`wrapRange`（`surroundContents` 失败回退 `extractContents + insertNode`）、`unwrapMarker`（特殊处理 ruby/rt/rp）、`cleanupMarkers`

兼容关系：`highlight/highlight-dom.ts` 是独立 `HighlightDOMManager`，仅 re-export core 的 Twitter 工具并委托 `findSourceUrl`；`vocab-label/platform-rules.ts` 是把 core 规则适配成基于 hostname 接口的适配层；`vocab-label/dom-policy.ts` 是纯 re-export 兼容层。

### 5.10 后台事件监听（Event Handlers）

`background-service/event-handlers/` 把浏览器事件监听从服务逻辑中拆分出来，由 `EventHandlerManager` 单例统一 `registerEventListeners/removeEventListeners`，并装配全局 `onConnect`/`error`/`unhandledrejection` 兜底：

- `command-handler.ts`：监听 `browser.commands.onCommand`，处理截图快捷键（见 §5.12）
- `installation-handler.ts`：监听 `runtime.onInstalled`，按 reason 路由首装/升级（含 `migrateFromV1ToV2` 占位），失败时 `ServiceContext.markInitializationFailed`
- `runtime-handler.ts`：监听 `runtime.onMessage` 的 `PING` 健康检查（合并 `getDetailedStatus()`）与 `runtime.onStartup`

`BackgroundServiceManager.initialize()` 顺序：`registerServices` → `eventHandlerManager.registerEventListeners()` → `serviceManager.initializeServices()`；`cleanup()` 反向解绑。

### 5.11 生词学习（Vocab Learning）

`VocabularyService` 在词库同步之外维护一套学习状态，基于欧路类别落地：

- **类别**：`ensureLearningCategory/selectLearningCategory` 与 `ensureMasteredCategory/selectMasteredCategory`，默认名 `AnnHub Learning` / `AnnHub Mastered`，id 持久化为 `vocabLearningCategoryId` / `vocabMasteredCategoryId`
- **事件队列**：`recordLearningEvent` 计算 `targetStar`（known/skip→5，addToVocab/reset→1），立即更新本地 snapshot，push 到 `vocabLearningPendingEvents`，再 `flushLearningPendingEvents()` 调欧路 API；`skip` 会写入 mastered 类别并从 learning 类别删除
- **同步**：`syncFromEudic`（全量，mastered 记为 star=5）、`syncLearningProfileFromEudic`（仅 learning 类别 + 叠加 pending）、`getLearningProfile(words?)` 返回 `{ stars, pendingCount }`

### 5.12 截图采集（Screenshot Capture）

`Ctrl+Shift+S`（`ANN_SELECTION_KEY = 'capture-selection'`）→ `command-handler.ts` 向活动 tab 发 `TRIGGER_SCREENSHOT`，失败回退到 `scripting.executeScript` 派发 `CustomEvent('ann-screenshot-trigger')`。

> **现状**：`TRIGGER_SCREENSHOT` / `CAPTURE_VISIBLE_TAB` / `SCREENSHOT_CAPTURED` / `SCREENSHOT_ERROR` 目前仅有类型定义，content 与 background 侧均无运行时接收方——选区采集与 `tabs.captureVisibleTab` 尚未实现。属于在建功能。

---

## 六、测试

### 单元测试（Vitest + jsdom）

```bash
npm test            # 单次运行
npm run test:watch  # 监听模式
```

测试文件与源码同目录，放在 `__tests__/` 下：

| 文件                                                               | 覆盖范围                                                                                                 |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `annotation-core/__tests__/platform-rules.test.ts`                 | 平台规则匹配、Twitter permalink 提取                                                                     |
| `annotation-core/__tests__/dom-policy.test.ts`                     | 按 intent 的跳过/可标注判定、marker 识别                                                                 |
| `annotation-core/__tests__/text-range.test.ts`                     | 文本节点收集、Range 定位与归一化匹配                                                                     |
| `annotation-core/__tests__/markers.test.ts`                        | wrap/unwrap/cleanup（含 ruby 特殊处理）                                                                  |
| `annotation-core/__tests__/lemmatize.test.ts`                      | 词形还原候选、pickLemma 词典消歧、不规则词                                                               |
| `highlight/__tests__/highlight-dom.test.ts`                        | isDynamicId、generateSelector、selector 稳定性                                                           |
| `highlight/__tests__/wrap-integration.test.ts`                     | wrapRange 接入、unwrapMarker 防 tooltip 泄漏、manual-highlight policy 跳过 contenteditable / 嵌套 marker |
| `vocab-label/__tests__/annotate.test.ts`                           | 逆序 DOM 标注、exp 直接使用、阈值过滤、maxAnnotations                                                    |
| `vocab-label/__tests__/detect-page.test.ts`                        | 英文页检测、域名白名单                                                                                   |
| `vocab-label/__tests__/content-scope.test.ts`                      | 内容根解析、可标注块收集、区块排除                                                                       |
| `vocab-label/__tests__/frequency-filter.test.ts`                   | 词频带难度门、长尾词默认不标、CEFR 遗留信号                                                              |
| `vocab-label/__tests__/viewport.test.ts`                           | 视口窗口判定                                                                                             |
| `vocab-label/__tests__/platform-rules.test.ts`                     | vocab 平台适配层                                                                                         |
| `background-service/__tests__/service-manager.test.ts`             | restart cleanup + forceReinitialize、initOrder                                                           |
| `services/highlight/__tests__/highlight-storage.test.ts`           | getCurrentPageHighlights 的 sourceUrl 匹配和去重                                                         |
| `services/llm/__tests__/openai-compatible.test.ts`                 | endpoint 拼接、请求格式、错误处理、glossBatch                                                            |
| `services/llm/__tests__/factory.test.ts`                           | 工厂分支                                                                                                 |
| `services/logseq/__tests__/logseq-{client,formatter,sync}.test.ts` | Logseq 客户端、格式化、同步                                                                              |
| `services/vocabulary/__tests__/vocabulary-config.test.ts`          | getLlmConfig/setLlmConfig 配置 merge 策略                                                                |
| `services/vocabulary/__tests__/vocabulary-learning.test.ts`        | 学习事件 targetStar、pending 队列、类别落地                                                              |
| `types/__tests__/vocabulary.test.ts`                               | normalizeWord 边界用例                                                                                   |
| `utils/__tests__/eudic-openapi.test.ts`                            | 欧路 API 封装                                                                                            |

### E2E 测试（Playwright）

```bash
npx playwright test
```

所有 E2E 相关文件（spec、fixture HTML、helpers）集中在 `e2e/` 目录：

| 文件                          | 覆盖范围                        |
| ----------------------------- | ------------------------------- |
| `mode-a.spec.ts`              | Mode A 悬浮菜单交互             |
| `mode-b.spec.ts`              | Mode B 静默采集                 |
| `mode-switch.spec.ts`         | 模式切换                        |
| `data-persistence.spec.ts`    | 高亮数据持久化                  |
| `highlight-sourceurl.spec.ts` | selector 稳定性、sourceUrl 提取 |

### 测试输出（已 gitignore）

- `test-results/` — Playwright 测试结果
- `playwright-report/` — Playwright HTML 报告
- `coverage/` — Vitest 覆盖率报告

---

## 七、开发约定

1. **单例模式**：`HighlightService`、`ClipService`、`ModeManager`、`VocabularyService` 等均为单例，通过 `getInstance()` 获取
2. **消息类型**：所有消息在 `types/messages.ts` 中定义类型，`UIToBackgroundMessage` 联合类型保证类型安全
3. **站点规则**：新增站点适配时在 `SITE_PERMALINK_RULES` 追加，不修改核心逻辑
4. **selector 生成**：优先 `data-testid` → 稳定 ID → 过滤后的 class；跳过动态 ID 和含特殊字符的 Tailwind 类名
5. **测试文件组织**：单元测试放 `__tests__/` 与源码同级，E2E 测试及 fixture 统一放 `e2e/`
6. **测试 fixture 服务**：`e2e/test-server.ts` 优先从 `e2e/` 查找文件，fallback 到项目根目录
7. **服务初始化**：`ServiceContext` 采用 `registeredServices` 集合判定就绪，只统计已注册服务
8. **服务重启**：`restartServices()` 先调用各 service 的 `cleanup()`，再以 `forceReinitialize` 模式重新初始化
9. **生词标注**：操作宿主 DOM（非 Shadow Root），标记 `data-ann-vocab="1"`，支持 `destroyVocabLabel()` 回收
10. **LLM 配置**：`getLlmConfig()` 采用非空值优先 merge，空字符串和 `undefined` 不覆盖已有存储值
11. **共享标注逻辑**：高亮/生词共用的页面理解与 DOM 工具放 `annotation-core/`，业务侧只保留各自决策；旧路径以 re-export/适配层兼容
12. **文档同步（强制）**：每次完成任务后，必须同步更新受影响的文档（`AGENTS.md`、`CLAUDE.md`、`docs/`、`README.md`），保持代码与文档一致。新增/删除模块、改动消息协议、调整快捷键或测试结构时，对应章节须一并更新；任务未同步文档不算完成
