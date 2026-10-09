# Content Script 约定

> 适用于当前 `entrypoints/content/` 实现；不是未来 monorepo 的目标划分。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-09。

## 职责与入口

- 页面里只有两种采集：剪藏（选区/区块）与截图。`index.tsx` 编排选区菜单、区块入口、区块模式和截图会话；高亮不在页面里（资料库读剪藏时才做，R2）。
- `selection-menu.ts` 是两项菜单（剪藏、截图，顺序固定）：无最短长度、全空白选区不出现，键盘 `Tab`/`Enter` 可操作，悬停/聚焦约 300ms 显示后果提示（extension.md §2.1）。
- `clip-flow.ts` 一次点击保存 + 约 3 秒「已剪藏 · 撤销 · 编辑」提示 + 快速编辑气泡；失败保留选区与已输入内容并给重试（extension.md §3）。
- `markdown.ts` 是唯一的 DOM→Markdown 转换（链接、标题层级、列表、代码块、表格、强调；页面界面与隐藏内容剔除；100k 块边界截断），选区与区块共用，不各自实现。
- `page-meta.ts`：语境提取（句/段、上限、包含选区）、页面 meta（author/published/description/title）与永久链接（X 帖子 status 链接、一节标题锚点、其余页面地址）。
- `blocks.ts` 七种区块识别，只在指针停留后沿祖先链（含 open shadow root）运行，不整页扫描；`block-hover.ts` 悬停胶囊（右上角跨边缘、角点被占依次避让、高块贴窗口可见上沿）与键盘区块模式（`Tab`/`↑↓`/`Enter`/`S`/`Esc`，链接不响应点击）。
- 浮层样式全部挂在 `[data-ann-ui]`/`.ann-*` 命名空间下，经 manifest 注入（不使用 shadow root），不改宿主页面的 DOM。

## 输入信任与站点规则

- 会话在页面 DOM 里，页面脚本能派发任何事件：一切会走到特权 API（截取、跨域代取、保存）的入口只认 `user-input.ts` 的 `isUserInput`（`event.isTrusted`）或扩展自己的消息（`TRIGGER_SCREENSHOT`/`TRIGGER_BLOCK_MODE`）。jsdom 的事件都不可信，单测 mock `isUserInput`。
- 新站点的永久链接规则集中维护（X 帖子在 `page-meta.ts` 的 `resolvePermalink`，Medium 文章规则待补），不要在业务模块散写 hostname 分支。
- 页面常在 `document` 上监听单键快捷键：扩展自己的输入框（快速编辑、截图文字标注）要把键盘事件留在自己界面里（`stopPropagation`）。
- 同源 iframe 与 open shadow root 里的选区和区块必须可用；跨源 iframe、可编辑区、受限页不出现入口也不报错（capture.md §3）。

## 截图

- 区域截图从视口 CSS 坐标按 dpr 裁剪，调用 `captureVisibleTab` 前隐藏扩展 UI 等两帧；元素截图经离屏克隆栅格化，跨域图片由 background 代取内联（`FETCH_IMAGE`）。
- 拖拽松开后选区进入待确认态（`Enter` 确认、`Esc` 取消），单击元素路径不变；吸附、八向手柄、方向键微调、`Shift` 临时锁比、层级 `↑↓` 与元素+边距的几何换算都是 `screenshot/selection.ts` 的纯函数，会话只做接线（screenshot.md §1.2、§1.4）。
- 上次取景框按标签页 + 路径存 `sessionStorage`（`pagehide` 清除），元素锚点带 10% 容差；找不到元素时滚回记录位置沿用，取景框超窗只提示不强截。
- 区域截取前用透明 sweeper 清扫悬停样式并等 `pageStable`（连续两帧布局不变，最长 500ms），元素 + 边距能放进视口时走区域截取，放不下提示而不是截不全。
- 选区内本地标注与马赛克只把处理后的 PNG 交后台入库；确认/复制/下载三个去处互相独立，复制与下载保留会话；`http:` 页面复制提示下载（screenshot.md §4）。
- 匿名默认值来自设置（`GET_SETTINGS`），会话内 `A` 切换；`Esc` 在文字输入期间先关输入框。

## 验证

