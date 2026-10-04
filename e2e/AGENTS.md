# E2E 约定

> 适用于当前 `e2e/` 实现；测试目录随未来 monorepo 包结构调整。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-04。

- Playwright specs、fixture HTML 和 helpers 放在本目录；单元测试仍与源码同级放 `__tests__/`。
- `e2e/fixtures.ts` 加载 `.output/chrome-mv3`。全局 setup 只在构建目录不存在或 `BUILD_FORCE=1` 时重建；源码变化后必须先 `npm run build`，再跑 `npx playwright test <spec>`。
- fixture 默认以中文界面启动（`uiLocale: 'zh-CN'`，靠 Playwright 的 `locale` 选项而非 `--lang`）；验证英文措辞时在 spec 里 `test.use({ uiLocale: 'en-US' })`。本机没有 Playwright 固定版本的 Chromium 时，设 `CHROMIUM_EXECUTABLE_PATH` 指向已安装的 Chromium。
- 用 fixture 验证浏览器可观察行为和持久化结果。高亮、采集、截图或消息协议变化时选择相应调用链测试；断线、重启、失败和取消属于相关流程的必要边界。
- 需要用 chrome-devtools-mcp 手工安装或重载扩展时，先读 [README.md](README.md) 的环境限制与安装步骤。不要用自动化命令误杀日常 Chrome。
