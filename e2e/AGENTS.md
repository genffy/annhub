# E2E 约定

> 适用于当前 `e2e/` 实现；测试目录随未来 monorepo 包结构调整。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-08。

- Playwright specs、fixture HTML 和 helpers 放在本目录；单元测试仍与源码同级放 `__tests__/`。
- `e2e/fixtures.ts` 加载 `.output/chrome-mv3`。全局 setup 只在构建目录不存在或 `BUILD_FORCE=1` 时重建；源码变化后必须先 `npm run build`，再跑 `npx playwright test <spec>`。
- fixture 默认以中文界面启动（`uiLocale: 'zh-CN'`，靠 Playwright 的 `locale` 选项而非 `--lang`）；验证英文措辞时在 spec 里 `test.use({ uiLocale: 'en-US' })`（extension.md §2.7 的英文逐屏无汉字走查按 roadmap §5 属真机项，spec 随 R2 界面补）。本机没有 Playwright 固定版本的 Chromium 时，设 `CHROMIUM_EXECUTABLE_PATH` 指向已安装的 Chromium。
- 从测试里读写扩展存储时只用 `helpers.ts` 的 `ensureServiceWorker`：Playwright 在 service worker 的 `chrome.*` 注入完成之前就会报告该 worker，直接 `evaluate` 会随机失败。
- 触发页面侧动作走 `helpers.ts` 的 `triggerScreenshot`/`triggerBlockMode`：经 service worker 给标签页发消息，与快捷键同一条路。不要在页面里派发 `CustomEvent` 来触发；页面脚本能做的事不能被扩展当成用户的操作，`screenshot-capture.spec.ts` 的 “a synthetic keypress…” 守着这条边界。
- 断言下载用 service worker 里的 `chrome.downloads.search`：后台发起的下载不会触发 Playwright 的页面 download 事件。
- 清库用 `clearLibrary`，它保留 properties store：内置属性注册表被清掉后，service worker 不会重新播种，之后每次保存都会校验失败。
- 用 fixture 验证浏览器可观察行为和持久化结果。采集、截图、检索或消息协议变化时选择相应调用链测试；断线、重启、失败和取消属于相关流程的必要边界。
- 需要用 chrome-devtools-mcp 手工安装或重载扩展时，先读 [README.md](README.md) 的环境限制与安装步骤。不要用自动化命令误杀日常 Chrome。
- 已知问题：`test-server.ts`（Playwright 的 `webServer` 和手工跑 E2E 都会启动它）监听所有网卡，而且在 `e2e/` 里找不到文件时回落到仓库根目录。路径穿越已经挡住，没挡住的是绑定范围和静态根：跑 E2E 期间，同一局域网里的机器能读到仓库根目录下的任何文件，包括 `.env.local` 和 `.git/config`。修法很小：绑 `127.0.0.1`，只服务 `e2e/` 与明确列出的资源目录，并补 403/404 用例；动手前先 `git grep` 确认 e2e 页面不依赖仓库根资源。
