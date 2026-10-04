# 浏览器验证说明

自动化 E2E 使用 Playwright 自带的 Chromium 与预构建扩展：

```bash
npm run build
npx playwright test e2e/screenshot-capture.spec.ts
```

`e2e/global-setup.ts` 在 `.output/chrome-mv3` 已存在时不会自动重建。源码有变化时，必须先手动构建。fixture 服务器由 Playwright 配置启动，不需要为自动化测试另开服务。

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

把最后输出的真实路径传给 `install_extension`。实测 content script 注入时，页面应有带 `shadowRoot` 的 `ann-selection`；触发 Mode A 后检查 shadowRoot 中的选区操作按钮。只操作该 MCP 的独立 profile，终止进程时须精确匹配其 `--user-data-dir`，不要影响日常 Chrome。
