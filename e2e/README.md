# 浏览器验证说明

自动化 E2E 使用 Playwright 自带的 Chromium 与预构建扩展：

```bash
npm run build
npx playwright test e2e/screenshot-capture.spec.ts
```

`e2e/store-assets.spec.ts` 默认跳过，只在 `npm run store:assets` 时截取商店素材（见 [发布与供应链](../docs/releasing.md)）。

`e2e/global-setup.ts` 在 `.output/chrome-mv3` 已存在时不会自动重建。源码有变化时，必须先手动构建。fixture 服务器由 Playwright 配置启动，不需要为自动化测试另开服务。

## 扩展与 Desktop 的两端连测

`e2e/desktop-two-end.spec.ts` 让构建出的扩展（真实 Chromium）与真实运行的 macOS Desktop 进程通过回环地址交付碎片和图片，再读 Desktop 自己的 SQLite 核对结果。只在 macOS 上运行；找不到 Desktop 构建时整组跳过。先构建两端：

```bash
npm run build
cd app && xcodegen generate && xcodebuild -project AnnHub.xcodeproj -scheme AnnHubDesktop \
  -destination 'platform=macOS' -derivedDataPath .build/xcode build CODE_SIGNING_ALLOWED=NO
cd .. && npx playwright test e2e/desktop-two-end.spec.ts
```

`ANNHUB_DESKTOP_APP` 指向别处的 `AnnHubDesktop.app`。`e2e/desktop.ts` 以独立的数据目录、偏好域和空闲端口启动应用（`--annhub-data-dir` / `--annhub-defaults-suite` / `--annhub-port=0`），用 `SIGUSR1` 取状态快照；不会读写用户自己的 Desktop 数据，新增用到应用进程的用例必须同样隔离。Desktop 里的点击（评分、删除）无头环境做不到，用例用直接改它的数据库来代替，并在注释里写明。

Desktop 的本机服务只放行已发布扩展的 ID；fixture 加载的未打包扩展 ID 不同，所以和扩展交互的用例要用 `RunningDesktop.start({ extensionIds: [extensionId] })`（对应启动参数 `--annhub-allow-extension`）。不传就是在验证“其他扩展被拒绝（403）”。

Desktop 的界面随系统语言（D-15）。`e2e/desktop.ts` 用 `ANNHUB_UI_LANGUAGE` 把它固定为中文（`language: 'en'` 换成英文），所以敲进命令面板的词不依赖运行这台 Mac 的语言。

## chrome-devtools-mcp 手工实测

以下是 2026-09-23 在本机自动化 Chrome 上观察到的环境限制，版本或 MCP 配置改变后先验证现状。共享配置 `.agents/mcp.json` 定义了 `chrome-devtools-annhub`，使用独立 profile `~/.cache/chrome-devtools-mcp/chrome-profile`（`.zcode/` 只放本机私有状态，已被忽略）。官网实测前启动 `cd website && npm run dev`，默认端口 3001。

1. 当时的 Chrome 137+ 忽略启动参数 `--load-extension`。MCP 服务首次启动可通过 CDP `Extensions.loadUnpacked` 兜底；自动化 Chrome 重启后可能需要重新安装扩展，先用 `list_extensions` 核实。
2. `install_extension` 在客户端未协商 roots 时只允许 `os.tmpdir()` 下的路径。macOS 的真实临时目录通常是 `$TMPDIR`，不能假定字面 `/tmp` 可用；传给工具的必须是已经展开的绝对路径。
3. 重建 `.output` 不会刷新已加载的 unpacked 扩展。每次重建后复制一份新构建并重新安装，避免 Service Worker 与 content script 来自不同构建。

示例：

```bash
npm run build
ANNHUB_TEST_DIR="$(mktemp -d "$TMPDIR/annhub-ext.XXXXXX")"
cp -R .output/chrome-mv3 "$ANNHUB_TEST_DIR/chrome-mv3"
printf '%s\n' "$ANNHUB_TEST_DIR/chrome-mv3"
```

把最后输出的真实路径传给 `install_extension`。实测 content script 注入时，页面应有带 `shadowRoot` 的 `ann-selection`；选中文本后检查 shadowRoot 中的选区菜单按钮。只操作该 MCP 的独立 profile，终止进程时须精确匹配其 `--user-data-dir`，不要影响日常 Chrome。
