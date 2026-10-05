# E2E 约定

> 适用于当前 `e2e/` 实现；测试目录随未来 monorepo 包结构调整。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-04。

- Playwright specs、fixture HTML 和 helpers 放在本目录；单元测试仍与源码同级放 `__tests__/`。
- `e2e/fixtures.ts` 加载 `.output/chrome-mv3`。全局 setup 只在构建目录不存在或 `BUILD_FORCE=1` 时重建；源码变化后必须先 `npm run build`，再跑 `npx playwright test <spec>`。
- fixture 默认以中文界面启动（`uiLocale: 'zh-CN'`，靠 Playwright 的 `locale` 选项而非 `--lang`）；验证英文措辞时在 spec 里 `test.use({ uiLocale: 'en-US' })`；`english-ui.spec.ts` 在英文浏览器里走完主要界面并断言没有汉字（D-15），新增界面要在那里补一条。本机没有 Playwright 固定版本的 Chromium 时，设 `CHROMIUM_EXECUTABLE_PATH` 指向已安装的 Chromium。
- 从测试里读写扩展存储时只用 `helpers.ts` 的 `ensureServiceWorker`：Playwright 在 service worker 的 `chrome.*` 注入完成之前就会报告该 worker，直接 `evaluate` 会随机失败。
- 截图用例用 `helpers.ts` 的 `triggerScreenshot`：它经 service worker 给标签页发 `TRIGGER_SCREENSHOT`，和快捷键同一条路。不要在页面里派发 `CustomEvent` 来触发；页面脚本能做的事不能被扩展当成用户的操作，`screenshot-capture.spec.ts` 的 “a page cannot start a capture…” 守着这条边界。
- 用 fixture 验证浏览器可观察行为和持久化结果。高亮、采集、截图或消息协议变化时选择相应调用链测试；断线、重启、失败和取消属于相关流程的必要边界。
- 需要用 chrome-devtools-mcp 手工安装或重载扩展时，先读 [README.md](README.md) 的环境限制与安装步骤。不要用自动化命令误杀日常 Chrome。
- 启动真实 Desktop 进程的用例用 `desktop.ts`（独立数据目录、偏好域与空闲端口，见 [README.md](README.md)）；永远不要不带隔离参数地启动应用，也不要连 `127.0.0.1:8765`——那可能是用户正在用的 Desktop。
