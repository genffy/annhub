# E2E 约定

> 适用范围：`e2e/`。全局规则见根目录 [AGENTS.md](../AGENTS.md)。

- Playwright specs、fixture HTML 和 helpers 放在本目录；单元测试仍与源码同级放 `__tests__/`。
- `e2e/fixtures.ts` 加载 `.output/chrome-mv3`。全局 setup 只在构建目录不存在或 `BUILD_FORCE=1` 时重建；源码变化后必须先 `npm run build`，再跑 `npx playwright test <spec>`。本地失败时 html 报告会自动在浏览器打开；agent 的 shell 不会挂在报告服务上（实测即败即退），不想弹页就加 `PLAYWRIGHT_HTML_OPEN=never`。
- fixture 默认以中文界面启动（`uiLocale: 'zh-CN'`，靠 Playwright 的 `locale` 选项而非 `--lang`）；验证英文措辞时在 spec 里 `test.use({ uiLocale: 'en-US' })`（extension.md §2.7 的英文逐屏无汉字走查是 roadmap §5 的真机项）。本机没有 Playwright 固定版本的 Chromium 时，设 `CHROMIUM_EXECUTABLE_PATH` 指向已安装的 Chromium。
- 从测试里读写扩展存储时只用 `helpers.ts` 的 `ensureServiceWorker`：Playwright 在 service worker 的 `chrome.*` 注入完成之前就会报告该 worker，直接 `evaluate` 会随机失败。
- 触发页面侧动作走 `helpers.ts` 的 `triggerScreenshot`/`triggerBlockMode`/`triggerAnnotation`：经 service worker 给标签页的顶层框架（`frameId: 0`）发消息，与快捷键同一条路。不要在页面里派发 `CustomEvent` 来触发；页面脚本能做的事不能被扩展当成用户的操作（测试：`screenshot-capture.spec.ts` 的 “a synthetic keypress…” 用例）。
- 冷启动用 `helpers.ts` 的 `stopServiceWorker(context, page)`（CDP `ServiceWorker.stopAllWorkers`）真的停掉 worker，再断言空闲后的第一条消息立即成功（`cold-start.spec.ts`）；不要靠等待或重试掩盖冷启动。
- 页面入口的边界（测试：`page-entry.spec.ts`）：可编辑区里不出菜单、`Enter` 只在 `Tab` 聚焦菜单项后触发、截图会话里单击链接不跳转。
- 要在一条笔画里复现浏览器折叠的样点移动，用 CDP 的 `Input.dispatchMouseEvent` 不等回复地连发：每次 `await page.mouse.move` 都是各自一个事件，折叠不起来。批注层与录制的用例见 `page-annotation.spec.ts`、`recording-annotation.spec.ts`。
- 滚动长图用例（`screenshot-stitch.spec.ts`）用 `longpage.html` 夹具：五屏长页带吸顶导航与懒加载图片，断言导航只在成品里出现一次、接缝不糊，`Esc` 放弃并滚回原处，成品照常可编辑、下载、入库，指标带 `frame=stitched`。
- 断言下载用 service worker 里的 `chrome.downloads.search`：后台发起的下载不会触发 Playwright 的页面 download 事件。
- 清库用 `clearLibrary`，它清 entries、assets 和两个派生检索 store，保留 properties store：内置属性注册表被清掉后，service worker 不会重新播种，之后每次保存都会校验失败。
- 要让条目像用户编辑那样变化，用 `helpers.ts` 的 `updateEntry`（走 `UPDATE_ENTRY`）。直接写 IndexedDB 会绕过与条目同事务更新的派生检索文档，之后按标签、来源等筛选查询就看不到这次改动；直写只用来播种大量条目（第一次查询会按条目数发现派生文档对不上而整体重建）。
- 用 fixture 验证浏览器可观察行为和持久化结果。
- 采集、截图、检索或消息协议变化时选择相应调用链测试；
- 断线、重启、失败和取消属于相关流程的必要边界。
- 写操作之后既断言库，也断言界面（列表的卡片数、总数、导航计数、徽章）：只查库发现不了“库里改了、界面没变”（`library-browse.spec.ts` 的删除用例是范例）。
- 下一步操作之前等的也是界面，不是库：service worker 先提交、再回复，页面收到回复才画出标记、清掉选区、关掉工具条。
- 库里刚有、回复未到时按 `Esc`，关掉的是还开着的工具条而不是阅读视图；
- 这时双击下一处，新的选区和工具条会被迟到的回复清掉（测试：`reading-highlight.spec.ts`）。
- `fixtures.ts` 有一个自动的 `pageErrors` 守卫：用例里任何页面（含扩展页面、内容脚本在页面里的浮层）抛出未捕获错误，或打印 `console.error`，该用例就失败。唯一放行的是“资源加载失败”（夹具页引用了不存在的主机，浏览器还会要 `/favicon.ico`）；新增放行项要写明理由，不要为了求绿放宽。
- 专项夹具：`keyboard-blocks`
- `timeline.html`（X 式时间线：帖子列紧挨侧栏，Parent 停在帖子、离开与 Esc 收起描边，胶囊的左右缘留在帖子内）
- `media`（视频帖与滚到第二张的多图轮播：`screenshot-media.spec.ts` 读预览画布像素，断言当前视频帧与当前幻灯在元素截图里）
- `columns`（三栏页：内栏自滚、窗口 scrollY 为 0 时，划词菜单仍贴内栏的选区）
- `longpage.html`（滚动长图的五屏长页）
- `virtualfeed.html`（回收单元格的虚拟时间线，同一个结构路径在不同滚动高度是另一条帖子；测试：`screenshot-frame.spec.ts` 的“沿用上次取景框时页面不动”）。`page-shapes.spec.ts` 在真实浏览器里验识别与转换。

