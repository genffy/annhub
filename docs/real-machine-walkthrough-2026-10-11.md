# AnnHub 扩展真机测试报告（2026-10-11）

更新时间：2026-10-11

本报告记录 [roadmap §5](./v2/roadmap.md#5-未决验收项) 四个未决验收项的第二轮走查。同日的第一轮（初级）在真实 Chrome 里点过一遍，结论没有复核；本轮先把能脚本化的部分在加载了扩展的 Chromium 里逐项重跑并量化，再用 Claude in Chrome 在用户的 Chrome 154 里补测 X、截图与延迟（3.9）。第一轮的每条结论都在第 4 节标明复核结果；仍要人来做的项列在第 5 节。测试只做验证，未改任何代码。

同日下午的第三轮（第 7 节）用 computer use 直接操作真实 Chrome，把第 5 节里除 VoiceOver、产品负责人通读之外的项全部执行：真实断网的场景 A 在干净 profile 里全流程通过（导出文件名确认为 `AnnHub-export-YYYY-MM-DD.zip`），P1-1 三组共 30 轮循环未复现，Medium 补测 2/3 页（第三篇被 Cloudflare 人机验证拦住，按规则不代点）。

## 1. 环境与方法

| 项            | 值                                                                                                                                                                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 被测构建      | `main` 分支 `0a843e2`；`.output/chrome-mv3` 构建于源码最后一次改动之后；manifest 权限 `storage`、`commands`、`downloads` + `<all_urls>`，最低版本 114                                                                                                                |
| 自动化浏览器  | Playwright 1.63 自带的 Chromium 153.0.8010.12，无头，1280×900，`en-US`；`--load-extension` 加载上面的构建；每轮全新 profile（场景 A 即“新安装”）                                                                                                                     |
| 用户的 Chrome | 154.0.8037.99，已登录 X；加载的扩展 ID 是 `cglpagelldbmcnggfmbmlegkkpgaipbh`，即上面的构建目录。第二阶段用 Claude in Chrome 操作网页；它打不开 `chrome-extension://` 页面，资料库只能用 computer use 读屏幕（对 Chrome 只读）。另读取了 Crashpad 崩溃转储            |
| 输入          | Playwright 的鼠标与键盘事件（页面里 `isTrusted` 为真）。两个全局快捷键改为发送它们在后台触发的同一条消息（`TRIGGER_SCREENSHOT` / `TRIGGER_BLOCK_MODE` 发往顶层 frame）：CDP 的按键不会触发 `chrome.commands`                                                         |
| 键盘选择      | `--enable-caret-browsing`，等同用户按 F7 打开光标浏览；网页正文不是可编辑区域，没有它浏览器不允许只用键盘选中文字                                                                                                                                                    |
| 断网          | 文章载入后用 Playwright 的网络模拟断网，并记录断网期间的全部请求；不是真的关掉网络                                                                                                                                                                                   |
| 读屏          | Chromium 无障碍树（`ariaSnapshot`）与 ARIA 属性核对；没有用 VoiceOver 实听                                                                                                                                                                                           |
| 页面          | [market.md §4.3](./v2/market.md#43-区块与元素的指认现有做法与页面抽样) 的抽样清单（真实公网页面），另加 Wikipedia、jvns.ca 等；X 在真实 Chrome 里测了 3 个页面；Medium 对无头浏览器返回 Cloudflare 403，在真实 Chrome 里出现要点击的人机验证，按规则不代点，没有测到 |

脚本是一次性的验证脚本，放在本机临时目录，不入库；第 6 节写了复现方法。

## 2. 结论总览

| roadmap §5 项                       | 结论                   | 依据                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1 新安装到首次保存、再次打开并导出 | **通过**（第三轮关闭） | 场景 A 在干净 profile + 真实 Wi-Fi 断网下全流程通过（7.3）；导出文件名确认为 `AnnHub-export-2026-10-11.zip`（3.1 的偏差在真实 Chrome 不成立）；P1-1 三组 30 轮循环未复现、无新转储（7.2），但未改代码，保持观察                                                                                                                                                    |
| R2 键盘与读屏走查                   | **未通过**             | 区块模式在 8/8 个页面停在整篇文章下不去，按 `S` 截出的是空白图（P1-2）；选区菜单的“截图”对键盘是死路；截图编辑态焦点留在页面，44 次 Tab 才到工具栏，途中在链接上按 Enter 会跳离页面、丢掉截图；高亮不读“高亮，颜色”；暗色主题 3 处文字对比度低于 4.5:1。第三轮补：快捷键在地址栏获焦时会话能启动但 Esc 被地址栏吃掉（7.4，第一轮 P2-1 确认）；VoiceOver 实听仍未做 |
| R1 区块剪藏的真实页面走查           | **部分通过**           | 区块截图（胶囊的 Shot、区块模式的 `S`）在所有页面都是空白（P1-2）；覆盖 30/32 个可评估页面达标（门槛 30/33，第三轮 Abramov 真机达标，Medium 还差 2 页）；MDN 与 Overreacted 的整篇 Markdown 丢掉全部代码；胶囊在 3 个文档站点和 X 的 5/5 条帖子上盖住页面按钮；X 3/3、Medium 2/3 完成，Medium 第 3 篇被人机验证拦住                                                |
| 官网文案、隐私政策、服务条款        | 未关闭                 | 权限表与清单一致；隐私政策没有覆盖写进网页 `sessionStorage` 的取景框记忆；落地页的导出演示与产品不符；产品负责人通读未做                                                                                                                                                                                                                                           |

四项各自要关闭，需要：

- R1 新安装到导出：**已关闭**（第三轮场景 A + P1-1 复现尝试；P1-1 未复现但未改代码，建议随 P1-2 的修复版本一起回归）。
- R2 键盘与读屏：修 P2-1、P2-5、P2-6、P2-7，并做第 5 节第 4 条的 VoiceOver 实听；P2-8 违反设计系统自己的对比度规定，同时处理。
- R1 区块剪藏：修 P1-2、P2-3、P2-4；补测 Medium 第 3 篇（人工过一次 Cloudflare 人机验证后即可继续）。
- 对外页面：修 P2-10、P2-11，产品负责人通读。

不在这四项里、但应尽快修的：P2-12。截图的匿名默认开启，X 上却只盖住头像，名字与账号留在图里。

## 3. 逐项结果

### 3.1 场景 A：新安装、断网采集、找回、导出

页面：jvns.ca《Importing a frontend Javascript library without a build system》。全新 profile 安装后没有自动打开任何页面；先打开资料库，6 个视图的空状态都是英文。文章载入后断网（`navigator.onLine` 为 `false`）。

| 步骤                                   | 预期（[examples.md §3](./v2/examples.md#3-验收场景)）  | 实测                                                                                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 鼠标拖选一句 → 菜单 → Clip             | 保存成功                                               | 菜单在 `pointerup` 后 25 ms 出现（[extension.md §8](./v2/extension.md#8-验收标准) 要求 < 150 ms）；提示“Clipped · Undo · Edit”；Edit 打开快速编辑，焦点在 Title，Esc 保存关闭                                     |
| 悬停段落 → 胶囊 → Clip                 | 保存成功                                               | 胶囊“Clip · Shot · Parent · More”；该段在第一个小标题之前，最小单元是整篇文章，保存的是整篇                                                                                                                       |
| 截图快捷键 → 拖 500×320 → Enter → Copy | 剪贴板里是 PNG                                         | 提示“Copied”；剪贴板类型 `image/png`，67 088 字节，PNG 文件头正确；再点 Confirm 入库                                                                                                                              |
| 资料库 → 打开区块那条 → 选一句 → 黄色  | 高亮刷新后仍在                                         | 列表 3 行；阅读视图里拖选一句、点黄色，出现 1 处高亮；刷新后仍是 1 处                                                                                                                                             |
| 搜索                                   | 三条可搜索                                             | 断网下 `situation` 命中 2 条（选区那条与包含它的整篇）、`millionth` 命中 1 条、无意义词 0 条；URL 写入 `#/all?q=…`                                                                                                |
| Export content                         | ZIP 含两份剪藏、一份截图 Markdown 与图片，图片链接有效 | 提示“Export complete · 2 clips, 1 screenshots; 0 missing images”；ZIP 94 642 字节：`README.md`、`clips/` 两份（一份带 `==…==`）、`screenshots/` 一份、`assets/` 一张 PNG；`../assets/<id>.png` 指向包内存在的文件 |
| 断网期间的网络请求                     | 扩展不出网                                             | 扩展没有发出任何请求；唯一一条是文章页自己的统计脚本，被断网拦下                                                                                                                                                  |

偏差：断网是模拟的；下载由 Playwright 接管，文件名是随机名。第三轮在真实 Chrome 里关闭了文件名这条偏差：两次真实导出的文件名都是 `AnnHub-export-2026-10-11.zip`（见 7.3）。

**英文界面逐屏核对**：扫描文字与 `aria-label`、`title`、`placeholder`、`alt`，下列界面都没有汉字——资料库 6 个视图的空状态与有数据状态、无结果状态、抽屉（剪藏与截图）、阅读视图、高亮工具条与高亮对话框、删除确认、导出提示、popup；页面里的选区菜单与后果说明、剪藏提示、快速编辑、区块胶囊与 More 菜单、截图的提示条、比例条、确认条、编辑工具栏与美化面板；导出 ZIP 里的 README 与全部 Markdown。英文文案的问题见 P3-2、P3-1。

**Chrome 的“扩展程序选项”**：打开的是浏览器自带的小对话框，里面塞进了整个资料库（左导航，右侧空白），见 P2-9。

### 3.2 键盘

| 界面                         | 结果       | 实测                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 选区菜单                     | 通过（F7） | `Shift+→` 选中后菜单出现；Tab 在 Clip / Screenshot 之间移动，300 ms 后显示后果说明；Enter 保存；随后 1 次 Tab 到 Undo（菜单与提示都挂在文档末尾，顺序上恰好相邻）；Edit → 焦点进 Title；Esc 保存关闭                                                                                                                                                                           |
| 选区菜单 → Screenshot        | 不通过     | 进入拖拽 / 单击元素的会话，选区被丢弃；Enter、方向键都无效，Tab 只能到比例条，只能 Esc 退出（P2-5）                                                                                                                                                                                                                                                                            |
| 区块模式                     | 不通过     | MDN、React、Rust 手册、Docusaurus、Wikipedia、Martin Fowler、Overreacted、Dan Luu 8/8 页面的起点都是 Article；`↑` `↓` 没有可换的层级，Tab 没有同类单元，到不了一节或代码块（P2-1）。模式胶囊 `role="status"`、`aria-live="polite"`，Esc 退出正常                                                                                                                               |
| 截图编辑（区块模式里按 `S`） | 不通过     | 编辑态出现后焦点仍在页面上，按了 44 次 Tab（经过页面 43 个链接）才到工具栏；第一次 Tab 落在页面自己的第一个链接上，此时按 Enter 页面跳走，截图丢失（P2-6）。工具栏 `role="toolbar"`，17 个按钮都有名字；美化面板打开后焦点在第一个控件，Esc 关闭面板、焦点回到“Beautify”（符合 [screenshot.md](./v2/screenshot.md)）；Tab 到 Confirm、Enter 入库成功，但入库的是空白图（P1-2） |
| 截图快捷键 + 上次取景框      | 部分通过   | 用鼠标框选入库后再按快捷键，确认条显示“Last frame · 400 × 250”，Enter 直接进入编辑；但用区块模式截的图不会被记下，只用键盘的用户拿不到这条路径（P3-4）                                                                                                                                                                                                                         |
| 阅读视图                     | 通过（F7） | 打开时焦点在自己的 Back，列表 `inert`；`Shift+→` 选中后高亮工具条出现，`H` 创建高亮；2 次 Tab 到这处高亮，Enter 打开“Edit highlight”对话框且焦点在内                                                                                                                                                                                                                           |
| 应用页                       | 通过       | 21 次 Tab 到第一行（两个日期框各占 4 站）；Enter 打开抽屉、焦点进入；40 次 Tab + 6 次 Shift+Tab 不离开抽屉；Esc 关闭、焦点回到原行；删除确认是 `alertdialog`，Esc 关闭、焦点回到原按钮；窗口 560px 宽时导航折叠为图标栏，各项仍有名称，Tab 到“Highlights”按 Enter 进入该视图                                                                                                   |

F7 是浏览器层面的前提：没有光标浏览，任何网页正文都不能只用键盘选中。这一点建议写进安装指南的键盘部分。

### 3.3 读屏（无障碍树）

| 对象             | 结果   | 读出的内容                                                                                                                                      |
| ---------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 导航             | 通过   | `nav` 地标，当前视图 `aria-current`；地标名称是“Open in library”，读起来像一个动作（P3-10）                                                     |
| 列表行           | 通过   | 一个按钮，名称含类型、标题、摘要、来源与时间，例如“Clips Retry storms Without a budget… engineering.example.com · just now”；类型是复数（P3-2） |
| 截图画廊的格子   | 不完整 | 名称只有标题，来源被 `aria-label` 盖掉（P3-6）                                                                                                  |
| 区块模式         | 通过   | 状态区读“Article · 摘要”；摘要有时以页面界面文字开头，例如 Wikipedia 的“Toggle the table of contents”（P3-8）                                   |
| 正文里的高亮     | 不通过 | 读作 `button "整句原文"`，没有“高亮”也没有颜色，不符合 [extension.md §7.2](./v2/extension.md#72-可访问性)（P2-7）                               |
| 剪藏提示         | 不通过 | 没有 live region，读屏听不到“Clipped”（P3-5）                                                                                                   |
| 截图会话的提示条 | 不完整 | 没有 live region；进入会话时读屏没有任何播报，保存后也没有                                                                                      |

### 3.4 亮暗外观

两套主题下资料库 5 个视图、抽屉、阅读视图、窄窗口的图标栏、popup 的版式都正确。暗色主题有 3 处文字对比度低于设计系统自己规定的 4.5:1（[设计稿](./design/v2/README.md)的“对比度与尺寸”）：

| 元素                                 | 暗色   | 亮色   |
| ------------------------------------ | ------ | ------ |
| 当前导航项（文字与计数）             | 3.05:1 | 6.16:1 |
| “Export content”按钮（白字紫底）     | 4.38:1 | 7.31:1 |
| 强调色文字（如行内的“1 highlights”） | 4.05:1 | 6.93:1 |

原因见 P2-8。

### 3.5 区块识别：文章级覆盖

方法同 [market.md §4.3](./v2/market.md#43-区块与元素的指认现有做法与页面抽样)：正文段落是可见的 `<p>`（中文不少于 25 字，其他不少于 60 字），统计扩展识别出的文章级区块包住多少；用的是构建产物里的识别代码。

| 类别                 | 页面 | 达标 | 未达标                                                                       | 无法评估 |
| -------------------- | ---- | ---- | ---------------------------------------------------------------------------- | -------- |
| 技术文档             | 20   | 18   | Tailwind（没有文章级区块，以 h1 开头的一节包住 83%）、PostgreSQL 手册（20%） | —        |
| Medium               | 1    | 1    | —                                                                            | —        |
| 英文个人博客         | 8    | 7    | Simon Willison（2%，全是 `div`）                                             | —        |
| 中文博客             | 4    | 4    | —                                                                            | —        |
| 合计（门槛 30 / 33） | 33   | 30   | 3                                                                            | —        |

阮一峰的页面按字面统计是 61%：146 个段落里 57 个是读者评论；文章级区块（`#main-content`）包住了文章自己的 89/89 段，本表按达标计。GitHub README 第一次请求被 GitHub 返回 503，重试后 100%。

结论：**覆盖达到 30/33**。Medium 的 Abramov 一篇在第三轮真机确认达标（7.5）：区块模式到 Article 层级，整篇剪藏的 Markdown 完整覆盖文章正文；严格的段落包住率没有用注入脚本量化，按定性证据计达标。

### 3.6 区块识别：各类单元与 Markdown

| 要求（[extension.md §8](./v2/extension.md#8-验收标准) 第 1 条） | 结果                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X 的帖子 ≥ 3 个页面                                             | 通过（真实 Chrome）：@AnthropicAI 与 @claudeai 的个人页时间线、@claudeai 一条帖子的详情页。帖子都识别为 post（描边与帖子重合），Clip 入库，提示“Clipped · Undo · Edit”，永久链接是帖子的 `/status/` 地址。Markdown 可读：名字、账号、日期链接、正文；但留着浏览数链接（“10M”“6.3M Views”）、“View quotes”和视频时长“0:03” |
| Medium 的文章 ≥ 3 个页面                                        | 2/3（第三轮真实 Chrome，见 7.5）：Abramov《You Might Not Need Redux》整篇 + 一节，Karpathy《Software 2.0》一节，均识别并保存出可读 Markdown；代码块因 P2-1 键盘下不去、无法单独剪藏（未验证）。第 3 篇（@dan_abramov/before-you-memoize）被 Cloudflare 人机验证拦截，按规则不代点，留人工过验证后补测                     |
| 技术文档的代码块 ≥ 3 个页面                                     | 识别到：Rust 手册、Docusaurus、MkDocs Material、Next.js、Kubernetes、Effective Go、GitHub README、Anthropic、OpenAI 等；MDN 的代码在 shadow root 里，单独剪代码块可以，但“Parent”上不去。Docusaurus 的代码块转出来所有换行丢失，挤成一行（P2-3）                                                                          |
| 技术文档的一节 ≥ 3 个页面                                       | 识别到：MDN、Sphinx、Next.js、Docusaurus、Anthropic 等；Wikipedia 没有一节（标题包在 `div.mw-heading` 里）；Medium 的一节（h2 小节）在 Tab 遍历中可选中并剪藏（7.5）                                                                                                                                                      |
| 个人博客的文章 ≥ 3 个页面                                       | 7/8 识别到；但 Overreacted《A Complete Guide to useEffect》整篇 609 行 Markdown 里没有一个代码块（P2-3）                                                                                                                                                                                                                  |

整篇文章的 Markdown 里还留着页面界面：“Edit this page”（Docusaurus、VitePress、Next.js）、“Was this helpful?”（Next.js）、Wikipedia 每节的“[edit]”链接，X 帖子的浏览数、“View quotes”与视频时长。

### 3.7 胶囊是否盖住页面按钮

| 页面                                  | 悬停对象 | 被盖住的页面控件（重叠宽×高）                                                                                                                                      |
| ------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Docusaurus code blocks                | 代码块   | “Copy code to clipboard”按钮（33×9）、正文链接两处                                                                                                                 |
| Rust 手册（mdBook）                   | 代码块   | “Run this code”“Show hidden lines”按钮（各 32×13）                                                                                                                 |
| MDN Using Fetch                       | 代码块   | 侧栏 `summary`“Guides”（40×27）；悬停段落时盖住“Theme”按钮（57×2）                                                                                                 |
| X @AnthropicAI 个人页（真实 Chrome）  | 帖子 ×3  | 每次都盖住帖子右上角的“Grok actions”与“…”（各 19×4）；另盖住个人页的“Media”标签（88×15）与右栏“Show more”（57×32），或上一条帖子的 Bookmark 与 Share（19×3～19×5） |
| X @claudeai 个人页（真实 Chrome）     | 帖子     | “Grok actions”与“…”（各 19×4）、“Media”标签（88×15）                                                                                                               |
| X @claudeai 帖子详情页（真实 Chrome） | 帖子     | “Grok actions”与“…”（各 19×5）、右栏搜索框（27×12）、顶栏一处链接（36×8）                                                                                          |

脚本在 42 个页面上悬停代码块或段落，25 个页面出现了胶囊（其余是脚本的悬停点没有落在单元上，抽查 7 个，手动对准后都出现胶囊）；这 25 个里，除上表 3 个文档站点之外的 22 个没有盖住控件。X 上帖子的四个角都被占（上方是上一条帖子的操作栏或个人页的标签栏，下方是本条的操作栏），胶囊退回右上角，5 条帖子全部盖住按钮。原因见 P2-4。剪藏提示固定在右下角，在 X 上盖住页面自己的“Chat”浮动按钮（55×36）3.2 秒（P3-11）。

### 3.8 官网文案、隐私政策与服务条款

- 权限表：隐私政策里的表与扩展清单一致（`storage`、`commands`、`downloads`、`<all_urls>`），`utils/__tests__/legal-pages.test.ts` 也在核对；线上 annhub.org 的两个页面与仓库里的文件逐字节相同。
- 数据流：与 [permissions.md §1](./v2/permissions.md#1-数据边界)、[§8](./v2/permissions.md#8-官网的访问数据) 一致，但两边都没有覆盖截图的“上次取景框”：它写在网页自己的 `sessionStorage`（键 `annhub.frame`），网站脚本能读到（P2-11）。
- 落地页：导出演示是一个带“Export ZIP”按钮和进度的对话框，完成后说写入了 `AnnHub-export.zip`；产品是点一下直接导出、导航里出一行提示，文件名带日期。快速编辑演示写着“Saved on blur”，产品里没有这行（P2-10）。
- 产品负责人通读：未做，留给人。

### 3.9 真实 Chrome 里的补测

用 Claude in Chrome 在用户的 Chrome 154 里操作。延迟在页面里用 `performance.now()` 记录，不含工具往返。

| 项                 | 结果                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------- |
| 选区菜单出现       | X 上 `pointerup` 之后 16 ms（[extension.md §8](./v2/extension.md#8-验收标准) 要求 < 150 ms） |
| 区块胶囊出现       | 指针最后一次移动之后 459 ms（设计是停下约 400 ms）                                           |
| X 帖子的识别与剪藏 | 3 个页面都通过，见 3.6；胶囊与剪藏提示的遮挡见 3.7                                           |
| 元素截图           | X 的帖子、danluu 的整篇文章都是空白（P1-2）                                                  |
| 区域截图           | X 上正常；匿名只盖住头像（P2-12）                                                            |
| 崩溃               | 10-11 02:05 之后 Crashpad 没有新的转储                                                       |

Claude in Chrome 的限制：打不开 `chrome-extension://` 页面（地址被改写成 `https://chrome-extension//…`），资料库里的操作（P1-1）仍要人做；它的按键走 CDP，触发不了 `chrome.commands`，全局快捷键仍要人按；窗口不在当前桌面时，区域截图被扩展按设计拒绝。测试在 X 上剪藏的 3 条帖子留在用户的资料库里（@AnthropicAI 10-09 一条，@claudeai 10-09、10-08 各一条），可以删掉。

## 4. 问题清单

严重度：P1 阻塞主链路；P2 明显影响使用、可访问性或对外一致性；P3 次要。“复核”一列说明它与第一轮报告的关系。

### P1

**P1-1 资料库页面的渲染进程在 Chrome 154 上崩溃**（第一轮 P1-1；第二轮未复现；第三轮 30 轮定向复现仍未复现）

- 第一轮：在 `library.html` 里切换哈希路由（点行、Read、切导航）6 次崩 4 次，“Aw, Snap!”，直接载入同一 URL 正常。
- 证据：`~/Library/Application Support/Google/Chrome/Crashpad/completed/` 里 02:03–02:05 的 4 份转储都是 `EXC_BREAKPOINT`，地址都在 `Google Chrome Framework + 0xc04d4b9`，进程是扩展的渲染进程——同一处 `CHECK` 失败，确定性的，不是随机内存错误。之后没有新的转储。
- 第二轮：Chromium 153 上场景 A、全部视图、抽屉、阅读视图、刷新、带截图缩略图的列表都没有崩溃。版本不同，不能据此排除。
- 第三轮（7.2）：Chrome 154 上按第 5 节第 2 条的方法做了三组共 30 轮“点行 → Read → Back → 切导航”，全部无崩溃、Crashpad 无新转储。未改代码，不能宣称修复；两条既定复现路径都试过之后，把它按“未复现、保持观察”处理，建议与 P1-2 的修复一起回归。
- 线索：列表与抽屉用 IndexedDB 里的 Blob 建 object URL 并在卸载时撤销（`entrypoints/library/App.tsx` 的 `useAssetUrl`）；阅读视图打开时给列表加 `inert`。第一轮同时看到截图缩略图是破图（第一轮 P3-1），两者可能同源。

**P1-2 元素截图在所有页面都是空白**（第一轮 P1-2 只报了 x.com；本轮复现并定位）

- 范围：区块胶囊的“Shot”、区块模式的 `S`、截图会话里单击选元素，三条路径都走元素截图，预览只有底色。真实 Chrome 154：X 的帖子、danluu 的整篇文章（2400×12554，全白）。Chromium 153：Rust 手册与 Docusaurus 的代码块、danluu 的段落与整篇、jvns 的整篇，预览都只有一种颜色。3.2 里区块模式按 `S` 后“入库成功”的，入库的就是空白图。
- 原因：`captureElement`（`entrypoints/content/screenshot/element-capture.ts:56`）把克隆放进 `position: fixed; left: -10000px` 的离屏容器（同文件 64 行），再把容器本身交给 html-to-image；html-to-image 把容器的计算样式连同 `position`、`left` 写进 SVG，内容画到了图片左边 10000px 之外。用同版本 html-to-image（1.11.13）在同样的页面上对照：给根节点覆盖 `style: { position: 'static', left: '0', top: '0' }`，或把容器放回屏幕内，文字都正常出现。这个离屏容器从 v2 的第一个提交（7b6e21d，10-05）就在。
- 测试没发现：e2e 只检查区域截图的像素，没有测试看元素截图里有没有内容。
- 区域截图正常：场景 A；真实 Chrome 里在 X 上拖拽框选，得到 454×321、3176 种颜色的正常图片。第一轮说拖拽框选在 X 上也是白图，本轮没有复现。窗口不在当前桌面时，扩展按设计拒绝截取，提示“Only the visible tab can be captured”（[screenshot.md §2](./v2/screenshot.md#2-截取与像素处理)）。
- 另：同一文件的 `opaqueBackground`（19 行）把半透明背景当作不透明。X 悬停时帖子的背景是 `rgba(0,0,0,0.03)`，于是 X 上元素截图的每个像素都是 `(0,0,0,8)`，几乎透明。上面的问题修好后，这里也要改成取第一个不透明的背景。

### P2

**P2-1 区块模式只用键盘下不到一节或代码块**（第一轮 P2-4 的扩展：从 MDN 一页扩到 8/8 页；第三轮 Medium 同样复现，9/9）

- 起点由 `firstVisibleChain`（`entrypoints/content/blocks.ts:333`）从视口顶部往下扫，第一个命中点通常只落在文章容器里，链只有 `[Article]` 一层；`↑` `↓` 只在这条链里换层级，Tab 只在同类单元之间跳（`moveToPeer`，`entrypoints/content/block-hover.ts:482`），页面通常只有一个 Article，于是原地不动。缺的是“进入子单元”的一步，或者起点直接取视口里第一个最小单元。
- Medium 的区块树是 `Article → Section×6` 两层：Tab 能在 6 个 h2 小节间移动并剪藏（7.5），但 `↓` 仍然进不去小节内部，代码块无法用键盘到达。

**P2-2 文章级覆盖差 1 页**：见 3.5。PostgreSQL 与 Simon Willison 没有 `main`、语义容器或常见类名，靠“文字密集的容器”也没有接住；Tailwind 没有文章级区块。

**P2-3 Markdown 丢代码、丢换行**

- MDN 的代码示例在 open shadow root 里：整篇 Markdown 0 个代码块（Using Fetch、Clipboard.write）；从代码块按“Parent”也上不去，因为 `candidatesFor` 沿 `parentElement` 走、在 shadow root 处停下（`entrypoints/content/blocks.ts:202`）。
- Overreacted：代码包在 `figure` 里，转换的 `figure` 分支只取图片与图注（`entrypoints/content/markdown.ts:318`），整篇 0 个代码块。
- Docusaurus：每行代码是一个 `display:block` 的 `span`，没有换行字符；`pre` 分支取 `textContent`（`entrypoints/content/markdown.ts:272`），整块挤成一行。
- 页面界面残留：见 3.6 末段。Medium 的整篇 Markdown 还带着文末登录表单（“Remember me for faster sign in”两行）与订阅框（“Get Dan Abramov's stories in your inbox”），“3 min read”与日期粘连无分隔（7.5）。

**P2-4 胶囊盖住页面按钮**（见 3.7）

- `capsuleAreaOccupied`（`entrypoints/content/block-hover.ts:334`）在胶囊范围里取 5×3 个点，横向间隔约 44px，比常见的 30px 图标按钮宽，代码块右上角的按钮正好落在两点之间；`isPageControl` 不把 `summary` 当控件；四个角都被占时退回右上角（同文件 321 行）。

**P2-5 选区菜单的“截图”对键盘用户是死路**

- `onScreenshot` 先清掉选区，再以拖拽 / 单击模式开会话（`entrypoints/content/index.tsx:60`），没有把选区的范围带进去，也没有键盘可用的下一步。可以把选区外框作为待确认的选区（Enter 确认），或在提示里指向区块模式。

**P2-6 截图编辑态不接管焦点，保存没有播报**

- 编辑态出现后焦点留在页面，工具栏挂在文档末尾，要先经过页面全部链接。遮罩下的页面链接仍可聚焦：danluu.com 上区块模式按 `S` 后按一次 Tab 落在页面第一个链接，再按 Enter 页面跳到 Wikipedia，截图与标注全部丢失，离开前没有任何确认——拦截页面动作的 `onSwallowPageAction`（同文件 309 行）在编辑态直接放行。[extension.md §7.2](./v2/extension.md#72-可访问性) 要求截图工具栏的主流程只用键盘能完成：44 次 Tab 能到，但途中任何一次在链接上按 Enter 都会丢掉截图，所以判为不通过。保存成功后会话直接关闭（`confirmSave`，`entrypoints/content/screenshot/index.ts:1273`），读屏没有任何反馈。
- 建议：编辑态出现时把焦点移进工具栏，Tab 限制在工具栏与美化面板之内，Esc 照旧退出。

**P2-7 高亮不读“高亮，颜色名”**

- 高亮外层是 `role="button"` 的 `span`（`entrypoints/library/markdown-view.tsx:318`），名称就是原文；颜色只体现在 class 上。高亮页的列表与右栏同样没有颜色名。

**P2-8 暗色主题对比度不足**（见 3.4）

- 设计稿暗色主题把填充色与文字色分开：`--brand: #7a55d1`（白字 5.19:1）、`--brand-text: #b9a3f2`（在页面底色上 8.10:1），见 `docs/design/v2/css/tokens.css:93`。产品的 `styles/tokens.css:31` 只有一个 `--ann-accent: #8a63d2`，既当填充又当文字。

**P2-9 Chrome 的“扩展程序选项”里是挤扁的资料库**

- `wxt.config.ts:33` 写了 `options_ui.open_in_tab: true`，但构建出的 manifest 是 `open_in_tab: false`、`page: options.html`：WXT 按 `entrypoints/options/index.html` 生成这一项，配置里的值没有生效。选项页随后跳到 `library.html#/settings`，于是在 chrome://extensions 的小对话框里显示整个应用壳。在选项页 HTML 里声明在新标签页打开即可（并改掉配置里不生效的那段）。

**P2-10 落地页的导出演示与产品不符**：`website/lib/copy/en.ts:347` 起的导出对话框文案与 `AnnHub-export.zip`，对照产品的一键导出与 `AnnHub-export-YYYY-MM-DD.zip`；快速编辑演示的“Saved on blur”（同文件 266 行）产品里没有。

**P2-11 隐私政策没有覆盖网页 `sessionStorage` 里的取景框记忆**

- `entrypoints/content/screenshot/selection.ts:206` 起把上次取景框（元素选择器、页面坐标、尺寸、边距、路径）写进网页自己的 `sessionStorage`，网站脚本可读，也就能知道用户用 AnnHub 截过页面上的哪一块。隐私政策说数据都在“IndexedDB and chrome.storage.local”，[permissions.md §1](./v2/permissions.md#1-数据边界) 也没有提。二选一：改存到扩展自己的会话存储，或在两处写明。

**P2-12 X 截图的匿名漏掉名字与账号**

- 身份元素的选择器是 `[data-testid="User-Names"]`（`entrypoints/content/screenshot/detect.ts:14`），X 页面上实际是 `User-Name`：真实页面上后者 7 处匹配，前者 0 处；[market.md §4.3](./v2/market.md#43-区块与元素的指认现有做法与页面抽样) 引 Defuddle 的那一行写的也是 `User-Name`。匿名默认开启，但在真实 Chrome 里截出的 X 帖子只有头像换成了灰色占位，显示名与 @账号原样留在图里。单测 `entrypoints/content/screenshot/__tests__/detect.test.ts:10`、`:69` 断言的是同一个错误的名字，所以一直是绿的。不符合 [screenshot.md §3](./v2/screenshot.md#3-匿名与预览)：DOM 匿名默认开启，X 用稳定的 `data-testid` 识别身份元素。

### P3

| 编号  | 问题                                                                                                                                                | 位置                                                                    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| P3-1  | 截图提示条渲染成“Esc to cancelAAnonymize: on”：三段文字直接拼接，没有分隔。第一轮 P2-2 判断为两条提示绝对定位重叠，实际是同一条提示里缺空格与分隔符 | `entrypoints/content/screenshot/index.ts:344`                           |
| P3-2  | 英文没有单复数：“1 entries”“1 highlights”“1 screenshots”“Its 1 highlights go with it”；行首类型标签用复数“Clips”“Screenshots”                       | `utils/ui-text.ts:152`、`203`、`205`、`219`；`utils/entry-icons.tsx:35` |
| P3-3  | 选区菜单的 Enter 执行的是菜单内部记录的序号，不是当前有焦点的按钮；光标浏览下方向键能把焦点移走，Enter 仍执行原来那项                               | `entrypoints/content/selection-menu.ts:82`                              |
| P3-4  | 区块胶囊或区块模式进入的截图不记为“上次取景框”（元素路径没有写取景框记录）                                                                          | `entrypoints/content/screenshot/index.ts:939`                           |
| P3-5  | 剪藏提示没有 live region，读屏听不到“Clipped”；3.2 秒后自动消失，悬停或聚焦时不暂停                                                                 | `entrypoints/content/clip-flow.ts:122`                                  |
| P3-6  | 截图画廊格子的读屏名称只有标题，没有来源                                                                                                            | `entrypoints/library/App.tsx:938`                                       |
| P3-7  | 设置里水印位置的四个选项只有箭头“↖ ↗ ↙ ↘”，没有文字                                                                                                 | `entrypoints/library/settings-view.tsx:172`                             |
| P3-8  | 区块模式的摘要取单元全部文字，常以页面界面开头（Wikipedia“Toggle the table of contents”、Docusaurus 的面包屑）                                      | `entrypoints/content/blocks.ts` 的 `candidateSummary`                   |
| P3-9  | 阅读视图里链接形式的小标题（jvns.ca 的 `### [标题](#锚点)`）显示成正文字号的下划线链接，看不出是标题                                                | 资料库的 Markdown 样式                                                  |
| P3-10 | 资料库导航地标的名称借用了“在资料库中打开”的按钮文案（`library.openLibrary`），英文是“Open in library”；地标应以资料库命名                          | `entrypoints/library/App.tsx:510`                                       |
| P3-11 | 剪藏提示固定在右下角，不避让页面自己的浮动按钮：X 上盖住“Chat”按钮（55×36），持续 3.2 秒                                                            | `entrypoints/content/content.css:84`                                    |
| P3-12 | 已打开的资料库页不实时反映新剪藏：第三轮在用户 profile 里开着库页剪藏 Medium 文章，列表不更新，`Cmd+R` 后才出现（第三轮发现，见 7.6）               | `entrypoints/library/App.tsx` 的列表查询                                |

### 第一轮其余结论的复核

| 第一轮                                  | 本轮                                                                                                                              |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| P2-1 地址栏有焦点时页面键被地址栏吃掉   | 未复核：需要真实快捷键。机制上成立（命令不受焦点影响，页面却没有焦点），建议在会话开始时检查 `document.hasFocus()` 并提示         |
| P2-3 截图取景界面与页面内容叠加         | 不算缺陷：遮罩、选区条与确认条按 [screenshot.md](./v2/screenshot.md) 的设计叠在页面上；有具体遮挡的页面再报                       |
| P2-5 Wikipedia 的整篇剪藏带进募捐横幅   | 未复现（本轮没有出现横幅，横幅随活动出现）；本轮看到的是每节的“[edit]”链接与没有一节，已并入 P2-3 与 3.6                          |
| P2-6 paulgraham.com 识别不到任何区块    | 已知限制：[market.md §4.3](./v2/market.md#43-区块与元素的指认现有做法与页面抽样) 写明表格布局、没有 `<p>` 的页面只能用选区剪藏    |
| P3-1 截图条目的列表缩略图破图           | Chromium 153 上缩略图正常。真实 Chrome 的资料库里，第一轮留下的 4 张截图有 2 张（都来自 X）缩略图基本是空白，与 P1-2 的空白图一致 |
| P3-2 创建第一条高亮后导航计数短暂显示 2 | 未复现：颜色点、`h`、`Shift+H` 三种方式，计数都是 0 → 1，刷新后仍为 1                                                             |

## 5. 留给真实 Chrome 的项

第三轮（第 7 节）之后的状态：

1. **真实断网的场景 A**：✅ 已完成（7.3）。干净 profile（"AnnHub Test"）+ 真实断 Wi-Fi，全部 Then 满足，导出文件名 `AnnHub-export-2026-10-11.zip`。
2. **P1-1 复现**：✅ 已尝试（7.2）。用户 profile（混合数据）10 轮、干净 profile“有截图”10 轮 + “只有剪藏”10 轮，共 30 轮未复现；Crashpad 无新转储。
3. **Medium**：2/3 完成（7.5）。第三篇被 Cloudflare 人机验证拦住：人工过一次验证后即可继续测。
4. **VoiceOver**：未做（按用户指示本轮跳过语音类项）。区块模式的“类型 · 摘要”播报；选区菜单出现时有没有提示；剪藏提示；阅读视图里的高亮；列表行的类型、标题、来源。
5. **快捷键**：✅ 已完成（7.4）。地址栏有焦点时 `Cmd+Shift+S` / `Cmd+Shift+E` 都能启动会话，但 Esc 被地址栏吃掉，点一下页面拿回焦点才能退出——第一轮 P2-1 成立，建议照旧（会话开始时检查 `document.hasFocus()` 并提示）。
6. **亮暗外观**：✅ 已完成（7.6）。系统外观 Light ↔ Dark 切换，资料库跟随，版式一致，暗色下抽屉正常；3.4 的对比度结论与真机一致。
7. **产品负责人通读**落地页、隐私政策与服务条款：未做，留给人。

## 6. 复现方法

- 构建：`npm run build`；脚本用 Playwright 的 `chromium.launchPersistentContext`，参数 `--disable-extensions-except=<.output/chrome-mv3>`、`--load-extension=<同上>`，键盘选择另加 `--enable-caret-browsing`。
- 快捷键：从扩展的 service worker 里对目标标签页的顶层 frame 发 `{ type: 'TRIGGER_SCREENSHOT' }` 或 `{ type: 'TRIGGER_BLOCK_MODE' }`，与 `e2e/helpers.ts` 的做法相同。
- 断网：页面载入后 `context.setOffline(true)`，并在 `context.on('request')` 记录断网期间的全部请求。
- 覆盖统计与 Markdown：把扩展的识别与转换代码打包注入页面（MDN 需要穿过 shadow root 找代码块），按 3.5 的段落定义统计，并把文章、一节、代码块各转一份 Markdown 存档。
- 读屏：`locator.ariaSnapshot()` 取无障碍树；对比度按 WCAG 公式取元素的计算颜色与第一个不透明的背景。
- 截图内容：对预览的 canvas 取 `getImageData`，统计白色、深色像素与不同颜色的数量。元素截图的原因用同版本 html-to-image 单独对照（离屏容器 / 根节点样式覆盖 / 屏幕内）。
- 真实 Chrome：Claude in Chrome 操作网页；识别与 Markdown 用同样的代码打包后经页面脚本注入；延迟在页面里用 MutationObserver 与 `performance.now()` 记录。

## 7. 第三轮：真实 Chrome 复核（2026-10-11 下午）

用 computer use（macOS 辅助功能 + 系统级事件）直接操作用户的 Chrome 154，把第 5 节里除 VoiceOver、产品负责人通读外的项全部执行。测试只做验证，未改任何代码；结束时系统外观、网络、用户 profile 的数据都已恢复原状。

### 7.1 方法

- 被测构建与 1、2 轮相同（`main` `0a843e2` 的 `.output/chrome-mv3`）。用户 profile（`cglpagelldbmcnggfmbmlegkkpgaipbh`）之外，新建了干净 profile “AnnHub Test”（不装其他扩展），从 `$TMPDIR/annhub-ext-test` 副本以“加载已解压的扩展程序”装入（扩展 ID `laghhikflmimmabkfakfgdafhleebemh`）。
- 真实断网：`networksetup -setairportpower en0 off`（免 sudo 已验证）。本机默认路由走本地代理 VPN（utun6 叠在 en0 上），断 Wi-Fi 即整机断网，所以每个断网窗口都封装在一个本地执行单元里（执行期间不依赖网络），并预置看门狗定时器在超时后强制恢复 Wi-Fi；每段结束显式恢复并验证连通。
- 键盘与点击都是系统级事件：`chrome.commands` 快捷键（`Cmd+Shift+S` / `Cmd+Shift+E`）真实触发；文字选择用双击选词（光标浏览 F7 的键盘路径也验证过选区菜单可达）。
- 剪贴板用 `osascript -e 'clipboard info'` 检查类型与字节数；下载文件在 `~/Downloads` 核对。

### 7.2 P1-1 定向复现：30 轮未复现

| 组  | 环境                                     | 数据                     | 结果         |
| --- | ---------------------------------------- | ------------------------ | ------------ |
| A   | 用户 profile（装有其他扩展，Chrome 154） | 8 剪藏 + 4 截图（混合）  | 10/10 无崩溃 |
| B   | 干净 profile “AnnHub Test”（Chrome 154） | 2 剪藏 + 1 截图 + 1 高亮 | 10/10 无崩溃 |
| C   | 同上，删掉截图条目后                     | 只有剪藏 + 高亮          | 10/10 无崩溃 |

每轮都是“点行 → Read → Back → 切导航”（截图条目为“点行 → Image preview → Esc”）。测试前后 Crashpad 目录无新转储（最新仍是 10-11 02:03–02:05 的 4 份）。结论与处置见 P1-1：未复现、未改代码，保持观察。

### 7.3 真实断网的场景 A：全流程通过

环境：干净 profile、jvns.ca《Importing a frontend Javascript library without a build system》、真实断 Wi-Fi（断网窗口内 `fetch` 外网失败确认真离线）、每段结束恢复网络并验证连通。

| 步骤（[examples.md §3](./v2/examples.md#3-验收场景) 场景 A） | 实测（全部发生在真实断网期间）                                                                                                                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 剪藏一段选中的文字                                           | 双击选词 → 选区菜单（Clip / Screenshot）→ Clip，提示 “Clipped · Undo · Edit”                                                                                                                       |
| 剪藏一个区块                                                 | `Cmd+Shift+E` 区块模式 → Enter，整篇入库，提示同上                                                                                                                                                 |
| 截一张图并点“复制”                                           | `Cmd+Shift+S` → 拖 500×320 → Enter → Copy：剪贴板出现 `«class PNGf», 180384`（另有 Chrome 复制的 AVIF/GIF/JPEG 等多格式）；再点 Confirm 入库                                                       |
| 打开区块那条，高亮一句话                                     | 阅读视图正文双击选词 → `H`，计数 0 → 1；`Cmd+R` 刷新后仍是 1（第一次双击落在非正文区未成高亮，滚到正文后成功——不是产品缺陷）                                                                       |
| 搜索                                                         | `needed` 命中 2 条（选区那条与包含它的整篇）                                                                                                                                                       |
| 导出                                                         | `~/Downloads/AnnHub-export-2026-10-11.zip`：两份剪藏 Markdown（第二次导出后选区那份带 `==provide==` 高亮标记）、一份截图 Markdown 与一张 750×480 PNG（= 500×320 × 1.5 dpr），`../assets/` 链接有效 |

新安装状态同样核过：干净 profile 首次打开资料库，All 视图空状态 “0 entries”、Screenshots 空状态 “No screenshots yet — Ctrl/Cmd+Shift+S to drag one.”，均为英文。导出文件名偏差（3.1）就此关闭：真实 Chrome 里下载文件名就是 `AnnHub-export-YYYY-MM-DD.zip`（用户 profile 与干净 profile 两次导出一致；重名时 Chrome 加 ` (1)` 后缀）。

### 7.4 地址栏获焦时的快捷键（第一轮 P2-1 复核）

真实键盘、Abramov 文章页：`Cmd+L` 聚焦地址栏 → `Cmd+Shift+S`，截图会话正常启动（命令触发与焦点无关）；但此时 Esc 无法退出会话（键被地址栏吃掉），`Cmd+Shift+E` 的区块模式同样：能启动、Esc 无效。点一下页面拿回焦点后 Esc 正常退出。建议不变：会话开始时检查 `document.hasFocus()`，失焦时在提示条里说明。

### 7.5 Medium 补测（2/3 页）

用户已人工过过 Cloudflare 验证，Abramov 与 Karpathy 两页直接可测；第三篇导航时再次出现人机验证，按规则不代点。

| 项                   | 实测                                                                                                                                                                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 区块识别（Abramov）  | 区块模式起点 Section，`↑` 一步到 Article；Article 存在且整篇剪藏 Markdown 覆盖全文（192 个文本块，从导语到文末），按 3.5 的口径计达标 → 覆盖 30/33                                                                                                                                                        |
| 区块识别（Karpathy） | Tab 在 6 个 h2 小节（“Ongoing transition”“The benefits…”“The limitations…”“Programming in the 2.0 stack” 等）之间移动；`↓` 进不去小节内部（P2-1，9/9 页）                                                                                                                                                 |
| 整篇剪藏（Abramov）  | 成功，Markdown 完整可读：标题、作者、日期、正文、列表。**无** Clap / Share / Subscribe / Listen / Follow / Top highlight / 标签残留；残留两处页面界面：文末登录表单（“Remember me for faster sign in”×2）与订阅框（“Get Dan Abramov's stories in your inbox”）；“3 min read”与日期粘连无分隔（P3-1 同类） |
| 一节剪藏（Karpathy） | “The limitations of Software 2.0” 一节单独剪藏，Markdown 完整（4 段正文），无残留                                                                                                                                                                                                                         |
| 代码块               | 未验证：区块模式键盘下不到代码块（P2-1），胶囊悬停在本轮工具下不可靠（无法产生真实的悬停停顿）                                                                                                                                                                                                            |
| 选区菜单             | 正常：双击选词后出现 Clip / Screenshot 菜单                                                                                                                                                                                                                                                               |
| 摘要                 | Article/Section 的状态摘要以 Medium 界面文字开头（“5·Top highlight211ReactReduxJavaScript…”），P3-8 在 Medium 同样存在                                                                                                                                                                                    |

### 7.6 亮暗外观与其他观察

- 系统外观 Light → Dark：资料库整体切换，左导航 + 内容 + 抽屉版式不变；暗色下当前导航项、“Export content”按钮、强调色文字都是紫色填充/紫字，即 3.4 测过对比度不足（3.05–4.38:1）的那几处，结论与真机一致。测试后已切回 Light。
- **新观察（P3-12）**：开着资料库页时在别的标签剪藏，库页列表不更新，重载后才出现。
- 用户 profile 数据保护：测试开始前先导出了一份备份 `~/Downloads/AnnHub-export-2026-10-11-user-backup.zip`（12 条目）；本轮在用户 profile 里产生的两条 Medium 测试剪藏测完即删；上午遗留的 3 条 X 测试剪藏（@AnthropicAI、@claudeai ×2）按第一轮报告的说法可删，留用户自行处理。
- 干净 profile “AnnHub Test” 与 `$TMPDIR/annhub-ext-test` 副本保留（可随时手动删除），复现方法见第 6 节与 7.1。