- 改转换、识别、菜单或胶囊：跑 `npx vitest run`（相关单测）并构建后跑对应 E2E（`e2e/selection-clip.spec.ts`、`e2e/block-clip.spec.ts`、`e2e/screenshot-capture.spec.ts`）。
- 改截图链路先跑 `entrypoints/content/screenshot/__tests__`；改选区确认、吸附、手柄、层级或取景框记忆后跑 `e2e/r3-frame.spec.ts`（改源码必须 `rm -rf .output/chrome-mv3 && npm run build` 再测，`.output` 不随源码变化重建）。

## 已知问题

> 2026-10-09 在真实 Chromium（Playwright 加载构建产物）里对照 `docs/v2` 复核的结果，基线提交 `cfe7c2c`。「实测」是已复现的，「读码」是读代码得出的，先写测试确认。
> 优先级：P0 主流程不可用或数据写错；P1 与契约不符但有绕行；P2 清理与质量。完成标准与处理顺序见 [roadmap.md 第 3、5 节](../../docs/v2/roadmap.md)，需要拍板的点见 [validation.md 第 5 节](../../docs/v2/validation.md)（每条有默认，不阻塞）。
> 每条先写能复现的失败测试，再修；不要放宽断言、跳过或隔离测试来求绿（根 `AGENTS.md`）。修完在本节删除该条，历史看 git。

- **RV-CAP-01 · 区块识别在常见页面结构上抛 `TypeError`**（P0）。契约：capture.md §6.2；US-CAP-14。
  - 现象（实测）：`blocks.ts` 的 `hasHeadingBetween` 用 `/h(\d)/.exec(heading.tagName)![1]`，而 `tagName` 是大写 `H2`，`exec` 返回 `null`，随即抛出 `Cannot read properties of null (reading '1')`。宿主页面控制台出现未捕获错误，胶囊永远不出现。凡是某个祖先的直接子节点里有 `h1`–`h4`、且它自己不是 `<section>`/`<article>` 的页面都命中，例如 `article > div.markdown > h2 + p`（文档站最常见的结构）和 `div.content > h2 + p`。单测夹具只用 `<section>` 包标题，没有走到这条路径（`__tests__/blocks.test.ts`）。
  - 依据：[market.md §4.3](../../docs/v2/market.md) 的页面抽样——20 个技术文档页里有 12 个是平铺的标题与段落（React、Docusaurus、MkDocs Material、GitHub README、VitePress、Tailwind、Effective Go、Kubernetes、PostgreSQL 手册、Anthropic 的 3 页），正是会触发上面崩溃的结构；识别的覆盖要求（extension.md §8 第 1 条）是 33 个可评估页面里至少 30 个的文章级区块包住 75% 以上的正文段落（抽样里只认语义容器 20/33，加 `main` 与常见类名容器 30/33，再加文字密集的容器 32/33）。
  - 要求：以 `localName` 比较，不依赖大小写；识别函数不得向页面抛异常（入口外层兜底，失败等于“没有入口”）。同时补齐规格已有但没实现的三处：
    1. “一节”是标题到下一个同级或更高级标题之间的内容。标题与段落同级时，目标是一段兄弟区间，而不是整个容器：区块目标要能表示区间（描边取外接矩形，保存时按区间转换为 Markdown，永久链接取该标题的锚点）。
    2. 内容容器按 class **词**匹配（`classList.contains`），不是整个 `class` 属性恰好等于单个类名（`classifyArticle` 目前对 `entry-content clearfix`、`post-content prose` 这类多类名全部不匹配）。
    3. 没有 `article`/`main`/`[role=main]`/已知容器时，取“直接包含至少三个有文字量段落的最内层容器”。
  - 测试：按抽样里的页面形态做夹具，各自断言胶囊出现、保存内容正确、Playwright 的 `pageerror` 与 console error 为空——标题与段落同级的文档页（React、MkDocs 式）；只有 `div` 的博客页（Simon Willison 式，`div.post-content.prose`）；Docusaurus 式 `article > div.markdown > h1, h2, p…`；只有 `main` 或类名容器的页面（Rust 手册、VitePress 式）；没有 `main` 的文字密集页（Tailwind、PostgreSQL 手册式）；代码块在 open shadow root 里的页面（MDN 式）；有 `article` 的页面。`hasHeadingBetween` 另加一条大写 `tagName` 的单测。

