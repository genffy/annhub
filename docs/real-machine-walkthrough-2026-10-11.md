# AnnHub 扩展真机测试报告（2026-10-11）

更新时间：2026-10-11

本报告记录 [roadmap §5](./v2/roadmap.md#5-未决验收项) 四个未决验收项的第二轮走查。同日的第一轮（初级）在真实 Chrome 里点过一遍，结论没有复核；本轮先把能脚本化的部分在加载了扩展的 Chromium 里逐项重跑并量化，再用 Claude in Chrome 在用户的 Chrome 154 里补测 X、截图与延迟（3.9）。第一轮的每条结论都在第 4 节标明复核结果；仍要人来做的项列在第 5 节。测试只做验证，未改任何代码。

同日下午的第三轮（第 7 节）用 computer use 直接操作真实 Chrome，把第 5 节里除 VoiceOver、产品负责人通读之外的项全部执行：真实断网的场景 A 在干净 profile 里全流程通过（导出文件名确认为 `AnnHub-export-YYYY-MM-DD.zip`），P1-1 三组共 30 轮循环未复现，Medium 补测 2/3 页（第三篇被 Cloudflare 人机验证拦住，按规则不代点）。

修复轮（`fix/walkthrough-issues` 分支）：除 P1-1（未复现、无根因）外的全部 P1/P2/P3 已修复，751 条单测与 165 条 E2E 全绿；每项的修法与验证见第 4 节各项的“修复”行。

修复轮复核（第 8 节）在同样的自动化浏览器里逐项重跑。多数修复生效；P2-1 没有生效，P2-6 的初始焦点不稳定，P2-7、P2-8 各留一处，另有几项新发现。这四项已在复核时修好并重测（8.3）。复核时还修了截图会话的几处，把匿名改成头像、名字与账号可以分别选择，并把资料库的列表改成了卡片。仍要在真实 Chrome 与读屏里做的项，连同修复轮的回归，写成了可执行的场景：[e2e/real-chrome-scenarios.md](../e2e/real-chrome-scenarios.md)。

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

四项各自要关闭，需要（修复轮复核后，见第 8 节；括号里是 [e2e/real-chrome-scenarios.md](../e2e/real-chrome-scenarios.md) 的场景）：

- R1 新安装到导出：**已关闭**。
- R2 键盘与读屏：P2-5 已修并复核。复核时没有生效或留了尾巴的 P2-1、P2-6、P2-7、P2-8（8.2）已修，在自动化浏览器里通过（8.3）。剩真实 Chrome 的键盘回归（FX-3、FX-5、FX-7、FX-8）。VoiceOver 实听取消（10-12 决定）：读屏名称与播报由自动化无障碍树断言验收。
- R1 区块剪藏：P1-2、P2-3、P2-4 已修并复核（8.1；MDN 正文段落上胶囊仍擦到吸顶按钮 57×2）。剩 Medium 第 3 篇（原先给的地址不是 Medium，见 8.2）与真实 Chrome 回归（MD-1、FX-1、FX-6、FX-11）。
- 对外页面：P2-10、P2-11 已修（隐私政策与 permissions.md 同步）。剩导出文件名的两处出入（8.2）与产品负责人通读（RD、OP-3）。

不在这四项里、但应尽快修的：P2-12。截图的匿名默认开启，X 上却只盖住头像，名字与账号留在图里。修复轮已修，登录态 X 上的效果待真机（FX-2）；复核时把匿名范围做成了可选（8.3）。

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
- 修复轮：无根因，不动代码。保持观察，随下一轮真机回归再试。

**P1-2 元素截图在所有页面都是空白**（第一轮 P1-2 只报了 x.com；本轮复现并定位）

- 范围：区块胶囊的“Shot”、区块模式的 `S`、截图会话里单击选元素，三条路径都走元素截图，预览只有底色。真实 Chrome 154：X 的帖子、danluu 的整篇文章（2400×12554，全白）。Chromium 153：Rust 手册与 Docusaurus 的代码块、danluu 的段落与整篇、jvns 的整篇，预览都只有一种颜色。3.2 里区块模式按 `S` 后“入库成功”的，入库的就是空白图。
- 原因：`captureElement`（`entrypoints/content/screenshot/element-capture.ts:56`）把克隆放进 `position: fixed; left: -10000px` 的离屏容器（同文件 64 行），再把容器本身交给 html-to-image；html-to-image 把容器的计算样式连同 `position`、`left` 写进 SVG，内容画到了图片左边 10000px 之外。用同版本 html-to-image（1.11.13）在同样的页面上对照：给根节点覆盖 `style: { position: 'static', left: '0', top: '0' }`，或把容器放回屏幕内，文字都正常出现。这个离屏容器从 v2 的第一个提交（7b6e21d，10-05）就在。
- 测试没发现：e2e 只检查区域截图的像素，没有测试看元素截图里有没有内容。
- 区域截图正常：场景 A；真实 Chrome 里在 X 上拖拽框选，得到 454×321、3176 种颜色的正常图片。第一轮说拖拽框选在 X 上也是白图，本轮没有复现。窗口不在当前桌面时，扩展按设计拒绝截取，提示“Only the visible tab can be captured”（[screenshot.md §2](./v2/screenshot.md#2-截取与像素处理)）。
- 另：同一文件的 `opaqueBackground`（19 行）把半透明背景当作不透明。X 悬停时帖子的背景是 `rgba(0,0,0,0.03)`，于是 X 上元素截图的每个像素都是 `(0,0,0,8)`，几乎透明。上面的问题修好后，这里也要改成取第一个不透明的背景。
- 修复：栅格化时给根节点覆盖回原点样式；`opaqueBackground` 只认 alpha 为 1 的颜色，找不到不透明背景时用白色。补了 e2e：单击元素路径的预览必须有真实内容（颜色数与前景占比），半透明背景的元素不得截成近透明（走查前的测试缺口）。

### P2

**P2-1 区块模式只用键盘下不到一节或代码块**（第一轮 P2-4 的扩展：从 MDN 一页扩到 8/8 页；第三轮 Medium 同样复现，9/9）

- 起点由 `firstVisibleChain`（`entrypoints/content/blocks.ts:333`）从视口顶部往下扫，第一个命中点通常只落在文章容器里，链只有 `[Article]` 一层；`↑` `↓` 只在这条链里换层级，Tab 只在同类单元之间跳（`moveToPeer`，`entrypoints/content/block-hover.ts:482`），页面通常只有一个 Article，于是原地不动。缺的是“进入子单元”的一步，或者起点直接取视口里第一个最小单元。
- Medium 的区块树是 `Article → Section×6` 两层：Tab 能在 6 个 h2 小节间移动并剪藏（7.5），但 `↓` 仍然进不去小节内部，代码块无法用键盘到达。
- 修复：`↓` 在最内层时进入该单元的第一个子单元链（`childChainOf`，描边单元内部扫描），链拼接在前面，`↑` 沿原路退出；单测与 keyboard-blocks E2E 守着。
- 修复轮复核：**没有生效**，5/5 页面 `↓` 没有反应。描边单元内部的探测取到的是区块模式自己的遮罩，见 8.2。

**P2-2 文章级覆盖差 1 页**：见 3.5。PostgreSQL 与 Simon Willison 没有 `main`、语义容器或常见类名，靠“文字密集的容器”也没有接住；Tailwind 没有文章级区块。

**P2-3 Markdown 丢代码、丢换行**

- MDN 的代码示例在 open shadow root 里：整篇 Markdown 0 个代码块（Using Fetch、Clipboard.write）；从代码块按“Parent”也上不去，因为 `candidatesFor` 沿 `parentElement` 走、在 shadow root 处停下（`entrypoints/content/blocks.ts:202`）。
- Overreacted：代码包在 `figure` 里，转换的 `figure` 分支只取图片与图注（`entrypoints/content/markdown.ts:318`），整篇 0 个代码块。
- Docusaurus：每行代码是一个 `display:block` 的 `span`，没有换行字符；`pre` 分支取 `textContent`（`entrypoints/content/markdown.ts:272`），整块挤成一行。
- 页面界面残留：见 3.6 末段。Medium 的整篇 Markdown 还带着文末登录表单（“Remember me for faster sign in”两行）与订阅框（“Get Dan Abramov's stories in your inbox”），“3 min read”与日期粘连无分隔（7.5）。
- 修复：`pre` 按行元素（`token-line`、display:block）恢复换行；`figure` 分支转出其中的代码块；空 shadow host 展开其影子树，`candidatesFor` 沿 `composedParent` 穿过边界；界面残留按整块或链接文案剔除（edit/views/duration/sign-in/订阅框等短语表），只对“整块就是这个短语”生效，不碰正文。

**P2-4 胶囊盖住页面按钮**（见 3.7）

- `capsuleAreaOccupied`（`entrypoints/content/block-hover.ts:334`）在胶囊范围里取 5×3 个点，横向间隔约 44px，比常见的 30px 图标按钮宽，代码块右上角的按钮正好落在两点之间；`isPageControl` 不把 `summary` 当控件；四个角都被占时退回右上角（同文件 321 行）。
- 修复：探测步距加密到 24px（按胶囊尺寸自适应网格）；`summary` 计为控件；四角全占时沿上边向左滑动找空位，不再原地坐下。

**P2-5 选区菜单的“截图”对键盘用户是死路**

- `onScreenshot` 先清掉选区，再以拖拽 / 单击模式开会话（`entrypoints/content/index.tsx:60`），没有把选区的范围带进去，也没有键盘可用的下一步。可以把选区外框作为待确认的选区（Enter 确认），或在提示里指向区块模式。
- 修复：选区外框现在作为待确认取景框带进会话（Enter 确认、方向键微调、Esc 取消），键盘不是死路。

**P2-6 截图编辑态不接管焦点，保存没有播报**

- 编辑态出现后焦点留在页面，工具栏挂在文档末尾，要先经过页面全部链接。遮罩下的页面链接仍可聚焦：danluu.com 上区块模式按 `S` 后按一次 Tab 落在页面第一个链接，再按 Enter 页面跳到 Wikipedia，截图与标注全部丢失，离开前没有任何确认——拦截页面动作的 `onSwallowPageAction`（同文件 309 行）在编辑态直接放行。[extension.md §7.2](./v2/extension.md#72-可访问性) 要求截图工具栏的主流程只用键盘能完成：44 次 Tab 能到，但途中任何一次在链接上按 Enter 都会丢掉截图，所以判为不通过。保存成功后会话直接关闭（`confirmSave`，`entrypoints/content/screenshot/index.ts:1273`），读屏没有任何反馈。
- 建议：编辑态出现时把焦点移进工具栏，Tab 限制在工具栏与美化面板之内，Esc 照旧退出。
- 修复：预览出现时焦点落在工具栏第一个按钮；`Tab` 在会话自己的控件间循环，不再走到被遮罩的页面（文字输入框保留浏览器默认 Tab）；保存成功经文档级 `role=status` 播报“Screenshot saved”。
- 修复轮复核：`Tab` 不出会话、保存有播报，这两项生效；初始焦点不稳定，区域截图 2/8 次、选区菜单 3/7 次停在 `body`，见 8.2。

**P2-7 高亮不读“高亮，颜色名”**

- 高亮外层是 `role="button"` 的 `span`（`entrypoints/library/markdown-view.tsx:318`），名称就是原文；颜色只体现在 class 上。高亮页的列表与右栏同样没有颜色名。
- 修复：正文的高亮标记与高亮视图的行的可访问名称都改为“高亮，{颜色}：原文”（`reading.highlightLabel`）。
- 修复轮复核：中文正确；英文是“Highlight, Yellow：原文”，冒号写死成全角，见 8.2。

**P2-8 暗色主题对比度不足**（见 3.4）

- 设计稿暗色主题把填充色与文字色分开：`--brand: #7a55d1`（白字 5.19:1）、`--brand-text: #b9a3f2`（在页面底色上 8.10:1），见 `docs/design/v2/css/tokens.css:93`。产品的 `styles/tokens.css:31` 只有一个 `--ann-accent: #8a63d2`，既当填充又当文字。
- 修复：暗色拆为 `--ann-accent: #7a55d1`（填充）与 `--ann-accent-text: #b9a3f2`（文字），六处文字用法（当前导航项、行内计数、链接、阅读视图链接、当前标签、指南卡）换用文字 token；亮色两值相同，行为不变。
- 修复轮复核：上表三处都过了 4.5:1；暗色下行首类型标签“Clip”与阅读视图的“Highlights · 1”仍是 2.58:1，见 8.2。

**P2-9 Chrome 的“扩展程序选项”里是挤扁的资料库**

- `wxt.config.ts:33` 写了 `options_ui.open_in_tab: true`，但构建出的 manifest 是 `open_in_tab: false`、`page: options.html`：WXT 按 `entrypoints/options/index.html` 生成这一项，配置里的值没有生效。选项页随后跳到 `library.html#/settings`，于是在 chrome://extensions 的小对话框里显示整个应用壳。在选项页 HTML 里声明在新标签页打开即可（并改掉配置里不生效的那段）。
- 修复：配置块删除，选项页 HTML 以 meta 声明；重建后 manifest 为 `"options_ui":{"open_in_tab":true,"page":"options.html"}`。

**P2-10 落地页的导出演示与产品不符**：`website/lib/copy/en.ts:347` 起的导出对话框文案与 `AnnHub-export.zip`，对照产品的一键导出与 `AnnHub-export-YYYY-MM-DD.zip`；快速编辑演示的“Saved on blur”（同文件 266 行）产品里没有。

- 修复：导出演示重写为产品的一键导出——点击后导航里出现一行提示（“Export complete · N clips, N screenshots; 0 missing images · AnnHub-export-YYYY-MM-DD.zip · written to your downloads”），无对话框；快速编辑演示删掉“Saved on blur”。中英文案与类型同步，`cd website && npx tsc --noEmit` 通过。

**P2-11 隐私政策没有覆盖网页 `sessionStorage` 里的取景框记忆**

- `entrypoints/content/screenshot/selection.ts:206` 起把上次取景框（元素选择器、页面坐标、尺寸、边距、路径）写进网页自己的 `sessionStorage`，网站脚本可读，也就能知道用户用 AnnHub 截过页面上的哪一块。隐私政策说数据都在“IndexedDB and chrome.storage.local”，[permissions.md §1](./v2/permissions.md#1-数据边界) 也没有提。二选一：改存到扩展自己的会话存储，或在两处写明。
- 修复：选了改存——记忆移到 `chrome.storage.session`（键含页面 origin+path，`pagehide` 清除不再需要），后台设 `TRUSTED_AND_UNTRUSTED_CONTEXTS` 让内容脚本可写；`permissions.md` §1 与隐私政策页（中英）同步写明。单测断言 `sessionStorage.length === 0`。

**P2-12 X 截图的匿名漏掉名字与账号**

- 身份元素的选择器是 `[data-testid="User-Names"]`（`entrypoints/content/screenshot/detect.ts:14`），X 页面上实际是 `User-Name`：真实页面上后者 7 处匹配，前者 0 处；[market.md §4.3](./v2/market.md#43-区块与元素的指认现有做法与页面抽样) 引 Defuddle 的那一行写的也是 `User-Name`。匿名默认开启，但在真实 Chrome 里截出的 X 帖子只有头像换成了灰色占位，显示名与 @账号原样留在图里。单测 `entrypoints/content/screenshot/__tests__/detect.test.ts:10`、`:69` 断言的是同一个错误的名字，所以一直是绿的。不符合 [screenshot.md §3](./v2/screenshot.md#3-匿名与预览)：DOM 匿名默认开启，X 用稳定的 `data-testid` 识别身份元素。
- 修复：选择器与两处单测改为 `User-Name`。X 上的实际遮盖效果待真机回归（登录态页面）。
- 修复轮复核：自动化浏览器没有登录态的 X，仍待真机（场景 FX-2）。复核时另加了“遮住哪些”的设置，见 8.3。

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

P3 全部已修复（修复轮）：P3-1 提示条以 “ · ” 分隔；P3-2 英文单数在 `uiText` 出参处统一（“1 entry”“1 highlight”“1 clip”、行首类型标签用单数键）；P3-3 菜单 Enter 改为跟随当前焦点按钮，无焦点时不拦；P3-4 区块路径的元素也写取景框记录；P3-5 剪藏提示挂 `role=status` 且悬停/聚焦暂停 3 秒倒计时，失败提示为 `role=alert`；P3-6 画廊格子的名称补上来源；P3-7 水印位置选项带文字（“右上 ↗”等）；P3-8 摘要从单元第一个正文块起读；P3-9 `.md-view` 标题定字号、标题内链接继承标题外观；P3-10 导航地标改名 “Library”；P3-11 剪藏提示改底部居中，不再压页面右下角的浮动按钮；P3-12 后台在写入成功后经 `BroadcastChannel` 广播，打开中的库页自动刷新列表。

修复轮复核：P3-1 只修了一半，分隔符有了，`A` 与后面的文字仍连成“AAnonymize: on”，复核时补了空格（8.3）；P3-3、P3-9 没有量；其余通过（8.1）。

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

第三轮（第 7 节）之后的状态。修复轮复核之后仍要做的项，连同修复轮的回归，写成了可执行的场景：[e2e/real-chrome-scenarios.md](../e2e/real-chrome-scenarios.md)，它的第 2 节列出每个场景需要的能力。

1. **真实断网的场景 A**：✅ 已完成（7.3）。干净 profile（"AnnHub Test"）+ 真实断 Wi-Fi，全部 Then 满足，导出文件名 `AnnHub-export-2026-10-11.zip`。
2. **P1-1 复现**：✅ 已尝试（7.2）。用户 profile（混合数据）10 轮、干净 profile“有截图”10 轮 + “只有剪藏”10 轮，共 30 轮未复现；Crashpad 无新转储。
3. **Medium**：2/3 完成（7.5）。第三篇被 Cloudflare 人机验证拦住：人工过一次验证后即可继续测。3.6 里给的第三篇地址（`@dan_abramov/before-you-memoize`）不是 Medium 文章，改用场景 MD-1 的地址（8.2）。
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

## 8. 修复轮复核（2026-10-11 晚）

被测构建：`fix/walkthrough-issues` 的 `5a6da51`（修复轮最后一个提交）；8.3 的改动在它之上。环境与方法同第 1、6 节的自动化浏览器（Chromium 153，无头，1280×900，`en-US`），页面取 3.5–3.7 的抽样。没有登录态的 X，没有读屏实听；这两类与其余真机项写进了 [e2e/real-chrome-scenarios.md](../e2e/real-chrome-scenarios.md)，场景里的“当前预期”就是本节的数字。

### 8.1 确认生效

| 项    | 实测                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| P1-2  | 元素截图有内容：danluu 一个段落 372 种颜色；区块模式 `S` 截 danluu 整篇（2400×13854），确认入库约 4 秒，jvns 约 1.3 秒；入库的图同样有内容 |
| P2-3  | MDN、Overreacted、Docusaurus、Rust 手册：围栏代码块数等于页面上可见的代码块数，逐行比对没有丢行或并行；“Edit this page”等界面短语没有残留  |
| P2-4  | Docusaurus、Rust 手册的代码块上，胶囊不再盖住按钮                                                                                          |
| P2-5  | 选区菜单 → Screenshot：待确认的取景框与选区外框每边相差不到 1 px；方向键微调、`Enter` 确认可用                                             |
| P2-6  | 25 次 `Tab` 都留在会话里；保存后播报“Screenshot saved”                                                                                     |
| P2-7  | 中文名称是“高亮，黄色：原文”                                                                                                               |
| P2-8  | 暗色：当前导航项 6.1、“Export content” 5.19、强调色文字 8.1、行的元信息 7.46；亮色没有低于 4.5:1 的文字                                    |
| P2-9  | 构建出的 manifest 是 `"options_ui":{"open_in_tab":true,"page":"options.html"}`                                                             |
| P2-11 | 网页的 `sessionStorage` 里没有扩展的键；“Last frame”照常可用，区块模式 `S` 的截图也会记下                                                  |
| P3    | P3-2、P3-4、P3-5、P3-6、P3-7、P3-8、P3-10、P3-11、P3-12 通过                                                                               |
| 延迟  | 选区菜单在 `pointerup` 之后 23 ms 出现；胶囊在指针停下之后 442 ms 出现                                                                     |

### 8.2 没有生效、不完整与新发现

- **P2-1 没有生效**：MDN、Rust 手册、Docusaurus、Overreacted、danluu 5 个页面，`↓` 都没有反应。直接原因：`↓` 在最内层时用 `childChainOf`（`entrypoints/content/blocks.ts`）在描边单元里取点探测，取到的是区块模式自己的遮罩（它接收指针事件，页面链接才不响应点击）。`refreshFromPointer`（`entrypoints/content/block-hover.ts`）探测前会临时关掉遮罩的 `pointer-events`，`↓` 这条路径没有。单测在 jsdom 里桩了 `elementFromPoint`，`e2e/page-shapes.spec.ts` 只测“先 `↑` 再 `↓` 走回原链”，都碰不到它。绕过遮罩之后再量，5 个页面里只有 Rust 手册能进入一层，另有几个原因，见 8.3。
- **P2-6 初始焦点不稳定**：区域截图 8 次里有 2 次、选区菜单 7 次里有 3 次，预览出现后焦点停在 `body`。按源码推断：工具栏用 React 19 的 `createRoot().render()` 渲染，提交是异步的；`showPreview` 在下一帧的 `requestAnimationFrame` 里找第一个按钮，React 还没提交时就找不到。复核时确认属实，已修，见 8.3。
- **P2-7 英文名称的冒号**：英文是“Highlight, Yellow：原文”。`entrypoints/library/markdown-view.tsx:323` 与 `entrypoints/library/App.tsx:802` 拼接时写死了全角“：”，应放进 `reading.highlightLabel`，按语言给出。已修，见 8.3。
- **P2-8 暗色还有两处 2.58:1**：一处是行首的类型标签“Clip”：`styles/chips.css` 的 `.type-clip` 用 `--ann-accent` 作文字色，叠在 `--ann-accent-soft` 上，应改用 `--ann-accent-text`。另一处是阅读视图里的“Highlights · 1”标签。已修，见 8.3。
- **P3-1 不完整**：分隔符有了，`A` 与后面的文字仍连成“AAnonymize: on”，`W` 的水印段同样。8.3 已补。
- **胶囊**：MDN 正文段落上，胶囊仍压住吸顶的“Switch color theme”按钮 57×2。
- **导出文件名**：
  - 文件名的日期是 UTC（`new Date().toISOString().slice(0, 10)`，`entrypoints/library/App.tsx:459`），ZIP 里 README 的“Exported at”是本地时间。本地日期与 UTC 日期不同的时刻，两者差一天。这一条按源码推断，场景 OP-3 验证。
  - [storage.md §6](./v2/storage.md#6-唯一的用户导出markdown-zip) 的目录树写 `AnnHub-export.zip`，产品与官网是 `AnnHub-export-YYYY-MM-DD.zip`。
- **上次取景框的范围**：记忆存在 `chrome.storage.session`，键是页面的来源 + 路径 + 查询，不区分标签页，离开页面也不清除。[screenshot.md §1.4](./v2/screenshot.md#14-可重复的取景框r3阶段-v-之后排期) 的契约是只存在这个标签页的这个网页里，导航到别的页面、关闭标签页或重启浏览器就清除。这一条按源码推断（场景 FX-10），要产品定：改契约，还是在键里加上标签页并在导航时清除。
- **Medium**：第 3 篇的地址（`@dan_abramov/before-you-memoize`）不是 Medium 文章，《Before You memo()》在 overreacted.io 上。场景 MD-1 改用《Making Sense of React Hooks》。“3 min read”与日期连写，修复轮没有处理。
- **Rust 手册**：mdBook 折叠起来的样板行（如 `fn main() {`）进了 Markdown。它们是可运行代码的一部分，记为观察。
- **文档**：[screenshot.md](./v2/screenshot.md) 说匿名与水印状态显示在“编辑界面底部的状态条”；实现里这条提示在取景时位于窗口顶部，进入编辑态就隐藏。

### 8.3 复核时修的

- **P2-1 区块模式用键盘进入子单元**：
  - 绕过遮罩之后，`↓` 仍有四处走不通：
    - 只在窗口里取点：引言占满窗口时（Overreacted、danluu）找不到一节。
    - 文档站的 `main`、`article` 与正文容器都识别成文章，内容几乎相同：按一次 `↓` 看上去没有变化，Docusaurus 要按三次。
    - 标题直接放在 `main` 里的页面（Rust 手册、danluu）根本没有一节：容器先被识别成文章，就不再看它的标题。
    - MDN 的代码在 open shadow root 里，`contains` 不跨边界，代码块被当成单元外面的东西滤掉。
  - `Tab` 只在同一种单元之间走：Overreacted 上 `↓` 落到引言里的引用后，只能在两个引用之间来回。[capture.md §6.2](./v2/capture.md) 说的是“同层”，D-27 的默认是同一档。
  - 现在：
    - `↓` 不再取点，按文档顺序走当前单元自己的内容（穿过 open shadow root）：从窗口处起，找不到就往下、再绕回开头，找到的单元滚动到可见。
    - 一次一层；文章先进入窗口所在的一节。同类、几乎装着它全部内容的外框不算一层。
    - 标题直接在文章容器里时同样分节；从容器开头一直到末尾的区间就是文章本身，不另算一节。
    - `Tab` 在同一档里走：帖子、代码块、表格、图、引用一档，一节一档，文章一档。嵌在小单元里的小单元（帖子里的图、图里的代码块）归 `↓`。
    - capture.md §6.2 与 US-CAP-14 补了“同层”和“进入”两条。
  - 实测（无头 Chromium、构建好的扩展、真实按键）：
    - MDN、Rust 手册、Docusaurus、Overreacted：从“文章”起 `↓` 进入一节，再 `↓` 到代码块（Overreacted 先到包着代码的“图”），`Enter` 入库的是围栏代码块。
    - danluu 没有代码块：`↓` 进入一节，再进入其中的引用；`Tab` 走遍 6 节。
  - 耗时：一次 `Tab` 要逐个识别同一档的单元，它们共用 `main` 这样的大祖先，所以在一次按键内缓存文字长度与 `article` 查询。Wikipedia《United States》（约 24 万个字符、2.2 万个元素）上 `Tab` 23–32 ms、`↓` 约 56 ms；不缓存时 `Tab` 要 0.7–0.85 秒。
- **P2-6 预览的初始焦点**：
  - 原因与 8.2 的推断一致。调试时预览出现后焦点停在 `body`，此时工具栏的 17 个按钮都已渲染：下一帧找按钮时 React 还没有提交。
  - 现在工具栏的第一次渲染同步提交（`flushSync`），下一帧一定找得到第一个按钮。
  - 新 E2E 连开 6 次截图预览（每次是新会话），每次都要求焦点落在工具栏上。旧代码 3 次运行都在第一次预览就失败；新代码 3 次运行都通过。
- **P2-7 高亮名称的冒号**：
  - `reading.highlightLabel` 按语言给出整句：中文“高亮，黄色：原文”，英文“Highlight, Yellow: 原文”。阅读视图与高亮列表两处拼接都改用它。
  - 界面文字的语法树检查（`utils/__tests__/ui-literals.test.ts`）原来只看模板字符串的第一段，只认汉字，所以漏掉了这处全角冒号。现在模板的每一段、`+` 拼接里的全角标点都会被拦下，对旧代码跑过，确认会失败。
- **P2-8 暗色剩下的两处**：
  - 类型标签“Clip”与阅读视图的当前标签改用文字用的强调色 `--ann-accent-text`，暗色下与当前导航项一样是 6.1:1。
  - 弹窗里同样写法的两处（当前图标栏项、标题行的链接按钮）一并改了。
  - 新 E2E 在亮色与暗色下逐个量资料库的类型标签与阅读视图的当前标签；弹窗的暗色用例加上这两处与类型标签。文字要求不低于 4.5:1，图标栏项按界面指示不低于 3:1。对旧样式跑过，确认会失败。
- **截图在设置到达之前就开拍**：设置是会话开始之后才到的。区块胶囊与区块模式 `S` 的截图随会话一起开始，旧代码只在“取景中”应用设置，于是这两条路径不认“截图默认匿名”和美化的默认样式。选区菜单交来的待确认取景框同样不认，`A` 在待确认时也没有反应。现在每次截取都先等设置到达。设置到达前用户已经按过 `A` 的，以用户为准。`A` 在待确认的取景框上可用。
- **元素截图的圆角**：克隆路径里，名字块的灰色占位在圆角处露出原元素的底色，夹具上是 48 个蓝色像素。克隆的身份元素现在也涂成同样的灰，与区域截图一致。
- **提示条**：补上 P3-1 的空格；头像、名字两种都不勾时，提示条不显示 `A`。
- **连拍被浏览器拒绝**：浏览器每秒只允许截取两次，一秒内的第三次被拒。后台把它当普通失败，界面显示“无法截取此页面”。
  - 怎么发现的：水印 E2E 的“三种尺寸”连拍三张，第三张有时落在一秒之内。两次全量运行各失败一次，单独运行时通过。
  - 现在的做法：后台对这种拒绝回单独的码，截图会话隔 400 ms 再要，最多三次。
  - 为什么在页面里等：测试环境里，worker 里的 `setTimeout(400)` 实测要 0.4–20 秒才触发，页面里的准时。
- **新增：匿名范围可选**（[screenshot.md §3](./v2/screenshot.md#3-匿名与预览)）：
  - 设置的“截图默认匿名”下面多了“遮住哪些：头像 / 名字与账号”，默认都勾。
  - 没勾的一种原样入图；关掉匿名时，也不为它预填马赛克。
  - `A` 仍是这一次截图的总开关。
- **新增：列表改成卡片**（复核时提的需求，[extension.md §2.3](./v2/extension.md#23-视图)）：
  - 全部、剪藏、截图三个视图原来是单列的行，宽窗口里大半空着。现在三处是同一个卡片网格，与原来的截图画廊同一种卡片：上面是预览（剪藏是正文的开头，截图是图片），下面是标题、标签、类型、来源与时间。列数随窗口宽度：1920 像素 6 列，1440 与 1280 像素 4 列，1024 像素 3 列，390 像素 1 列。下载与删除仍只在截图视图里。
  - 高亮视图按条目分成卡片，多列竖排。
  - 读屏：卡片的名称是标题、标签、类型、来源与时间，正文的开头是描述。
  - 对比度：暗色下卡片上的高亮数 7.34:1、来源与时间 6.77:1，亮色 7.31:1 与 5.5:1；8.1 的 8.1 与 7.46 量的是改版前的行。
  - 测试：`library-layout.spec.ts` 新增 3 条（卡片填满内容区、同一行等高、预览等高、摘要只露整行、读屏名称与描述，高亮卡片互不重叠），都对着坏样式跑过，确认会失败。资料库的其余 E2E 改用卡片的选择器；场景文档的附录 A 与 VO-9、VO-10、VO-12 一并改了。
- **测试**：
  - 单测：会话等设置、待确认取景框上的 `A`、两种都不勾、按种类遮盖与预填；后台把限额拒绝回成单独的码，会话等过这一秒再要，取消之后不再要。
  - P2-1：单测按页面形状各一条（标题在 `main` 里、文档站的外框、引用在第一个标题之上、窗口在一节中间、shadow root 里的代码、隐藏的内容、一节里的小节）；`page-shapes.spec.ts` 新增长文夹具，从文章 `↓` 到窗口下面的一节、再到图与代码，`Tab` 从图走到表格、退回第一个标题之上的引用。
  - E2E：`screenshot-anonymize.spec.ts` 6 条，在夹具的预览画布里数头像的红、名字的蓝；`screenshot-beautify.spec.ts` 新增胶囊截图带上保存的美化样式。
  - P2-6、P2-7、P2-8 的测试见上面各条。
  - 守着行为修正的断言（会话等设置、待确认时的 `A`、胶囊截图的匿名与美化、连拍的重试、P2-1 的每条规则、P2-6、P2-7、P2-8），都先对着改回旧行为的代码跑过，确认会失败。

### 8.4 对第 5 节的影响

第 5 节已关闭的项不变。仍开着的项与修复轮的回归，对应场景如下：

- 修复轮回归：FX-1 至 FX-12；FX-2 需要登录态的 X。
- Medium 第 3 篇：MD-1。
- 产品负责人通读：RD-1 至 RD-6。
- 地址栏焦点、P1-1 循环、导出文件名的时区：OP-1 至 OP-3。

P2-1、P2-6、P2-7、P2-8 已在复核时修好（8.3），对应场景 FX-3、FX-5、FX-7、FX-8 的“当前预期”是通过，仍要在真实 Chrome 与读屏里确认。
