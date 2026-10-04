# Native App 约定

> 适用于当前 `app/` 实现；不是未来 monorepo 的目标划分。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-04。

## 边界

- `Sources/AnnHubCore/` 是 TypeScript `learning-core/` 的 Swift 对应实现，并管理 SQLite；`Desktop/` 是 macOS SwiftUI 客户端。领域规则放 Core，不在 View 中重写。
- 当前导入导出和数据结构仍含早期契约。R1 的逐条本机写入、图片 BLOB、复习和页面目标分别以 [存储契约](../docs/v2/storage.md)、[Desktop PRD](../docs/v2/desktop.md) 为准；不要把目标描述当作已实现代码。
- Desktop 一级导航的目标是今日、碎片库、系统。输出工坊与知识关系已由 D-10 移出产品范围，残留的页面、表和导航项按 [roadmap.md §5](../docs/v2/roadmap.md) 移除，不要在其上新增能力。
- 共享契约变化时同步受影响的 TypeScript、Swift、IndexedDB / SQLite 和 `Tests/AnnHubCoreTests/Fixtures/`；验证双端同一 fixture。迁移策略按最新产品结论和实际数据决定。

## 构建与测试

```bash
cd app && swift test
cd app && xcodegen generate
cd app && xcodebuild -project AnnHub.xcodeproj -scheme AnnHubDesktop \
  -destination 'platform=macOS' build CODE_SIGNING_ALLOWED=NO
```

`project.yml` 是 XcodeGen 输入。Core 规则或 SQLite 变化跑 Swift tests；Desktop 流程变化额外构建应用并跑相关 UI / 流程测试。
