# Native App 约定

> 适用于当前 `app/` 实现；不是未来 monorepo 的目标划分。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-04。

## 边界

- `Sources/AnnHubCore/` 是 TypeScript `learning-core/` 的 Swift 对应实现，并管理 SQLite 与本地服务；`Desktop/` 是 macOS SwiftUI 客户端。领域规则放 Core，不在 View 中重写。
- R1 的逐条本机写入、图片 BLOB、复习和页面目标分别以 [存储契约](../docs/v2/storage.md)、[Desktop PRD](../docs/v2/desktop.md) 为准；不要把目标描述当作已实现代码。
- Desktop 一级导航是今日、碎片库、系统，偏好设置走标准设置窗口（Cmd+,）。输出工坊、知识关系与 Desktop 端 LLM 已随 D-10 从 Core、SQLite、同步事件和界面移除，不要恢复；Desktop 没有需要模型的能力，也就没有模型设置。
- 配对码由 Desktop 生成并持久化，`/v1/pair` 只校验、不采纳客户端提交的值；重新生成会让旧连接失效，数据保留。
- 本机 hub 的请求规则在 Core（`HubHTTP.swift`）：请求头 16 KB 上限、JSON 2 MiB 和图片 `MAX_IMAGE_BYTES` 的 body 上限、Host 必须是回环地址、浏览器 Origin 只放行 `chrome-extension://`、令牌，全部在读取 body 之前由请求头决定。`HubServer`（Core，`HubServer.swift`）只管字节、20 秒请求期限、并发连接数，以及监听的真实状态（就绪 / 失败 / 端口被占用）；`stop()` 等监听器真正取消、端口释放后才返回（`NWListener.cancel()` 本身是异步的），所以系统页的“重试启动”能立刻重新绑定同一个端口。改规则先改 Core 并补 `HubFramingTests`；改传输层要跑 `HubServerTests` 这类真实 socket 测试。浏览器来源只放行配置过的扩展 ID，其他扩展和网页来源一律拒绝。ID 是配置，不写在代码里：构建把它写进 Info.plist 的 `AnnHubExtensionIds`（来自环境变量或构建设置 `ANNHUB_EXTENSION_IDS`，默认值是已发布扩展的 ID，在 `Support/Info.plist`），`ExtensionAllowlist` 在启动时再并上同名环境变量和 `--annhub-allow-extension=<id>`，只增不减；一个没拿到任何 ID 的 hub 不放行任何浏览器扩展。要换发布 ID：`ANNHUB_EXTENSION_IDS=<id> xcodegen generate && xcodebuild …`。本地构建扩展要联调时，用 `ANNHUB_EXTENSION_KEY` 让构建采用商店条目的 ID（见 [发布与供应链](../docs/releasing.md)）；自动化加载未打包的扩展时，运行时加上它的 ID。
- `FragmentStore` 的一条 SQLite 连接被界面线程和 hub 的每请求线程共用。所有 public 方法持有同一把递归锁；需要“先读后写”原子的调用方（hub 的投递路径）用 `store.exclusive { }`。新增 store 方法必须先加锁，并发行为由 `ConcurrencyTests` 覆盖。`transaction` 可嵌套（同线程内后开的并入先开的），批量操作靠它组合单条操作。
- `FragmentStore` 的所有读—改—写（评分、外部评分、交付）读 `storedFragment(id:)`，不读 `getFragment(id:)`：后者含 Desktop 本机标签编辑（`fragment_local_tags`，不回写扩展），写回会把它固化进扩展拥有的采集字段。
- 每日建议量、会话收尾、本周成功提取数（M-18）、提醒设置、kind 名称、提示梯度各级内容、保存的视图、命令面板的检索与命令等有规则的逻辑放在 Core 并带测试；`Desktop/` 的 View 只渲染它们的结果。
- 界面文案只经 `UIText.swift` 的 `t(.key, [...])`（D-15）：每个 case 在同一个 switch 里同时给出中文和英文，缺译文无法编译；`{name}` 是参数，`one:` 是 `count == 1` 时的英文单数。语言由 `UILanguage.current` 决定：macOS 为本 App 选定的语言，即用户语言列表里第一个在 `Support/Info.plist` 的 `CFBundleLocalizations` 里声明过的（英文、简体中文、繁体中文；繁体也用简体中文文案，其余回落英文），系统自带控件按同一规则本地化，所以文案和控件一致；`ANNHUB_UI_LANGUAGE` 可覆盖，仅用于测试与截图。增加语言要同时改 `UIText` 和这份声明；Core 里会产生文案的函数都带 `lang:` 参数，测试显式传入。题面与提示梯度在 `ReviewSession.swift`，来源是 `learning-core/review.ts`，`fixtures/interop/review-questions.json` 保证两端一致（`WRITE_REVIEW_FIXTURE=1 npx vitest run learning-core/__tests__/interop-fixtures.test.ts` 重生成，再 `scripts/sync-interop-fixtures.sh`）。View 里不写字符串字面量，也不把显示文字当状态用（例如 hub 的失败是 `HubServer.Failure`，由界面按当前语言写成句子，状态里不存句子）。
- 主窗口由 `MainWindowController` 以 AppKit 管理，不用 SwiftUI `WindowGroup`：`LSUIElement` 应用不会自己创建那个窗口（正常启动会没有窗口）。窗口打开期间应用是常规应用（Dock、完整菜单栏，`⌘,` `⌘K` `⌘1…3` 是菜单项），最后一个窗口关闭后回到仅菜单栏，本地服务继续监听。
- 复习卡的提示级数和揭示状态在 `DesktopModel.card`，随会话持久化并绑定到具体卡片；不要放回视图 `@State`，否则关闭面板就能“免费重试”，评分日志会高估掌握程度。评分只能在揭示后。
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

应用不带参数时用自己在 Application Support 里的数据和偏好；**任何会启动真实应用进程的自动化都必须传隔离参数**，否则会读写用户自己的库。参数的定义与说明见 `Sources/AnnHubCore/LaunchConfig.swift`：

| 参数                                                             | 作用                                                                                                                    |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `--annhub-data-dir=PATH`                                         | SQLite 所在目录                                                                                                         |
| `--annhub-defaults-suite=NAME`                                   | 独立的偏好域（同时不保存窗口位置）                                                                                      |
| `--annhub-port=N`                                                | 本地服务端口；`0` 取空闲端口（默认 8765）                                                                               |
| `--annhub-ready-file=PATH`                                       | 服务就绪后写入端口与配对码，供脚本读取                                                                                  |
| `--annhub-diagnostics=DIR`                                       | `SIGUSR1` 写 `state.json`（页面、计数、服务与窗口状态；先放 `keys.txt` 则先回放其中的按键），`SIGUSR2` 写 `window.png`  |
| `--annhub-no-window` / `--annhub-section=` / `--annhub-palette=` | 仅菜单栏启动 / 起始页面 / 预置 `⌘K` 查询                                                                                |
| `--annhub-shot=PATH`                                             | 渲染主窗口为 PNG 后退出                                                                                                 |
| `--annhub-allow-extension=ID`                                    | 额外放行这个扩展 ID（可重复），与环境变量 `ANNHUB_EXTENSION_IDS` 等效；加载未打包扩展的自动化用，构建配置的 ID 始终放行 |
| `--annhub-no-notifications`                                      | 不使用通知中心                                                                                                          |

诊断只含计数与状态，不含碎片正文和配对码；不带 `--annhub-diagnostics` 时没有任何对外出口。
