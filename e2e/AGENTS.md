# E2E 约定

> 适用于当前 `e2e/` 实现；测试目录随未来 monorepo 包结构调整。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-10。

- Playwright specs、fixture HTML 和 helpers 放在本目录；单元测试仍与源码同级放 `__tests__/`。
- `e2e/fixtures.ts` 加载 `.output/chrome-mv3`。全局 setup 只在构建目录不存在或 `BUILD_FORCE=1` 时重建；源码变化后必须先 `npm run build`，再跑 `npx playwright test <spec>`。
- fixture 默认以中文界面启动（`uiLocale: 'zh-CN'`，靠 Playwright 的 `locale` 选项而非 `--lang`）；验证英文措辞时在 spec 里 `test.use({ uiLocale: 'en-US' })`（extension.md §2.7 的英文逐屏无汉字走查按 roadmap §5 属真机项，spec 随 R2 界面补）。本机没有 Playwright 固定版本的 Chromium 时，设 `CHROMIUM_EXECUTABLE_PATH` 指向已安装的 Chromium。
- 从测试里读写扩展存储时只用 `helpers.ts` 的 `ensureServiceWorker`：Playwright 在 service worker 的 `chrome.*` 注入完成之前就会报告该 worker，直接 `evaluate` 会随机失败。
- 触发页面侧动作走 `helpers.ts` 的 `triggerScreenshot`/`triggerBlockMode`：经 service worker 给标签页的顶层框架（`frameId: 0`）发消息，与快捷键同一条路。不要在页面里派发 `CustomEvent` 来触发；页面脚本能做的事不能被扩展当成用户的操作，`screenshot-capture.spec.ts` 的 “a synthetic keypress…” 守着这条边界。
- 冷启动用 `helpers.ts` 的 `stopServiceWorker(context, page)`（CDP `ServiceWorker.stopAllWorkers`）真的停掉 worker，再断言空闲后的第一条消息立即成功（`cold-start.spec.ts`）；不要靠等待或重试掩盖冷启动。
- `page-entry.spec.ts` 守着页面入口的边界：可编辑区里不出菜单、`Enter` 只在 `Tab` 聚焦菜单项后触发、截图会话里单击链接不跳转。
- 断言下载用 service worker 里的 `chrome.downloads.search`：后台发起的下载不会触发 Playwright 的页面 download 事件。
- 清库用 `clearLibrary`，它清 entries、assets 和两个派生检索 store，保留 properties store：内置属性注册表被清掉后，service worker 不会重新播种，之后每次保存都会校验失败。
- 要让条目像用户编辑那样变化，用 `helpers.ts` 的 `updateEntry`（走 `UPDATE_ENTRY`）。直接写 IndexedDB 会绕过与条目同事务更新的派生检索文档，之后按标签、来源等筛选查询就看不到这次改动；直写只用来播种大量条目（第一次查询会按条目数发现派生文档对不上而整体重建）。
- 用 fixture 验证浏览器可观察行为和持久化结果。采集、截图、检索或消息协议变化时选择相应调用链测试；断线、重启、失败和取消属于相关流程的必要边界。写操作之后既断言库，也断言界面（列表行数、总数、导航计数、徽章）：只查库发现不了“库里改了、界面没变”（`library-browse.spec.ts` 的删除用例是范例）。
- `fixtures.ts` 有一个自动的 `pageErrors` 守卫：用例里任何页面（含扩展页面、内容脚本在页面里的浮层）抛出未捕获错误，或打印 `console.error`，该用例就失败。唯一放行的是“资源加载失败”（夹具页引用了不存在的主机，浏览器还会要 `/favicon.ico`）；新增放行项要写明理由，不要为了求绿放宽。
- 页面形状夹具在本目录：`capture.html`、`screenshot.html`、`editable.html`、`links.html`，以及复核抽样出的真实形状——`flatdoc`（标题与段落平铺）、`divsoup`（只有 div 的博客）、`docusaurus`、`meta-article`（带作者、发布时间、描述）与 `meta-article-authors`（12 位作者）、`content-shapes`（嵌套列表、`<br>`、表格、行内代码、围栏、字面标记）、`chrome-classes`（页面界面按类名）、`iframe-host`/`iframe-child`、`shadow`、`keyboard-blocks`。`page-shapes.spec.ts` 在真实浏览器里验识别与转换，`page-entry.spec.ts` 验入口的边界。
- 版式不做截图比对，用 `getBoundingClientRect` 和 `getComputedStyle` 断言几何与对比度（弹窗列表的宽度、暗色下文字对背景的对比度不低于 4.5、筛选条不溢出也不互相覆盖；设置页的标签与控件分列且等高、表格有边框与内边距、窄窗口图标栏容得下品牌且当前项的徽章可读，见 `library-layout.spec.ts`）。看页面实际长什么样时，另写一次性的截图脚本，看完删除，不提交。临时的 Playwright 配置不要放进 `test-results/`：它是默认的 `outputDir`，每次运行都会被清空（同目录里没有提交的审阅图也一起没了）。新断言先对着坏样式验一遍：把构建出的 CSS 改回出过错的样子（`.output/chrome-mv3/assets/library-*.css`），确认它红，再重建。
- 截图编辑器的像素用例（`screenshot-beautify.spec.ts`）在页面里读画布：预览画布、剪贴板里的图（`navigator.clipboard.read`）和入库的图片都用同一个 `analyze` 量角点颜色、透明像素、红色标注的外接框与墨色深浅，断言“背景是它自己的颜色”“内容完整居中”“标注落在指针处”这类结果，不做截图比对。面板、工具栏与预览的位置用 `getBoundingClientRect` 断言互不覆盖、都在窗口内；测试浏览器自己的截取永远是一个 CSS 像素一个像素（模拟 `deviceScaleFactor` 也一样），所以 Retina 要在 service worker 里把 `chrome.tabs.captureVisibleTab` 换成返回两倍大小图片的桩（`captureAtTwiceTheSize`；会话的缩放取自图片宽度除以 `innerWidth`，不取 `devicePixelRatio`），图里红绿通道随位置渐变，裁出来的任何一个像素都说明它取自窗口的哪里。选区的屏幕尺寸量 `PREVIEW` 容器，不量里面的画布：容器有 2 像素边框，画布比选区小 4 像素。文字框要用真实的鼠标与键盘（点一下、输入、`Enter`、`Esc`、点别处），Chrome 在移除有焦点的元素时同步触发 `blur`，只有真实浏览器能复现这类重入（页面抛的错会被 `pageErrors` 守卫抓到）。
- 应用页的壳、属性页和抽屉编辑各有一个 spec：`library-shell.spec.ts`（阅读视图不盖导航、焦点、折叠按钮、页面标题、图标、控件字体）、`library-properties-page.spec.ts`（属性页的行序、删除的原因、类型图标）、`library-drawer-edit.spec.ts`（原文与语境的就地编辑）。从扩展页面里播种或读数据走 `helpers.ts` 的 `sendMessage`（同一条消息路径，错误响应直接让用例失败）；量文字对比度走 `textContrast`（取元素第一个有底色的祖先作背景），亮暗两套外观各量一次。
- 大库用例用 `library-browse.spec.ts` 的 `seedRealisticLibrary`（1 万条、约 65 MB：70% 约 0.5 KB、20% 约 6 KB、10% 约 50 KB）；耗时断言留足余量，只防数量级退化（修复前，重启后的剪藏视图要 3.4 秒，预算是 2.5 秒）。
- 同一台机器上两个检出同时跑 E2E 会争用固定端口 8173：`reuseExistingServer` 会复用对方的静态服务，对方的运行一结束，这边就出现 `ERR_CONNECTION_REFUSED`。并行时错开，或先 `lsof -i :8173`；看到这个错误先单独重跑，再判断是不是代码问题。
- 需要用 chrome-devtools-mcp 手工安装或重载扩展时，先读 [README.md](README.md) 的环境限制与安装步骤。不要用自动化命令误杀日常 Chrome。
