# Native App 约定

> 适用于当前 `app/` 实现；不是未来 monorepo 的目标划分。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-04。

## 边界

- `Sources/AnnHubCore/` 是 TypeScript `learning-core/` 的 Swift 对应实现，并管理 SQLite 与本地服务；`Desktop/` 是 macOS SwiftUI 客户端。领域规则放 Core，不在 View 中重写。
- 当前导入导出和数据结构仍含早期契约。R1 的逐条本机写入、图片 BLOB、复习和页面目标分别以 [存储契约](../docs/v2/storage.md)、[Desktop PRD](../docs/v2/desktop.md) 为准；不要把目标描述当作已实现代码。
- Desktop 一级导航是今日、碎片库、系统，偏好设置走标准设置窗口（Cmd+,）。输出工坊、知识关系与 Desktop 端 LLM 已随 D-10 从 Core、SQLite、同步事件和界面移除，不要恢复；Desktop 没有需要模型的能力，也就没有模型设置。
- 配对码由 Desktop 生成并持久化，`/v1/pair` 只校验、不采纳客户端提交的值；重新生成会让旧连接失效，数据保留。
- 每日建议量、会话收尾、本周成功提取数（M-18）、提醒设置、kind 名称、提示梯度各级内容、保存的视图、命令面板的检索与命令等有规则的逻辑放在 Core 并带测试；`Desktop/` 的 View 只渲染它们的结果。
- 本地服务分两层：协议规则在 `DesktopHub`（无 socket 即可测），回环 HTTP 传输在 `HubServer`（带大小与空闲限制、真实的就绪/失败状态）。传输层改动要跑 `HubServerTests` 这类真实 socket 测试，不要只测 `DesktopHub`。
- 主窗口由 `MainWindowController` 以 AppKit 管理，不用 SwiftUI `WindowGroup`：`LSUIElement` 应用不会自己创建那个窗口（正常启动会没有窗口）。窗口打开期间应用是常规应用（Dock、完整菜单栏，`⌘,` `⌘K` `⌘1…3` 是菜单项），最后一个窗口关闭后回到仅菜单栏，本地服务继续监听。
- 复习卡的提示级数和揭示状态在 `DesktopModel.card`，随会话持久化并绑定到具体卡片；不要放回视图 `@State`，否则关闭面板就能“免费重试”，评分日志会高估掌握程度。评分只能在揭示后。
- `FragmentStore` 的所有读—改—写（评分、外部评分、交付）读 `storedFragment(id:)`，不读 `getFragment(id:)`：后者含 Desktop 本机标签编辑（`fragment_local_tags`，不回写扩展），写回会把它固化进扩展拥有的采集字段。`transaction` 可重入并跨线程互斥，因为 Hub 的队列与主线程共用一个连接。
- 共享契约变化时同步受影响的 TypeScript、Swift、IndexedDB / SQLite 和 `Tests/AnnHubCoreTests/Fixtures/`；验证双端同一 fixture。迁移策略按最新产品结论和实际数据决定。

## 构建与测试

```bash
cd app && swift test                                   # Core
cd app && swift format lint --configuration .swift-format --strict --recursive Sources Tests Desktop DesktopTests Package.swift
cd app && xcodegen generate   # brew install xcodegen；AnnHub.xcodeproj 是生成物，不入库
cd app && xcodebuild -project AnnHub.xcodeproj -scheme AnnHubDesktop \
  -destination 'platform=macOS' build CODE_SIGNING_ALLOWED=NO
cd app && xcodebuild -project AnnHub.xcodeproj -scheme AnnHubDesktop \
  -destination 'platform=macOS' test CODE_SIGNING_ALLOWED=NO   # Desktop
```

`project.yml` 是 XcodeGen 输入，也是 Info.plist 键（`INFOPLIST_KEY_*`，裸的 `LSUIElement` 设置不生效）、hardened runtime 和 entitlements 的唯一来源；`Support/` 放 entitlements（App Sandbox + 本机监听）和隐私清单。Core 规则或 SQLite 变化跑 Swift tests；Desktop 流程变化额外构建应用并跑 Desktop 测试。

测试分三层：`Tests/`（SwiftPM，Core，含回环 socket）、`DesktopTests/`（Xcode，把 `Desktop/` 里除 `@main` 入口外的源码编进测试包，不启动应用，覆盖模型、命令面板、窗口、视图渲染）、[`e2e/desktop-two-end.spec.ts`](../e2e/README.md)（真实扩展对真实 Desktop 进程）。设 `TEST_RUNNER_ANNHUB_TEST_ARTIFACTS=目录` 可保留视图渲染出的 PNG。点击级 UI 自动化（XCUITest）需要给测试运行器授予“辅助功能”权限，目前没有，鼠标点击只能靠模型层测试和渲染覆盖。键盘路径（`⌘K`、↑↓、回车、Esc、`⌘1…3`、`⌘,`）由 e2e 在真实窗口里验证：往 `--annhub-diagnostics` 目录放 `keys.txt` 再发 `SIGUSR1`，应用把按键放进自己的事件队列（`NSApp.sendEvent`，不需要任何系统权限）再报告状态。

格式由 `swift format`（Swift 6.0 工具链自带）和 `.swift-format` 决定；`swift format --configuration .swift-format --recursive --in-place Sources Tests Desktop DesktopTests Package.swift` 一次修复。CI 的 Linux 任务用固定的 Swift 6.0.3 镜像做格式检查，避免随 Xcode 升级漂移。

发布构建需要 Developer ID 签名和公证，流程与所需 secrets 见 [发布与供应链](../docs/releasing.md)。

## 启动参数与隔离

应用不带参数时用自己在 Application Support 里的数据和偏好；**任何会启动真实应用进程的自动化都必须传隔离参数**，否则会读写用户自己的库（曾经因此把演示数据写进了真实的库）。参数的定义与说明见 `Sources/AnnHubCore/LaunchConfig.swift`：

| 参数                                                             | 作用                                                                                                                   |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `--annhub-data-dir=PATH`                                         | SQLite 所在目录                                                                                                        |
| `--annhub-defaults-suite=NAME`                                   | 独立的偏好域（同时不保存窗口位置）                                                                                     |
| `--annhub-port=N`                                                | 本地服务端口；`0` 取空闲端口（默认 8765）                                                                              |
| `--annhub-ready-file=PATH`                                       | 服务就绪后写入端口与配对码，供脚本读取                                                                                 |
| `--annhub-diagnostics=DIR`                                       | `SIGUSR1` 写 `state.json`（页面、计数、服务与窗口状态；先放 `keys.txt` 则先回放其中的按键），`SIGUSR2` 写 `window.png` |
| `--annhub-no-window` / `--annhub-section=` / `--annhub-palette=` | 仅菜单栏启动 / 起始页面 / 预置 `⌘K` 查询                                                                               |
| `--annhub-shot=PATH`                                             | 渲染主窗口为 PNG 后退出                                                                                                |
| `--annhub-demo-seed`                                             | 往**空库**写演示数据；没有 `--annhub-data-dir` 时会被拒绝                                                              |
| `--annhub-no-notifications`                                      | 不使用通知中心                                                                                                         |

诊断只含计数与状态，不含碎片正文和配对码；不带 `--annhub-diagnostics` 时没有任何对外出口。
