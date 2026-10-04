# Learning Core 约定

> 适用于当前 `learning-core/` 实现；不是未来 monorepo 的目标划分。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-04。

## 边界与实现点

`learning-core/` 是纯 TypeScript 领域核心，不依赖 `chrome.*`、DOM、React 或 Swift。扩展门面与 Desktop 对应实现复用同一逻辑契约，不在调用方复制规则。

| 规则               | 文件                                                 |
| ------------------ | ---------------------------------------------------- |
| 类型与建档         | `types.ts`、`factory.ts`                             |
| 归一化与校验       | `normalize.ts`、`validate.ts`                        |
| 调度与复习题型     | `scheduler.ts`、`review.ts`                          |
| 检索               | `query.ts`                                           |
| 逐项交付 wire 契约 | `wire.ts`（规范 JSON + SHA-256，Swift 端逐字节镜像） |
| Markdown ZIP 导出  | `zip.ts`、`markdown-export.ts`                       |
| IndexedDB v4       | `fragment-store.ts`                                  |

当前 wire 版本为 schema v4，`types.ts` 和 `validate.ts` 是运行时真源；产品契约见 [Fragment 契约](../docs/v2/fragments.md)。`wire.ts` 的 canonicalJson 规则是扩展↔Desktop 哈希一致性的前提，改动必须同步 `app/Sources/AnnHubCore/Wire.swift` 与 `fixtures/interop/`（`WRITE_FIXTURES=1 npx vitest run learning-core/__tests__/interop-fixtures.test.ts` 重生成后 `scripts/sync-interop-fixtures.sh` 同步到 Swift）。

输出工坊与知识关系已由 D-10 移出产品范围，代码中不再有对应实体、校验、存储表和同步事件；`claim.stance` 在数据层可选，仅采集表单要求必选。

## 数据不变量

- Fragment 写入和 OutboxEvent 同事务；评分时 Fragment.review、ReviewLog 和 OutboxEvent 同事务；`visual` 创建同事务追加资产交付任务。
- 事件只在接收端确认后裁剪；被接收端拒绝的事件保留并标记 `rejection`，由用户重试或忽略。`updatedAt` 属于采集字段哈希，复习结果的应用不得修改它。
- 扩展删除是本地删除标记 + 清理待发送任务，绝不发送删除事件（[存储契约](../docs/v2/storage.md) §10）。
- 核验（`processing.verified`）必填：修改 content/excerpt/sourceUrl/kind/核验来源后必须重新确认（confirmedAt 重置）。
- 新增 Fragment kind 时同步 detail、校验、加工、复习、双端 fixture 和验收场景（清单见 [kinds.md §5](../docs/v2/kinds.md)）；不要只增加联合类型成员。
- 共享字段、调度或传输变化时同步 `app/Sources/AnnHubCore/`、JSON fixture 和双端测试。具体测试命令见根目录与 `app/AGENTS.md`。

## 验证

- 类型、校验、存储和传输改动：`npx vitest run learning-core`，加相关 Fragment E2E 与 `cd app && swift test`。
- 调度或复习改动：至少跑 scheduler / review 单测及对应 Desktop 流程测试。
