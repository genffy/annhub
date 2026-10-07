# Learning Core 约定

> 适用于当前 `learning-core/` 实现；不是未来 monorepo 的目标划分。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-07。

## 边界与实现点

`learning-core/` 是纯 TypeScript 领域核心，不依赖 `chrome.*`、DOM 或 React。扩展门面复用同一逻辑契约，不在调用方复制规则。

| 规则              | 文件                                      |
| ----------------- | ----------------------------------------- |
| 类型与建档        | `types.ts`、`factory.ts`                  |
| 归一化与校验      | `normalize.ts`、`validate.ts`             |
| 检索              | `query.ts`                                |
| 图片资产工具      | `assets.ts`（单图上限、资产 ID、SHA-256） |
| Markdown ZIP 导出 | `zip.ts`、`markdown-export.ts`            |
| IndexedDB         | `fragment-store.ts`                       |

当前代码仍是 Fragment schema v4 的旧实现，`types.ts` 和 `validate.ts` 是它的运行时真源；D-18 之后的目标契约见 [条目数据契约](../docs/v2/entry.md)，按路线图 R1 迁移到 `Entry` 与属性注册表。桌面客户端、复习调度与跨端交付（D-17）、输出工坊与知识关系（D-10）不在产品范围内，代码中不再有对应的实体、存储表或同步事件；`claim.stance` 在数据层可选，仅采集表单要求必选。

## 数据不变量

- Fragment 写入前先校验；`visual` 创建时引用的图片资产必须已存在，并与 Fragment 同一事务检查和写入。
- 核验（`processing.verified`）必填：修改 content/excerpt/sourceUrl/kind/核验来源后必须重新确认（confirmedAt 重置）。
- 删除截图记录时，图片资产只在没有任何截图或 Fragment 引用时才随之删除。
- 旧的 Fragment 实现不再新增 kind；新增条目类型或内置属性按 [entry.md §8](../docs/v2/entry.md) 的清单，不要只增加联合类型成员。

## 验证

- 类型、校验和存储改动：`npx vitest run learning-core`，加相关 Fragment E2E。