- **RV-CAP-02 · DOM → Markdown 转换损坏内容**（P0）。契约：capture.md §3.1（保留标题、段落与换行、列表、代码、表格、强调、链接；去掉页面自己的界面）。以下输出均为直接运行 `elementToMarkdown` 的结果（jsdom）。
  - 嵌套列表：`<ul><li>parent<ul><li>child one</li><li>child two</li></ul></li><li>sibling</li></ul>` 得到 `- parentchild onechild two\n- child one\n  - child two\n- sibling`（父项把子列表的文字拼了进来，首个子项丢了缩进，原因是 `Emitter.addBlock` 对整块 `trim()`）；有序列表同理。期望 `- parent\n  - child one\n  - child two\n- sibling`；有序列表的子项缩进到父项内容列（`1. step\n   1. sub step`）。换行与缩进约定要和 `markdown-view.tsx` 的 `parseBlocks`、`learning-core/markdown.ts` 的 `blockSegments`/`leadingMarkerLength` 一致（后两者目前只认 0–3 个前导空格，嵌套项要能被当作独立的块）。
  - 换行：`<p>line one<br>line two</p>` 得到 `line one line two`（`<br>` 被压成空格，段落与列表项都是）；`capture.md §3.1` 要保留换行。期望硬换行 `line one  \nline two`（行尾两个空格）。表格单元格里的 `<br>` 目前产生 `first line  \nsecond line`，把一行拆成两行，破坏表格；单元格内的换行折叠成一个空格，行必须保持一行。
  - 页面界面启发式误删正文：`PAGE_CHROME_PATTERN` 是对 `id`/`class` 的**子串**匹配，而且 `ads?\b` 没有左边界，所以 `thread`、`lazyload`、`post-head`、`pad`、`download`、`unlike`、`shared-notes`、`socialist-history`、`commentary`、`spread`、`ahead`、`reload` 都被当作页面界面整块丢弃；`<img class="lazyload">` 被丢；块自身命中时整块退化为纯文本（标题与正文粘在一起）。改成按 class/id 的**词**（以空白、`-`、`_` 切分的 token）精确匹配；`article`、`main`、`pre`、`table`、`figure` 等语义容器不做 class 启发式，优先用语义信号（`role`、`aria-label`、`nav`/`aside`/`footer`）。必留的 class（夹具）：上面列出的十二个，另加 `broadcast`；必删的 class（夹具）：`share-bar`、`social-share`、`related-posts`、`newsletter-signup`、`subscribe-box`、`ad-slot`、`ads`、`comments`、`comment-list`、`breadcrumb`、`pagination`、`paywall`。
  - 不转义页面文本里的 Markdown 记号：`<p>Use * for pointers; 2*3*4.</p>`、行首的 `# `、`- `、`1. `、`> `，以及文本里的反引号、`[`、`]`、`<`，保存后都会被渲染成别的东西（`<` 开头的文字在 Obsidian 里还会被当成 HTML）。对文本节点转义；`snake_case_name` 这类词内下划线不需要转义。转义要和渲染器（`markdown-view.tsx` 的 `inlineRuns` 需识别 `\X`，偏移指向 `X`）及纯文本化（`markdownToPlainText`）一起改。
  - 行内代码里有反引号（`<code>a`b</code>` 得到 `` `a`b` ``）要用更长的反引号包裹；代码块文字里含围栏时围栏要比内容里最长的反引号序列更长。链接目的地含括号或空格时用 `<…>` 目的地或百分号编码，并与渲染器的解析一致。
  - 测试：这个转换器目前没有单测。新建 `__tests__/markdown.test.ts`（jsdom），固定上面的夹具与期望字符串，包括必留/必删的 class 清单。

- **RV-CAP-03 · 快速编辑气泡抹掉自动采集的属性，失败时静默丢输入**（P0）。契约：extension.md §3、§6；capture.md §7；根 `AGENTS.md` 第 5 条；US-CAP-11。前置：RV-BG-03。
  - 现象（实测）：`clip-flow.ts` 的 `openEditBubble` → `persist()` 先关气泡，再用 `{ title, tags }` **整体替换** `properties` 发 `UPDATE_ENTRY`（后台对 `properties` 是替换语义），响应也不检查。只改备注，就把采集时写入的 `author`、`published`、`description` 全部抹掉（`{author, description, published, title}` 变成 `{title}`）。备注 2,500 字符时气泡消失、没有任何提示、输入丢失。
  - 另（读码）：`Esc` 也触发保存；输入框没有长度限制；标签超过 32 字符或 20 项会被 `normalizeTags` 静默丢弃；点“撤销”后后台删除失败时只是关掉提示，用户不知道没撤销成功。
  - 要求：只发用户改动过的字段（协议改成字段级补丁，见 RV-BG-03）；等响应成功再关闭气泡，失败保留气泡与输入并显示原因与“重试”；输入框带上限（标题 1000、备注 2000、标签每项 32 字符且至多 20 项），超限时即时提示而不是静默丢弃；撤销失败要有可见反馈。`Esc` 的语义是“关闭并保存”，保存失败时不关闭。
  - 测试：带 meta 的夹具页（author/published/description）→ 剪藏 → 只编辑备注 → 存储里三项仍在；超长备注 → 气泡保留且显示错误；让后台返回失败 → “重试”可用且输入还在。

