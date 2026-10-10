# Learning Core 约定

> 适用于当前 `learning-core/` 实现；不是未来 monorepo 的目标划分。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-10。

## 边界与实现点

`learning-core/` 是纯 TypeScript 领域核心，不依赖 `chrome.*`、DOM 或 React（单测跑 jsdom/fake-indexeddb）。扩展门面复用同一逻辑契约，不在调用方复制规则。

| 规则               | 文件                                                                                                                           | 契约真源                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| 条目/高亮/属性类型 | `types.ts`                                                                                                                     | [entry.md](../docs/v2/entry.md) |
| 归一化             | `normalize.ts`（NFKC→小写→引号连字符→空白→首尾标点，顺序不可换）                                                               | entry.md §6                     |
| 来源 URL 清理      | `url.ts`（令牌名清单在 `TOKEN_PARAM_NAMES`，query 与 hash 都清）                                                               | capture.md §5                   |
| 属性注册表规则     | `properties.ts`（保留名、内置定义、类型校验、tags 上限、类型预设）                                                             | entry.md §5                     |
| 校验管线与错误码   | `validate.ts`（校验；稳定错误码清单是 `types.ts` 的 `ENTRY_ERROR_CODES`，含存储类三个；`context` 包含性按 content 纯文本比较） | entry.md §6                     |
| IndexedDB 存取     | `store.ts`（`annhub` 库 v3：条目、资产、注册表，加两个派生检索 store；先校验后写入，依赖同事务提交；配额与孤儿报告）           | storage.md §3-§7                |
| 检索               | `query.ts`（词命中、权重、属性运算符、keyset 分页、高亮视图；派生文档由 `indexedSummary`/`indexedText` 构造）                  | search.md                       |
| Markdown 工具      | `markdown.ts`（纯文本化、围栏与行内代码的判定、引文换算、`==…==` 写回不跨块不破记号）                                          | storage.md §6                   |
| ZIP 导出           | `export.ts` + `zip.ts`（store-only ZIP、frontmatter 键序、README）                                                             | storage.md §6                   |
| 本地指标           | `metrics.ts`（事件字典与运行时校验、分桶、串行写入、按天累计、chrome.storage 注入）                                            | metrics.md §9                   |
| ID 与摘要          | `assets.ts`（`ent_`/`asset_` ID、SHA-256、单图上限初始值）                                                                     | storage.md §4（Q-03 校准上限）  |

## 数据不变量

- 每个写入在**一个** `readwrite` 事务里完成“读注册表 → 校验 → 写”（`store.ts`）：注册表读取、使用数统计与写入共享事务，涉及的 store 一次声明；非 IndexedDB 的异步（哈希、配额估算）先算好再开事务。条目与它新引入的属性定义、截图条目与图片资产、删除截图条目与图片、删除属性定义（含“删除未使用”，在同一事务里扫描使用数）都是如此。
- 属性：`newDefinitions` 经 `validatePropertyDefinition`；与既有定义（不区分大小写）类型不同 → `PROPERTY_TYPE_MISMATCH`，类型相同则保留最先创建的写法。条目 `properties` 的键保存时规范成注册表里的写法（`propertyStorageKey`）。`builtin` 只由 `BUILTIN_PROPERTY_DEFINITIONS` 决定，调用方传入的忽略；`author`、`published`、`description` 的 `presets`、`defaultValue` 可改，`title`、`tags` 固定。`title` 必填、不可清空；`text` 是单行；`datetime` 要求真实存在的日期与时间（D-26）。
- 高亮是 store 的四个操作 `addHighlight`、`updateHighlight`、`removeHighlight`、`restoreHighlight`，各在一个事务里读-改-写并返回最新条目；有高亮的剪藏 `content` 只读（`ENTRY_CONTENT_LOCKED`）；重叠合并只在 `store.ts` 的 `mergeHighlightInto` 一份，范围是 `content` 的 UTF-16 偏移。
- `properties` 只存值；名称与类型的唯一真源是注册表（内置五项在 `BUILTIN_PROPERTY_DEFINITIONS`，顺序决定导出键序）。
- 派生检索文档：`search`（摘要，即去掉 `content`、`context`、`note` 的条目副本）与 `searchText`（归一化的加权字段）只服务检索，永远与条目在同一事务里写入（`saveEntry`、`updateEntry`、四个高亮操作、`deleteEntry`）。`ensureIndex` 只在条目数与它们对不上、或 `version` 与 `SEARCH_INDEX_VERSION` 不同时才整体重建，不在每次 worker 冷启动时遍历条目；改了文档的形状就提高 `SEARCH_INDEX_VERSION`。列表、筛选、facets、高亮视图、属性使用数只读摘要，只有 `hasSearchTerms` 的查询才读 `searchText`。写测试要改条目时走 store（或 `UPDATE_ENTRY`）——直接写 `entries` 不会更新派生文档。
- 搜索、引文与阅读视图读的是同一份 Markdown，它们的约定必须一致：`\X` 转义还原成 `X`（词内的 `_`、`*` 字面保留），下划线一律是文字（这套 Markdown 没有下划线强调），围栏只被同样字符、不更短的围栏关闭，行内代码只被长度恰好相同的反引号串关闭，代码里的内容按字面读。围栏与行内代码的判定只在本目录 `markdown.ts` 的 `openingFence`、`closesFence`、`codeSpanAt` 里写一份，读取方共用；转换器的 `escapeText`、本目录的纯文本化与引文换算、`entrypoints/library/markdown-view.tsx` 的 `inlineRuns` 靠 `__tests__/fixtures/page-text.ts` 的共享夹具对齐（页面文本 → 转换器写的 Markdown → 读者看到的文字），改一处，三处的测试一起跑。
- 图片入库统一 PNG，字节是 Blob；dataUrl 只作消息传输格式，绝不持久化。

## 验证

- 类型、校验、存储、检索、导出、指标的改动：`npx vitest run learning-core`（含 fake-indexeddb 事务测试）。
- 契约变化时同步 `docs/v2/` 对应真源与测试断言；新增条目类型或内置属性按 [entry.md §8](../docs/v2/entry.md) 清单补齐。
