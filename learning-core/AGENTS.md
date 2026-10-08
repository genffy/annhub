# Learning Core 约定

> 适用于当前 `learning-core/` 实现；不是未来 monorepo 的目标划分。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-08。

## 边界与实现点

`learning-core/` 是纯 TypeScript 领域核心，不依赖 `chrome.*`、DOM 或 React（单测跑 jsdom/fake-indexeddb）。扩展门面复用同一逻辑契约，不在调用方复制规则。

| 规则               | 文件                                                                    | 契约真源                        |
| ------------------ | ----------------------------------------------------------------------- | ------------------------------- |
| 条目/高亮/属性类型 | `types.ts`                                                              | [entry.md](../docs/v2/entry.md) |
| 归一化             | `normalize.ts`（NFKC→小写→引号连字符→空白→首尾标点，顺序不可换）        | entry.md §6                     |
| 来源 URL 清理      | `url.ts`（令牌名清单在 `TOKEN_PARAM_NAMES`，query 与 hash 都清）        | capture.md §5                   |
| 属性注册表规则     | `properties.ts`（保留名、内置定义、类型校验、tags 上限、类型预设）      | entry.md §5                     |
| 校验管线与错误码   | `validate.ts`（12 个稳定错误码；`context` 包含性按 content 纯文本比较） | entry.md §6                     |
| IndexedDB 存取     | `store.ts`（`annhub` 库；先校验后写入，依赖同事务提交；配额与孤儿报告） | storage.md §3-§7                |
| 检索               | `query.ts`（词命中、权重、属性运算符、keyset 分页、高亮视图）           | search.md                       |
| Markdown 工具      | `markdown.ts`（纯文本化、块切分、`==…==` 写回不跨块不破记号）           | storage.md §6                   |
| ZIP 导出           | `export.ts` + `zip.ts`（store-only ZIP、frontmatter 键序、README）      | storage.md §6                   |
| 本地指标           | `metrics.ts`（事件字典、分桶、按天累计、chrome.storage 注入）           | metrics.md §9                   |
| ID 与摘要          | `assets.ts`（`ent_`/`asset_` ID、SHA-256、单图上限初始值）              | storage.md §4（Q-03 校准上限）  |

## 数据不变量

- 写入前先 `validateEntry`；条目与它新引入的属性定义、截图条目与图片资产、删除截图条目与图片，都在同一 IndexedDB 事务里提交。
- 有高亮的剪藏 `content` 只读（`ENTRY_CONTENT_LOCKED`）；高亮重叠合并走 `mergeHighlight`，范围是 `content` 的 UTF-16 偏移。
- `properties` 只存值；名称与类型的唯一真源是注册表（内置五项在 `BUILTIN_PROPERTY_DEFINITIONS`，顺序决定导出键序）。
- 图片入库统一 PNG，字节是 Blob；dataUrl 只作消息传输格式，绝不持久化。

## 验证

- 类型、校验、存储、检索、导出、指标的改动：`npx vitest run learning-core`（含 fake-indexeddb 事务测试）。
- 契约变化时同步 `docs/v2/` 对应真源与测试断言；新增条目类型或内置属性按 [entry.md §8](../docs/v2/entry.md) 清单补齐。