- **RV-CAP-04 · 选区菜单的适用范围**（P0 可编辑区；P1 shadow root 与 iframe）。契约：capture.md §3；extension.md §2.1；US-CAP-01；D-25。
  - 可编辑区（实测）：`selectableRange` 不排除 `contenteditable`，在可编辑区里选中文字菜单照常出现；菜单显示期间，`Enter` 在没有聚焦任何动作时也触发剪藏并 `preventDefault`（`selection-menu.ts` 里 `focusIndex === -1` 走 `onClip()`）。后果：在 contenteditable 里选中文字后按回车，静默存一条剪藏并吞掉这次回车。要求：选区端点在 input、textarea、contenteditable 内时不出现菜单；`Enter` 只在已用 `Tab` 聚焦某一项后才触发。
  - open shadow root（实测）：`document.getSelection()` 给出折叠范围（`range.toString()` 为空，而 `selection.toString()` 有文字），菜单不出现。按 D-25 的默认：有 `Selection.getComposedRanges` 时用它，没有时降级为 `selection.toString()` 的纯文本剪藏。
  - 同源 iframe（实测）：清单里没有 `all_frames`，脚本只在顶层框架，iframe 里的选区没有任何入口；后台的 `trustedSender` 对标签页来源要求 `frameId === 0`。按 D-25：脚本注册到所有框架，子框架里与顶层同源才启用，跨源静默不工作、不报错；后台接受与该标签页顶层同源的子框架发来的写入，消息带框架标识。
  - 测试：contenteditable 夹具（菜单不出现；`Enter` 不存剪藏、换行照常）；open shadow 夹具；同源 iframe 夹具；跨源 iframe 夹具（用第二个 hostname，如 `127.0.0.1` 与 `localhost` 互为跨源）。

- **RV-CAP-05 · 截图会话把点击穿透给页面**（P0）。契约：screenshot.md §2；US-CAP-13。
  - 现象（实测）：会话只在 `pointerdown` 里 `preventDefault`，`click` 仍然到达页面：单击选取一个链接时，页面真的跳转了。按钮会触发它自己的动作（推断，同一机制，未实测）。
  - 位置：`screenshot/index.ts` 的 `onPointerDown`。
  - 要求：会话期间在 capture 阶段拦截并吞掉可信的 `click`、`dblclick`、`auxclick`、`contextmenu`、`submit`（目标不在扩展自己的界面内时）；元素选取保持可用；会话结束时移除监听。
  - 测试：链接页面——选取该元素后 URL 不变；按钮页面——选取后 `onclick` 计数为 0。

- **RV-CAP-06 · 页面 meta 过长会让整条剪藏存不下来**（P1）。契约：capture.md §5、§7；US-CAP-02。
  - 现象（实测）：作者 meta 超过 100 字符（12 位作者的署名行）时，`list` 项超限，保存以 `PROPERTY_VALUE_INVALID` 失败，重试同样失败。`description`、`title` 超过 1000 字符同理。
  - 位置：`page-meta.ts` 的 `extractPageMeta` 不做任何上限处理。
  - 要求：永不因 meta 让保存失败。自由文本（`title`、`description`）按上限在字符边界截断，并把换行折叠成空格；`author` 单项超过上限则不设置该属性；日期不合规已经丢弃，保持。
  - 测试：长 author、长 description、含换行的 description 三个夹具，剪藏均成功，只缺（或截断）对应项。

