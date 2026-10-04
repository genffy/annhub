# Native App 约定

> 适用于当前 `app/` 实现；不是未来 monorepo 的目标划分。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-04。

## 边界

- `Sources/AnnHubCore/` 是 TypeScript `learning-core/` 的 Swift 对应实现，并管理 SQLite；`Desktop/` 是 macOS SwiftUI 客户端。领域规则放 Core，不在 View 中重写。
- R1 的逐条本机写入、图片 BLOB、复习和页面目标分别以 [存储契约](../docs/v2/storage.md)、[Desktop PRD](../docs/v2/desktop.md) 为准；不要把目标描述当作已实现代码。
- Desktop 一级导航是今日、碎片库、系统，偏好设置走标准设置窗口（Cmd+,）。输出工坊、知识关系与 Desktop 端 LLM 已随 D-10 从 Core、SQLite、同步事件和界面移除，不要恢复；Desktop 没有需要模型的能力，也就没有模型设置。
- 配对码由 Desktop 生成并持久化，`/v1/pair` 只校验、不采纳客户端提交的值；重新生成会让旧连接失效，数据保留。
- 本机 hub 的请求规则在 Core（`HubHTTP.swift`）：请求头 16 KB 上限、JSON 2 MiB 和图片 `MAX_IMAGE_BYTES` 的 body 上限、Host 必须是回环地址、浏览器 Origin 只放行 `chrome-extension://`、令牌，全部在读取 body 之前由请求头决定。`HubServer`（`Desktop/`）只管字节、20 秒请求期限和并发连接数。改规则先改 Core 并补 `HubFramingTests`。浏览器来源只放行已发布扩展的 ID（`DesktopHub.publishedExtensionIds`），其他扩展和网页来源一律拒绝；本地构建要联调，用 `ANNHUB_EXTENSION_KEY` 让构建采用商店条目的 ID（见 [发布与供应链](../docs/releasing.md)）。
- `FragmentStore` 的一条 SQLite 连接被界面线程和 hub 的每请求线程共用。所有 public 方法持有同一把递归锁；需要“先读后写”原子的调用方（hub 的投递路径）用 `store.exclusive { }`。新增 store 方法必须先加锁，并发行为由 `ConcurrencyTests` 覆盖。
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
