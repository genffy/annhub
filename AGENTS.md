# AGENTS.md — 项目架构与开发约定

> 面向 AI Agent 和开发者的项目上下文文档。描述 AnnHub 的架构设计、核心模块、数据模型和开发约定。

---

## 一、项目定位

AnnHub 是一个浏览器扩展（Chrome MV3），核心能力是在任意网页上进行 **文本采集**、**高亮标注** 和 **英文生词标注**，支持两种交互模式，并集成了欧路词库同步与 LLM 释义。

---

## 二、交互模式

| 模式 | 触发方式 | 行为 | 高亮色 |
|------|---------|------|--------|
| Mode A（精准模式） | 选中文本后自动弹出 HoverMenu | 用户点击操作项：采集、备注、进入荧光笔 | `#ffeb3b`（标准黄） |
| Mode B（扫射模式） | `Alt+H` / `Cmd+Shift+H` / 点击浏览器图标 | 选中即自动采集，右上角 Capsule 显示计数，Esc 退出 | `#FFF8B4`（浅黄） |

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
│   │   ├── highlight/
│   │   │   ├── highlight-dom.ts    # DOM 操作：创建/移除高亮、selector 生成、sourceUrl 提取
│   │   │   ├── service.ts          # 高亮业务逻辑：创建、恢复（含重试）、删除
│   │   │   └── __tests__/          # Vitest 单元测试
│   │   └── vocab-label/            # 英文生词标注（操作宿主 DOM）
│   │       ├── index.ts            # 入口：配置检查、快照获取、MutationObserver
│   │       ├── detect-page.ts      # 英文页检测 + 域名白名单
│   │       ├── annotate.ts         # TreeWalker + 两阶段逆序标注
│   │       ├── styles.ts           # 宿主样式注入/移除
│   │       └── __tests__/          # Vitest 单元测试
│   ├── background/
│   │   └── index.ts                # Service Worker 入口，快捷键/图标点击监听
│   ├── options/                    # 设置页
│   │   ├── App.tsx                 # 路由：Highlights / Words / Settings
│   │   └── pages/VocabPage.tsx     # Vocab + LLM + Eudic + 白名单配置
│   ├── words/                      # 词表浏览页
│   │   └── App.tsx                 # 从 chrome.storage.local 读快照，支持搜索/排序
│   ├── popup/                      # 弹出窗口
│   └── sidepanel/                  # 侧边栏
├── background-service/
│   ├── index.ts                    # BackgroundServiceManager
│   ├── service-context.ts          # 服务状态上下文（registeredServices 模式）
│   ├── service-manager.ts          # ServiceManager（含 forceReinitialize restart）
│   ├── __tests__/                  # ServiceManager 单元测试
│   └── services/
│       ├── config/                 # ConfigService
│       ├── highlight/
│       │   ├── highlight-storage.ts    # IndexedDB 存储（含跨页 sourceUrl 查询）
│       │   ├── message-handles.ts      # 消息处理器
│       │   └── __tests__/              # Vitest 单元测试
│       ├── clip.ts                     # Clip 后台服务（chrome.storage.local）
│       ├── logseq/                     # Logseq 同步服务
│       ├── vocabulary/                 # VocabularyService
│       │   ├── index.ts                # 欧路同步 + chrome.alarms + resolveGloss
│       │   ├── message-handles.ts      # vocab/llm 消息处理器（含权限校验）
│       │   └── __tests__/              # 配置 merge 回归测试
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
│   └── messages.ts                 # 消息协议类型（含 vocab/llm 消息）
├── utils/
│   ├── eudic-openapi.ts            # 欧路 API 封装（fetchCategories, fetchAllWords）
│   ├── message/index.ts            # 消息发送/创建工具
│   └── logger.ts                   # 日志工具
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
    url: string                     // 创建时的页面 URL
    domain: string
    selector: string                // CSS selector（用于恢复时定位）
    originalText: string
    textHash: string
    color: string
    timestamp: number
    lastModified: number
    position: { x: number; y: number; width: number; height: number }
    context: { before: string; after: string }
    status: 'active' | 'archived' | 'deleted'
    user_note?: string              // 用户备注
    metadata: {
        pageTitle: string
        pageUrl: string
        sourceUrl?: string          // 详情页永久链接（列表页采集时提取）
    }
}
```

### ClipRecord

```typescript
interface ClipRecord {
    id: string                      // "clip_xxx"
    source_url: string              // 采集时页面 URL
    source_title: string
    capture_time: string            // ISO 8601
    mode_used: 'Mode A' | 'Mode B'
    content: string
    context_before: string
    context_after: string
    user_note?: string
    source_detail_url?: string      // 详情页链接
}
```

---

## 五、关键架构设计

### 5.1 站点规则体系（Site Permalink Rules）

`highlight-dom.ts` 中维护一个 `SITE_PERMALINK_RULES` 数组，用于在列表/Feed 页面提取内容项的详情永久链接：

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

| 模式 | 正则 | 示例 |
|------|------|------|
| x.com | `^id__[a-z0-9]+$` | `id__3ipr8wqpubk` |
| React | `^:r[a-z0-9]*:$` | `:r0:`, `:r1a:` |
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

- **检测**：`detect-page.ts` 通过 `document.documentElement.lang` + 拉丁字母占比判定英文页
- **标注流程**：TreeWalker 扫描文本节点 → 正则匹配英文单词 → 跳过常见词/已掌握词 → 本地释义(exp)或 LLM 释义 → 逆序包裹 `<ruby>` 或 `<span>` 避免 offset 漂移
- **幂等标记**：`data-ann-vocab="1"`，提供 `cleanupAnnotations()` 可回收
- **增量**：`MutationObserver + debounce(1000ms)` 处理 SPA 动态内容
- **LLM-only 模式**：无欧路 snapshot 时 fallback 空快照，仍可通过 LLM 标注
- **TODO（隐私策略）**：细化“哪些内容可发送到 LLM”的策略，避免默认把所有候选上下文外发

### 5.6 LLM 抽象

`background-service/services/llm/` 提供与厂商无关的 LLM 接口：

- `ILlmClient`：`completeChat(input) → string`，可选 `glossBatch`
- `OpenAICompatibleLlmService`：智能 endpoint 拼接（`/vN` 已有则不补 `/v1`）；支持 GLM、DeepSeek、OpenAI 等
- `createLlmClient(config)`：工厂函数，当前仅 `openai-compatible` 分支
- 配置 merge：`getLlmConfig()` 采用非空值优先策略，空字符串不覆盖已存储值

### 5.7 消息协议

Content Script 与 Background Service Worker 通过 `chrome.runtime.sendMessage` 通信：

| 消息类型 | 方向 | 说明 |
|---------|------|------|
| `SAVE_HIGHLIGHT` | content → background | 保存高亮记录到 IndexedDB |
| `GET_CURRENT_PAGE_HIGHLIGHTS` | content → background | 获取当前页面高亮（含 sourceUrl 匹配） |
| `SAVE_CLIP` | content → background | 保存采集记录到 chrome.storage.local |
| `TOGGLE_HIGHLIGHTER_MODE` | background → content | 切换荧光笔模式 |
| `LOCATE_HIGHLIGHT` | UI → background | 定位并导航到高亮所在页面 |
| `GET_VOCAB_CONFIG` / `SET_VOCAB_CONFIG` | UI → background | 读写生词标注配置（GET 为脱敏返回，不回传 token 明文） |
| `GET_LLM_CONFIG` / `SET_LLM_CONFIG` | UI → background | 读写 LLM 配置（apiKey 不回传前端） |
| `GET_VOCAB_SNAPSHOT` | content → background | 获取词库快照 |
| `REFRESH_VOCAB` | UI → background | 触发欧路词库同步 |
| `CONTEXT_GLOSS` | content → background | 请求单词上下文释义（exp → cache → LLM） |

### 5.8 快捷键

| 快捷键 | 平台 | 功能 |
|--------|------|------|
| `Alt+H` | Windows/Linux | 切换荧光笔模式 |
| `Cmd+Shift+H` | macOS | 切换荧光笔模式 |
| `Esc` | 全平台 | 退出 Mode B / 关闭备注输入 |
| `Enter` | 全平台 | 提交备注 |

---

## 六、测试

### 单元测试（Vitest + jsdom）

```bash
npm test            # 单次运行
npm run test:watch  # 监听模式
```

测试文件与源码同目录，放在 `__tests__/` 下：

| 文件 | 覆盖范围 |
|------|---------|
| `highlight/__tests__/highlight-dom.test.ts` | isDynamicId、generateSelector、正则、extractTwitterPermalink |
| `highlight/__tests__/highlight-storage.test.ts` | getCurrentPageHighlights 的 sourceUrl 匹配和去重 |
| `types/__tests__/vocabulary.test.ts` | normalizeWord 边界用例 |
| `services/llm/__tests__/openai-compatible.test.ts` | endpoint 拼接、请求格式、错误处理、glossBatch |
| `services/llm/__tests__/factory.test.ts` | 工厂分支 |
| `services/vocabulary/__tests__/vocabulary-config.test.ts` | getLlmConfig/setLlmConfig 配置 merge 策略 |
| `content/vocab-label/__tests__/annotate.test.ts` | 逆序 DOM 标注、exp 直接使用、阈值过滤、maxAnnotations |
| `background-service/__tests__/service-manager.test.ts` | restart cleanup + forceReinitialize、initOrder |

### E2E 测试（Playwright）

```bash
npx playwright test
```

所有 E2E 相关文件（spec、fixture HTML、helpers）集中在 `e2e/` 目录：

| 文件 | 覆盖范围 |
|------|---------|
| `mode-a.spec.ts` | Mode A 悬浮菜单交互 |
| `mode-b.spec.ts` | Mode B 静默采集 |
| `mode-switch.spec.ts` | 模式切换 |
| `data-persistence.spec.ts` | 高亮数据持久化 |
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
9. **生词标注**：操作宿主 DOM（非 Shadow Root），标记 `data-ann-vocab="1"`，支持 `cleanupAnnotations()` 回收
10. **LLM 配置**：`getLlmConfig()` 采用非空值优先 merge，空字符串和 `undefined` 不覆盖已有存储值