- **RV-CAP-07 · 语境范围不对**（P1）。契约：capture.md §4；US-CAP-02。
  - 现象（实测）：三击选中一段时，保存的语境是整篇文章的文字（165 字符，含标题和下一段），因为取了 `commonAncestorContainer`；选区完全落在 `<b>`、`<a>`、`<code>` 里时，语境等于选区本身（`bold text` → `bold text`），因为取到的第一个元素祖先就是这个行内元素。选区在段内时正常。
  - 位置：`page-meta.ts` 的 `extractContext`。
  - 要求：从选区起点与终点向上找最近的**块级**祖先（`p`、`li`、`blockquote`、`td`、`h1`–`h6`、`pre` 等），选区跨多个块时取覆盖选区的最小连续块序列；超长时按 capture.md §4 围绕选区截断。
  - 测试：三击、行内元素内的选区、跨两段的选区、列表项内的选区。

- **RV-CAP-08 · 区块模式与悬停入口**（P1）。契约：capture.md §6.2；extension.md §7.2；US-CAP-14；D-27。
  - `Tab`/`Shift+Tab` 无效：`block-hover.ts` 的 `modeIndex` 只写不读；`lastPoint` 初值是 (0, 0)，没动过鼠标的键盘用户没有目标（实测：打开模式后没有描边，`Tab` 后仍然没有）。按 D-27 的默认实现起点与顺序。
  - 模式状态行没有 `role="status"` 或 `aria-live`，也没有区块摘要（规格：读屏读出区块类型与摘要）（实测）。
  - 每次悬停停留，`reveal` 都连发两条 `GET_SETTINGS`（6 次停留 12 条），并让 service worker 常驻（实测）。内容脚本缓存设置并监听 `chrome.storage.onChanged`。
  - `index.tsx` 的 `onDisableSite` 先读整个站点数组再写回，跨标签页会丢更新（读码）：后台提供“追加站点”的原子操作（RV-BG-07）。
  - 测试：不移动鼠标进入区块模式，`Tab` 在三个同层区块间依次移动；状态行是 live region；六次悬停停留只产生常数条设置请求。

- **RV-CAP-09 · 截图的指标与错误展示**（P1）。契约：metrics.md §9；screenshot.md §4–§5；extension.md §6。
  - `screenshot.copied` 的 `watermark`/`beautify` 在 `copyCurrent` 里是常量 `false`，`screenshot.downloaded` 在后台 `DOWNLOAD_IMAGE` 里同样写死 `false`（M-22、M-24 因此失真）。让复制与下载的消息带上本次是否带水印、带美化，据实上报。
  - 保存时 `frame` 只会是 `drag` 或 `element`，`reused` 从不上报（M-25 无法计算）：沿用上次取景框的那张要上报 `reused`。
  - 保存失败时把后台的原始 `error` 字符串直接显示给用户（可能是英文或错误码）：按错误码映射本地化文案，配额不足时提示导出（extension.md §6）。
  - 读码疑点，先写测试判定：`downloadOnly` 的 JPEG 铺白只在 `beautify.background === 'none'` 时生效；元素克隆路径（元素比窗口大）输出的画布可能有透明区，JPEG 下透明处会变黑。实测元素 + 边距能放进视口的路径走区域截取，像素不透明，不受影响。screenshot.md §4.2：JPEG 的透明处铺白。
  - 测试：复制与下载各带/不带水印、美化，`annhub.metrics` 里的属性与之一致；沿用取景框后保存，`frame=reused`；让保存失败，界面显示本地化文案而不是原始字符串。

- **RV-CAP-10 · 剪藏的指标：撤销与用时**（P1）。契约：metrics.md §5、§9；D-22。前置：RV-BG-06。
  - 撤销（实测）：`clip-flow.ts` 的 `DELETE_ENTRY` 没带 `attribution`，后台 `capture.undone` 从不记录（M-23 失真）。撤销时带上 `{ via, type, blockKind }`。
  - 用时（实测）：`durationMs: performance.now() - started` 在发请求之前就算完，结果恒落在最小一档；截图的用时在后台只量了数据库写入。按 D-22 的默认：内容脚本在用户点击时记下触发时刻随消息发出，后台在写入成功时算“点击到写入成功”并分档。
  - 测试：剪藏后撤销，`capture.undone` 计 1；构造慢写入，`capture.saved` 落在对应的档位。

- **RV-CAP-11 · 重复与无人引用的代码**（P2）。
  - `types/dom.ts`（`MixedSelectionContent`）无人引用；`blocks.ts` 的 `blockKindLabelKey` 无人引用；`screenshot/selection.ts` 的 `MARGIN_CHOICES` 无人引用，`screenshot/index.ts` 里另写了一份 `[0, 8, 16, 24, 32]`，留一份。