## 按需读取

| 主题                         | 文件                                                   |
| ---------------------------- | ------------------------------------------------------ |
| 版式与像素断言（不截屏比对） | [notes/pixel-and-layout.md](notes/pixel-and-layout.md) |

- 从扩展页面里播种或读数据走 `helpers.ts` 的 `sendMessage`（同一条消息路径，错误响应直接让用例失败）；量文字对比度走 `textContrast`（取元素第一个有底色的祖先作背景），亮暗两套外观各量一次。应用页的壳、属性页与抽屉编辑的用例见 `library-shell.spec.ts`、`library-properties-page.spec.ts`、`library-drawer-edit.spec.ts`。
- 大库用例用 `library-browse.spec.ts` 的 `seedRealisticLibrary`（1 万条、约 65 MB：70% 约 0.5 KB、20% 约 6 KB、10% 约 50 KB）；耗时断言留足余量，只防数量级退化（重启后每个视图的就绪预算见根目录「验证入口」与 `background-service/AGENTS.md`）。
- 同一台机器上两个检出同时跑 E2E 会争用固定端口 8173：`reuseExistingServer` 会复用对方的静态服务，对方的运行一结束，这边就出现 `ERR_CONNECTION_REFUSED`。并行时错开，或先 `lsof -i :8173`；看到这个错误先单独重跑，再判断是不是代码问题。
- 需要用 chrome-devtools-mcp 手工安装或重载扩展时，用所在 agent 自己配置的 chrome-devtools-mcp（仓库不带共享 MCP 配置），没有配置就提醒用户安装；先读 [README.md](README.md) 的环境限制与安装步骤。不要用自动化命令误杀日常 Chrome。
- [real-chrome-scenarios.md](real-chrome-scenarios.md) 是自动化够不着的真机场景，不写执行工具。它的附录 A 按当前实现取元素（`[data-ann-ui]` 的名称、资料库的类名、界面文案），这些改名时同步它。
