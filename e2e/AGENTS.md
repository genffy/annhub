# E2E 约定

> 适用于当前 `e2e/` 实现；测试目录随未来 monorepo 包结构调整。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-09。

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

## 已知问题

> 2026-10-09 复核的结果，基线提交 `cfe7c2c`：本目录 26 条用例全绿，但真实浏览器里仍能复现一批缺陷——测试本身有缺口。下面是测试侧要补的；缺陷本身登记在各目录 `AGENTS.md` 的「已知问题」，完成标准见 [roadmap.md 第 5 节](../docs/v2/roadmap.md)。
> 每条先写能复现的失败测试，再修；不要放宽断言、跳过或隔离测试来求绿（根 `AGENTS.md`）。修完在本节删除该条，历史看 git。

- **RV-TEST-01 · 把错误行为当作预期的断言**（P0，先做）。`reading-highlight.spec.ts` 的 “create, note, recolor…” 在 `library.reload()` 后 `waitFor({ state: 'detached' })`，断言刷新后阅读视图消失，与 extension.md §4.2（路由写入 URL，刷新后恢复）相反。先把它改成正确的断言（它会失败），再修 RV-LIB-01。该用例也从不测 `Esc`、← 关闭阅读视图，一并补上。
- **RV-TEST-02 · 夹具页**。新夹具放在本目录（`test-server.ts` 只服务这里），按需要拆成多个 HTML：
  - `flatdoc`：`div.content > h2 + p + h2 + p…`，标题与段落同级；`divsoup`：`div.post-content.prose` 里三段、没有 `article`/`main`；`docusaurus`：`article > div.markdown > h1, h2, p…`（RV-CAP-01）。
  - `meta-article`：带 `author`、`article:published_time`、`description` meta 的文章，另有一个 12 位作者的超长 `author` 变体（RV-CAP-03、RV-CAP-06）。
  - `editable`：`contenteditable` 区块与 `textarea`；`iframe-same`、`iframe-cross`：同源与跨源 iframe（`localhost:8173` 与 `127.0.0.1:8173` 互为跨源）；`shadow`：open shadow root 里的段落（RV-CAP-04）。
  - `links`：带 `<a href>` 与 `<button onclick>`（计数）的页面，用于截图选元素（RV-CAP-05）。
  - `content-shapes`：嵌套列表、`<br>`、含 `<br>` 的表格、行内代码含反引号、含围栏的代码块、文字里的 `*` 与行首 `#`；`chrome-classes`：RV-CAP-02 列出的必留与必删 class（RV-CAP-02）。
- **RV-TEST-03 · 真实输入，页面报错即失败**。选区、拖选、三击、`dblclick` 用真实鼠标和键盘；`reading-highlight.spec.ts` 目前程序化设置 Range 再派发合成的 `mouseup`，绕开了偏移换算里最容易错的部分（RV-LIB-09）。所有 spec 默认监听 `pageerror` 与 console error，出现即失败（RV-CAP-01 就是靠它发现的）。
- **RV-TEST-04 · 冷启动助手**。`helpers.ts` 加 `stopServiceWorker(context, page)`：`context.newCDPSession(page)`，`ServiceWorker.enable` 后发 `ServiceWorker.stopAllWorkers`（已验证可用，见 RV-BG-01）。修好之后删除 `hoverForCapsule` 的“再停留一次”重试循环。
- **RV-TEST-05 · 断言界面，不只断言数据库**。写操作之后的列表、计数、徽章要断言 DOM：`library-export.spec.ts` 的 “deleting from the drawer” 只检查库，没发现列表仍显示被删的行（RV-LIB-03）。
- **RV-TEST-06 · 真实体量的性能测试**。`learning-core/__tests__/perf.test.ts` 的夹具每条正文约 100 字符，与真实体量相差两个数量级。换成 RV-BG-04 描述的体量；另在本目录加一个浏览器内端到端的 `QUERY_ENTRIES` 计时用例（含 IndexedDB 读取与消息传递，耗时断言留足余量，只防数量级退化）。
- **RV-TEST-07 · 单测夹具**。各目录补：`entrypoints/content/__tests__/blocks.test.ts` 只用 `<section>`（加 flat、div soup、Docusaurus 式、大写 `tagName`）；`entrypoints/content/__tests__/markdown.test.ts` 不存在（RV-CAP-02）；`learning-core/__tests__/query.test.ts` 加高亮视图的时间、颜色、组序；`entrypoints/library/__tests__/markdown-view.test.ts` 加表格偏移、元素端点、`quoteForRange`；`learning-core/__tests__/export.test.ts` 加 YAML round-trip；`utils/__tests__/locale-keys.test.ts` 旁加“TSX 里没有未登记的用户可见字面量”的检查（RV-LIB-12）。
