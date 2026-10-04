# Native App 约定

> 适用于当前 `app/` 实现；不是未来 monorepo 的目标划分。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-04。

## 边界

- `Sources/AnnHubCore/` 是 TypeScript `learning-core/` 的 Swift 对应实现，并管理 SQLite；`Desktop/` 是 macOS SwiftUI 客户端。领域规则放 Core，不在 View 中重写。
- 当前导入导出和数据结构仍含早期契约。R1 的逐条本机写入、图片 BLOB、复习和页面目标分别以 [存储契约](../docs/v2/storage.md)、[Desktop PRD](../docs/v2/desktop.md) 为准；不要把目标描述当作已实现代码。
- Desktop 一级导航是今日、碎片库、系统，偏好设置走标准设置窗口（Cmd+,）。输出工坊、知识关系与 Desktop 端 LLM 已随 D-10 从 Core、SQLite、同步事件和界面移除，不要恢复；Desktop 没有需要模型的能力，也就没有模型设置。
- 配对码由 Desktop 生成并持久化，`/v1/pair` 只校验、不采纳客户端提交的值；重新生成会让旧连接失效，数据保留。
- 每日建议量、会话收尾、本周成功提取数（M-18）、提醒设置和 kind 名称等有规则的逻辑放在 Core 并带测试；`Desktop/` 的 View 只渲染它们的结果。
- 共享契约变化时同步受影响的 TypeScript、Swift、IndexedDB / SQLite 和 `Tests/AnnHubCoreTests/Fixtures/`；验证双端同一 fixture。迁移策略按最新产品结论和实际数据决定。

## 构建与测试

```bash
cd app && swift test
cd app && swift format lint --configuration .swift-format --strict --recursive Sources Tests Desktop Package.swift
cd app && xcodegen generate   # brew install xcodegen；AnnHub.xcodeproj 是生成物，不入库
cd app && xcodebuild -project AnnHub.xcodeproj -scheme AnnHubDesktop \
  -destination 'platform=macOS' build CODE_SIGNING_ALLOWED=NO
```

`project.yml` 是 XcodeGen 输入，也是 Info.plist 键（`INFOPLIST_KEY_*`，裸的 `LSUIElement` 设置不生效）、hardened runtime 和 entitlements 的唯一来源；`Support/` 放 entitlements（App Sandbox + 本机监听）和隐私清单。Core 规则或 SQLite 变化跑 Swift tests；Desktop 流程变化额外构建应用并跑相关 UI / 流程测试。

格式由 `swift format`（Swift 6.0 工具链自带）和 `.swift-format` 决定；`swift format --configuration .swift-format --recursive --in-place Sources Tests Desktop Package.swift` 一次修复。CI 的 Linux 任务用固定的 Swift 6.0.3 镜像做格式检查，避免随 Xcode 升级漂移。

发布构建需要 Developer ID 签名和公证，流程与所需 secrets 见 [发布与供应链](../docs/releasing.md)。
