# AnnHub 真实 Chrome 测试场景

> 适用于修复轮之后的构建（`fix/walkthrough-issues`）。场景只规定前置、输入、测量与通过标准，不规定用什么工具执行。
> 更新：2026-10-12（补 1.2 的 CUA 坐标限制与 `⌘A` 替代）。

[真机走查报告](../docs/real-machine-walkthrough-2026-10-11.md)第 5 节与第 8 节留下的项，在这里写成照着就能执行的场景。`npm run verify` 与 `e2e/*.spec.ts` 已经覆盖的行为不再重复；这里只剩自动化够不着的三类：真实站点（X、Medium、文档站）、只有操作系统才能产生的输入（全局快捷键），以及要人判断的通读。每个场景写明需要哪些能力（第 2 节），执行者按手里的工具先做能做的。

“当前预期”是对同一构建在自动化的 Chromium 153（无头，1280×900，`en-US`）上量得的值，或按源码推断（会注明）。真实 Chrome 上的结果与它不同，本身就是要报告的发现。

## 1. 通用要求

### 1.1 构建与安装

1. 在仓库根目录 `npm run build`，产物在 `.output/chrome-mv3`。源码变了必须重建。记下 `git rev-parse --short HEAD`，以及 `git status --short` 是否为空。
2. 品牌版 Chrome 137 起忽略命令行的 `--load-extension`：在 `chrome://extensions` 打开“开发者模式”，用“加载已解压的扩展程序”选 `.output/chrome-mv3`（或它的一份副本）。重建后在扩展卡片上点“重新加载”。记下扩展 ID，下文写作 `<ID>`。
3. 用专门的 profile；“新安装”类场景用全新 profile。要在日常 profile 里测时，先在资料库点“导出内容”留一份备份，测完删掉测试产生的条目。
4. 安装或重新加载扩展之后，已经打开的网页里没有新的内容脚本：先刷新被测页面。
5. Chrome 136 起，默认的用户数据目录不接受远程调试端口。需要经调试端口驱动浏览器时，用 `--user-data-dir` 指定单独的目录。

### 1.2 输入

- 扩展只认用户本人的输入（`event.isTrusted`）：页面脚本派发的点击、按键与选区事件一律被忽略，这是设计（[screenshot.md §2](../docs/v2/screenshot.md#2-截取与像素处理)）。所有操作都必须是可信输入：操作系统级的鼠标键盘，或经浏览器输入管线注入的事件（例如浏览器调试协议的鼠标、键盘事件）。在页面里执行 `element.click()` 或 `dispatchEvent` 不算操作。
- 全局快捷键 `Cmd/Ctrl+Shift+S`（截图）与 `Cmd/Ctrl+Shift+E`（区块模式）只由操作系统级按键触发；经浏览器输入管线注入的按键不会触发 `chrome.commands`。没有系统级按键时，用快捷键在后台发出的同一条消息代替“按快捷键”这一步，之后的操作仍要可信输入。做法：在 `chrome://extensions` 本扩展的卡片上点“service worker”，打开它的控制台，执行

  ```js
  // TYPE：'TRIGGER_SCREENSHOT'（截图）或 'TRIGGER_BLOCK_MODE'（区块模式）；URL_PREFIX：被测页面地址的开头
  const TYPE = 'TRIGGER_SCREENSHOT'
  const URL_PREFIX = 'https://x.com/'
  const tab = (await chrome.tabs.query({})).find(t => t.url?.startsWith(URL_PREFIX))
  await chrome.tabs.sendMessage(tab.id, { type: TYPE }, { frameId: 0 })
  ```

  记录里写明用的是哪一种。OP-1 只能用系统级按键。

- 截图会话与区块模式要求页面有键盘焦点。地址栏有焦点时会话也能启动，但 `Esc` 被地址栏吃掉（OP-1）。开始前先点一下页面空白处（不要点在链接上）。
- 只用键盘选中网页正文要先打开光标浏览（`F7`）。经 CUA（macOS 辅助功能）驱动时另有一条路：本机实测 CUA 按截图栅格坐标的点击/拖选会系统性偏移落点（疑似光栅→屏幕坐标被 DPR 换算两次，2026-10-12 第五轮走查 10 节），形成不了选区；替代做法是激活 Chrome 后发系统级 `⌘A` 全选——同样是真实选区，选区菜单照常出现，足以验收菜单与保存链路（无法验收“只选中一段”的场景除外，那些留给坐标输入可用的环境或人工）。
- 区块胶囊要求指针真的停下：最后一次移动之后保持不动至少 600 ms（设计约 400 ms）。
- 区域截图只拍当前窗口里显示着的标签页：窗口不在当前桌面、或截取时切走了标签页，扩展按设计拒绝截取（提示“Only the visible tab can be captured”）。

### 1.3 页面内测量

- 附录 A 是一段只读的测量代码：在被测页面的主环境里执行一次（DevTools 控制台默认的 `top` 上下文即可），之后调用 `window.__annTest` 上的函数，把返回值原样记进结果。它不派发事件，不改页面。页面刷新或跳转之后要重新执行。
- 附录 B 把扩展自己的区块识别与 Markdown 转换代码打包成 `window.__annhub`。`articleCoverage`、`codeLines`、`allCodeLines` 需要它：先执行附录 B，再执行附录 A。
- 对比度门槛是 4.5:1（[设计稿](../docs/design/v2/README.md)设计系统里的“对比度与尺寸”），`lowContrast()` 默认按它报。

### 1.4 记录

每个场景记一行：编号、执行时间、`__annTest.env()` 的输出（浏览器版本、语言、窗口、dpr、亮暗）、构建 commit、每条检查的实测值与结论（通过 / 不通过 / 无法执行及原因）。截图类场景另存预览或入库图片。结果按第 3–7 节的编号回填到[走查报告](../docs/real-machine-walkthrough-2026-10-11.md)当轮的章节（第 8 节起逐轮递增）。

### 1.5 停止与清理

- 遇到人机验证（Cloudflare、reCAPTCHA）就停下，交给人完成，不尝试绕过。
- 资料库页面崩溃（“Aw, Snap!”）时记下时间，按 OP-2 取崩溃转储，再继续。
- 改过的系统设置（外观、时区、网络）在场景结束时改回去，并写进记录。
- 日常 profile 里测试产生的条目在结束时删除。

## 2. 能力与顺序

| 能力                                         | 用到的场景                                |
| -------------------------------------------- | ----------------------------------------- |
| A 可信鼠标：移动、按下、拖拽、悬停停顿       | FX-1、FX-2、FX-4–FX-8、FX-10、FX-12、MD-1 |
| B 可信键盘：页面里的按键                     | FX-3–FX-5、FX-10、FX-12、MD-1             |
| C 全局快捷键：系统级按键，或 1.2 的后台消息  | FX-1–FX-3、FX-5、FX-10、MD-1              |
| C′ 系统级按键（后台消息不行）                | OP-1                                      |
| D 在页面主环境执行脚本                       | 除 RD、OP-1 外全部                        |
| E 打开并操作 `chrome-extension://` 页面      | FX-1、FX-2、FX-7–FX-9、FX-12、OP-2、OP-3  |
| F 改系统设置：外观、时区；读文件系统里的转储 | FX-8、OP-2、OP-3                          |
| H 已登录 X 的 profile                        | FX-2、FX-6 的 X 部分                      |
| I 人的判断：通读、目视、过人机验证           | RD 全部、MD-1、FX-2 第 8 步               |

建议顺序：FX-1、FX-2（截图主链路，数据风险最大）→ FX-3–FX-12 → MD-1 → OP → RD。

## 3. 修复轮回归

### FX-1 元素截图有内容（P1-2）

- 能力：A、C、D、E。
- 页面：`https://danluu.com/p95-skill/`；`https://jvns.ca/blog/2024/11/18/how-to-import-a-javascript-library/`；登录后 X 上任一帖子的详情页（可选）。
- 步骤：
  1. 打开页面，执行附录 A。
  2. 指针停在正文第二段上，等胶囊出现，点“Shot”（中文界面“截图”）。预览出现后执行 `__annTest.previewStats()`。按 `Esc` 退出。
  3. 区块模式（快捷键或后台消息）→ 按 `S`。预览出现后再测一次 `previewStats()`；点工具栏的确认（✓），记下从点击到会话消失的秒数。
  4. 打开 `chrome-extension://<ID>/library.html#/screenshots`，把刚入库的那张卡片滚进视口，执行附录 A，再执行 `__annTest.imageStats('.entry-card img')`。
- 通过：两次预览与入库图片都是 `distinctColors` > 50、`whiteShare` < 0.98、`transparentShare` < 0.01。
- 当前预期：通过。danluu 段落 372 种颜色；区块模式 `S` 截 danluu 整篇（2400×13854）确认入库约 4 秒，jvns 约 1.3 秒。

### FX-2 X 截图的匿名与匿名范围（P2-12，及新增的“遮住哪些”）

“遮住哪些”是设置里的两项：“头像”与“名字与账号”，默认都勾（[screenshot.md §3](../docs/v2/screenshot.md#3-匿名与预览)）。没勾的一种原样入图，关掉匿名时也不为它预填马赛克。

- 能力：A、C、D、E、H；第 8 步还要 I。
- 页面：登录后 X 上任一帖子的详情页（地址形如 `https://x.com/<账号>/status/<数字>`）。设置页是 `chrome-extension://<ID>/library.html#/settings` 的“截图默认匿名”一节。
- 前置：“截图默认匿名”开，“遮住哪些”两项都勾。
- 步骤：
  1. 打开帖子，执行附录 A。
  2. 截图快捷键 → 拖一个框，包住帖子头部（头像、显示名、@账号）和第一行正文。确认条出现后读页面顶部的提示条。
  3. 按 `Enter`。预览出现后不要滚动页面，执行 `__annTest.identityGray('[data-testid="User-Name"]')` 与 `__annTest.identityGray('[data-testid^="UserAvatar"]')`。按 `Esc` 退出。
  4. 设置页取消“名字与账号”，回到帖子页（不用刷新），重复第 2–3 步。
  5. 设置页勾回“名字与账号”、取消“头像”，重复第 2–3 步。
  6. 两项都勾。截图快捷键 → 拖框 → 确认条出现后按 `A`，提示条变成“匿名：关”→ `Enter`。数工具栏下方的“马赛克 1、马赛克 2…”（英文“Mosaic 1…”）。
  7. 取消“头像”，重复第 6 步。
  8. “截图默认匿名”关、“头像”不勾：指针停在帖子正文上等胶囊 → “截图”，目视预览。再把“截图默认匿名”打开，同样操作，目视。
- 通过：
  - 第 2 步：提示条是“拖拽选择区域，单击选择元素 · Esc 取消 · A 匿名：开”（英文“Drag to select an area, click to pick an element · Esc to cancel · A Anonymize: on”），`A` 与后面的字之间有空格。
  - 第 3 步：每个名字块 `grayShare` ≥ 0.9，每个头像 ≥ 0.8。
  - 第 4 步：名字块 < 0.1，头像仍 ≥ 0.8。第 5 步反过来。
  - 第 6 步：马赛克条数等于框里头像与名字块的个数（一条帖子的头部是 2）。第 7 步只数名字块。
  - 第 8 步：匿名关时头像与名字都原样；匿名开时头像原样，名字与 @账号是灰色占位。
- 当前预期：Chromium 153 上没有登录态的 X，未量。同样的行为在夹具上由 `e2e/screenshot-anonymize.spec.ts` 守着，全部满足。

### FX-3 区块模式用键盘进入子单元（P2-1）

- 能力：B、C；记录状态行文字即可，不需要脚本。
- 页面：`https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch`；`https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html`；`https://docusaurus.io/docs/markdown-features/code-blocks`；`https://overreacted.io/a-complete-guide-to-useeffect/`；`https://danluu.com/p95-skill/`。
- 步骤：
  1. 打开页面，点一下正文空白处。
  2. 进入区块模式，记下模式胶囊里的类型与摘要。
  3. 按 `↓`，记下类型；再按，直到不再变化。
  4. 按 `Tab` 几次，在同一档的单元之间移动（代码块、表格、图、引用是一档，一节一档）；按 `↑` 沿原路退回。
  5. 停在一个代码块上按 `Enter`：剪藏提示出现；资料库里这一条是一个围栏代码块。
- 通过：
  - 每个页面从“文章”起，第一次 `↓` 进入窗口所在的一节；窗口里没有一节时（引言占满窗口）进入下一节，并滚动到可见。
  - MDN、Rust 手册、Docusaurus、Overreacted 能用 `↓` 与 `Tab` 到达代码块（Overreacted 的代码包在“图”里，先到图、再 `↓`），第 5 步入库的是围栏代码块。
  - danluu 没有代码块：`↓` 进入一节后能再进入其中的引用，`Tab` 走遍各节。
- 当前预期：通过（无头 Chromium 153，构建好的扩展，真实按键，2026-10-11）：
  - MDN：一节“Using the Fetch API” → 代码块（在 shadow root 里）。
  - Rust 手册：一节“The Stack and the Heap”，`Tab` 两次到“Variable Scope” → 代码块。
  - Docusaurus：一节“Code title” → 代码块。
  - Overreacted：一节“TLDR”，`Tab` 到下一节 → 图 → 代码块。
  - danluu：一节“Overwatch”，`Tab` 走遍 6 节，第三节里 `↓` 到引用。
  - 四个有代码的页面，入库的都是围栏代码块。

### FX-4 选区菜单的“截图”（P2-5）

- 能力：A、B、D。
- 页面：jvns（FX-1 的地址）。
- 步骤：
  1. 执行附录 A，再执行 `const sel = __annTest.watchSelection()`。
  2. 拖选正文某一行（或 `F7` 后用 `Shift+→`），菜单出现后按两次 `Tab` 聚焦“Screenshot”，按 `Enter`。
  3. 确认条出现后执行 `__annTest.pendingFrame()` 与 `sel.read()`。
  4. 按一次 `→`：取景框右移 1 px。按 `A`：提示条变成“匿名：关”。按 `Enter`。
  5. 预览出现后执行 `__annTest.previewStats()`。
- 通过：第 3 步两个矩形每边相差 ≤ 1 px；第 4 步提示条随 `A` 改变；第 5 步有内容（同 FX-1 的标准）。
- 当前预期：通过。待确认的取景框上 `A` 在修复轮里没有反应，本轮已修。

### FX-5 截图编辑态的焦点与播报（P2-6）

- 能力：A、B、C、D。
- 页面：danluu（FX-1 的地址）。
- 步骤：
  1. 执行附录 A，再执行 `const focus = __annTest.watchFocus(); const live = __annTest.watchLive()`。
  2. 截图快捷键 → 拖框 → `Enter`。预览一出现就执行 `document.activeElement.closest('[data-ann-ui]')?.getAttribute('data-ann-ui')`。
  3. 连按 25 次 `Tab`，执行 `focus.read().outsideUi`。
  4. `Tab` 到确认（✓），按 `Enter` 入库，执行 `live.read()`。
  5. 第 1–3 步重复 8 次；再从选区菜单进入（同 FX-4 第 2 步）重复 7 次。统计第 2 步不是 `screenshot-toolbar` 的次数。
- 通过：第 2 步每次都是 `screenshot-toolbar`；`outsideUi` 为空数组；`live.read()` 里有“Screenshot saved”（中文“截图已保存”）。
- 当前预期：通过。`Tab` 不出会话、保存有播报，修复轮已通过。初始焦点曾不稳定（区域 2/8 次、菜单 3/7 次停在 `body`）：工具栏第一次渲染还没提交，下一帧就去找按钮。本轮改成同步提交，自动化浏览器里连开 6 次预览，3 次运行都落在工具栏上。

### FX-6 胶囊不盖住页面按钮（P2-4）

- 能力：A、D；X 部分还要 H。
- 页面与悬停对象：Docusaurus 代码块页的第一个代码块；Rust 手册 ch04-01 的第一个代码块；MDN Using Fetch 的一个代码块与一个正文段落；X 个人页时间线上的 3 条帖子。
- 步骤：执行附录 A；指针停在对象上，等胶囊出现，执行 `__annTest.coverOf()`。
- 通过：`covered` 为空数组，`inViewport` 为 `true`。
- 当前预期：Docusaurus、Rust 的代码块通过。MDN 正文段落上胶囊压住吸顶的“Switch color theme”按钮 57×2（`floating: true`），算残留问题。X 未量（修复轮把探测加密到 24 px，并在四角都占时沿上边找空位）。

### FX-7 高亮的读屏名称（P2-7）

- 能力：A、D、E。
- 步骤：
  1. 资料库里打开一条剪藏，点“Read”。在正文里拖选一句，点黄色。
  2. 在阅读视图执行附录 A，再执行 `__annTest.highlightA11y()` 与 `__annTest.cjkLeaks()`。
  3. 切到“Highlights”视图，同样执行。
  4. 中文界面（浏览器语言设为中文）再做一遍。
- 通过：英文名称形如“Highlight, Yellow: 原文”，中文形如“高亮，黄色：原文”；英文界面 `cjkLeaks()` 为空。
- 当前预期：通过。英文名称曾是“Highlight, Yellow：原文”（全角冒号写死在拼接里），本轮改由 `reading.highlightLabel` 按语言给出整句。

### FX-8 暗色对比度（P2-8）

- 能力：D、E、F。
- 步骤：
  1. 资料库里至少有 1 条剪藏（带 1 处高亮）与 1 张截图。系统外观切到暗色。
  2. 在 `#/all` 执行附录 A，再执行 `__annTest.libraryContrast()` 与 `__annTest.lowContrast()`。
  3. 打开那条剪藏的阅读视图，执行 `__annTest.lowContrast()`。
  4. 系统外观切回亮色，重复第 2–3 步。
- 通过：两种外观下 `lowContrast()` 都是空数组。
- 当前预期：通过。暗色下报告点名的几处是：当前导航项 6.1，“Export content”5.19；列表改成卡片后，卡片上的高亮数（强调色文字）7.34，卡片的来源与时间 6.77，亮色下这两处是 7.31 与 5.5。类型标签“Clip”与阅读视图的“Highlights · 1”曾是 2.58:1，本轮改用文字用的强调色，与当前导航项一样是 6.1；弹窗里同样写法的两处一并改了。亮色没有低于 4.5 的项。

### FX-9 Chrome 的“扩展程序选项”（P2-9）

- 能力：E。
- 步骤：`chrome://extensions` → 本扩展“详细信息”→“扩展程序选项”。
- 通过：在新标签页打开资料库的设置视图，不在扩展页里的小对话框中。
- 当前预期：构建出的 manifest 是 `"options_ui":{"open_in_tab":true,"page":"options.html"}`；真实 Chrome 里的表现未看。

### FX-10 上次取景框（P2-11、P3-4）

- 能力：A、B、C、D。
- 页面：jvns（FX-1 的地址）。
- 步骤：
  1. 执行附录 A。截图快捷键 → 拖框 → `Enter` → 确认入库。
  2. 执行 `Object.keys(sessionStorage)`。
  3. 再按截图快捷键：确认条应显示“Last frame · W × H”；按 `Enter` 直接进入编辑。按 `Esc`。
  4. 区块模式 → `S` → 确认入库。再按截图快捷键：“Last frame”的尺寸等于刚才区块的尺寸。按 `Esc`。
  5. 刷新页面，按截图快捷键，记下有没有“Last frame”。按 `Esc`。
  6. 新开一个标签页打开同一地址，按截图快捷键，记下有没有“Last frame”。再在原标签页导航到同站的另一篇文章，然后返回，按截图快捷键，记下有没有。
- 通过：第 2 步没有 `annhub` 开头的键；第 3、4 步符合；第 5 步有，第 6 步的两处都没有。契约见 [screenshot.md §1.4](../docs/v2/screenshot.md#14-可重复的取景框r3)：只存在这个标签页的这个网页里，导航到别的页面、关闭标签页或重启浏览器就清除。
- 当前预期：通过。第 6 步原先与契约不符：记忆不分标签页，离开页面也不清除。复核时改为由扩展后台按标签页保存，标签页导航到别的页面或关闭时清除，在自动化浏览器里通过。

### FX-11 Markdown 的代码与换行（P2-3）

- 能力：D。
- 页面：MDN Using Fetch；Overreacted 的 useEffect 指南；Docusaurus 代码块页；Rust 手册 ch04-01（地址见 FX-3）；`https://en.wikipedia.org/wiki/Zettelkasten`；任一 Next.js 文档页（例如 `https://nextjs.org/docs/app/getting-started/installation`）。
- 步骤：执行附录 B、附录 A，然后 `const r = __annTest.articleCoverage()`、`__annTest.allCodeLines()`，并在 `r.markdown` 里搜“Edit this page”“Was this helpful”“[edit]”。
- 通过：`r.pass` 为 `true`；`r.fencedBlocks === r.visiblePre`；`allCodeLines().withMissing === 0`；三个短语都搜不到。
- 当前预期：MDN、Overreacted、Docusaurus、Rust 四站通过，短语都没有残留。Rust 的 `hiddenTotal` 大于 0：mdBook 折叠起来的样板行（如 `fn main() {`）进了 Markdown。它们是可运行代码的一部分，记为观察，不算缺陷。

### FX-12 P3 回归

| 编号  | 检查                                                                       | 通过标准                                               | 当前预期                                                                |
| ----- | -------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------- |
| P3-1  | 截图快捷键后读提示条                                                       | 同 FX-2 第 2 步                                        | 通过（修复轮的分隔符之后 `A` 与文字仍连写成“AAnonymize”，本轮补了空格） |
| P3-2  | 资料库只有 1 条时看总数、类型标签与删除确认                                | “1 entry”“1 highlight”；类型标签“Clip”“Screenshot”     | 通过                                                                    |
| P3-3  | 选区菜单 `Tab` 到“Screenshot”，用光标浏览的方向键把焦点移到“Clip”，`Enter` | 执行的是“Clip”                                         | 未量                                                                    |
| P3-4  | 见 FX-10 第 4 步                                                           |                                                        | 通过                                                                    |
| P3-5  | 剪藏后执行 `__annTest.watchLive()` 记下的内容；指针停在提示上 5 秒         | 读到“Clipped”；悬停期间提示不消失                      | 通过                                                                    |
| P3-6  | 截图视图里 `Tab` 到一张卡片                                                | 名称里有标题和来源                                     | 通过                                                                    |
| P3-7  | 设置页的水印位置选项                                                       | 每个选项带文字，如“Top right ↗”                        | 通过                                                                    |
| P3-8  | Wikipedia Zettelkasten 上进入区块模式                                      | 摘要从正文起读，不以“Toggle the table of contents”开头 | 通过                                                                    |
| P3-9  | jvns 整篇剪藏的阅读视图                                                    | 链接形式的小标题按标题字号显示                         | 未量                                                                    |
| P3-10 | 资料库 `nav` 的 `aria-label`                                               | “Library”                                              | 通过                                                                    |
| P3-11 | X 上剪藏一条帖子，执行 `__annTest.coverOf('[data-ann-ui="clip-toast"]')`   | 提示在底部居中，`covered` 为空                         | 非 X 页面通过；X 未量                                                   |
| P3-12 | 开着资料库，在另一个标签页剪藏                                             | 不刷新，1 秒内列表多出一张卡片                         | 通过                                                                    |

## 4. Medium 第三篇（MD-1）

报告里的第三篇地址（`@dan_abramov/before-you-memoize`）不是 Medium 文章：《Before You memo()》在 overreacted.io 上。改用 Dan Abramov 在 Medium 上的《Making Sense of React Hooks》：`https://medium.com/@dan_abramov/making-sense-of-react-hooks-fdbde8803889`。打开后先核对标题；地址失效时换同一作者在 Medium 上任一带代码块的文章，并记下实际地址。

- 能力：A、B、C、D、I（人机验证由人过）。
- 步骤：
  1. 打开文章。出现人机验证时交给人。
  2. 执行附录 B、附录 A，再执行 `const r = __annTest.articleCoverage()`。
  3. 区块模式：记下起点；`↓` 进入窗口所在的小节，`Tab` 在小节之间移动；在有代码块的小节里再按 `↓`，记下是否到达代码块；回到一节，按 `Enter` 剪藏。再用胶囊剪藏整篇（指针停在正文上，“Parent”到文章，“Clip”）。
  4. 指针停在一个代码块上，等胶囊出现，点“Clip”。
  5. 在资料库里打开整篇那一条，读原文。
- 通过：`r.pass` 为 `true`；第 4 步得到一个围栏代码块；整篇的 Markdown 里没有登录表单（“Remember me for faster sign in”）、订阅框（“Get … stories in your inbox”）、“Clap”“Listen”“Share”，也没有“min read”与日期连写（`/min read\S/` 不匹配）。
- 当前预期：前两篇里出现过的登录表单与订阅框，修复轮的界面短语表已覆盖，待真机确认；“3 min read”与日期连写修复轮没有处理，预期仍出现。

## 5. 通读（RD，产品负责人）

先在本分支跑起官网：`cd website && npm install && npm run dev`，地址是 `http://localhost:3001`。线上站点是主分支的部署，不代表本分支。

| 编号 | 对象                       | 地址或位置                                                          | 核对什么                                                                                                                        |
| ---- | -------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| RD-1 | 落地页（英文）             | `/en`                                                               | 每一句与产品现在的行为一致；演示里没有产品没有的东西                                                                            |
| RD-2 | 落地页（中文）             | `/zh-CN`                                                            | 同上，并与英文版说的是同一件事                                                                                                  |
| RD-3 | 隐私政策                   | `/privacy-policy.html`                                              | 权限表、本机存储（含 `chrome.storage.session` 里的上次取景框）、不出网的说法与 [permissions.md](../docs/v2/permissions.md) 一致 |
| RD-4 | 服务条款                   | `/terms-of-service.html`                                            | 读一遍，标出需要法务确认的句子                                                                                                  |
| RD-5 | 落地页的导出与快速编辑演示 | `/en` 与 `/zh-CN` 的演示区                                          | 导出是一次点击、导航里一行提示、文件名带日期；快速编辑没有“Saved on blur”                                                       |
| RD-6 | 导出文件名                 | [storage.md §6](../docs/v2/storage.md#6-唯一的用户导出markdown-zip) | 文档写 `AnnHub-export.zip`，产品与官网是 `AnnHub-export-YYYY-MM-DD.zip`：定下一个，再同步另一边                                 |

## 6. 其他探查（OP）

### OP-1 地址栏有焦点时的会话

- 能力：C′、A。
- 步骤：打开任一文章页，`Cmd+L` 让地址栏获得焦点，按截图快捷键；会话出现后按 `Esc`。再点一下页面，按 `Esc`。区块模式快捷键同样做一遍。
- 当前预期：会话能启动；地址栏有焦点时 `Esc` 不能退出，点一下页面之后才能（报告 7.4）。建议在会话开始时检查 `document.hasFocus()`，没有焦点就在提示条里说明。

### OP-2 资料库崩溃（P1-1）循环

- 能力：A、E、F。
- 步骤：资料库里放 8 条剪藏、4 张截图。每轮：点一张卡片 → “Read”→ “Back”→ 切到另一个导航项；截图条目改为“点卡片 → 图片预览 → `Esc`”。做 30 轮。开始前与结束后各列一次崩溃转储目录：macOS 上是 `~/Library/Application Support/Google/Chrome/Crashpad/completed/`，按修改时间排序看有没有新文件。
- 通过：没有“Aw, Snap!”，没有新的转储。
- 当前预期：报告第三轮 30 轮未复现。出现时记下第几轮、哪一步，并保存新转储的文件名与时间。

### OP-3 导出文件名里的日期

- 能力：E、F。
- 步骤：把时区设成本地日期与 UTC 日期不同的时刻。例如 `Pacific/Kiritimati`（UTC+14）的本地 00:00–14:00，或 `Pacific/Pago_Pago`（UTC−11）的本地 13:00–24:00。可以改系统时区，也可以只在资料库标签页的开发者工具里覆盖时区（Sensors 面板）。在资料库点“导出内容”，比较下载的文件名与 ZIP 里 `README.md` 的“Exported at”。
- 通过：文件名的日期与“Exported at”的本地日期相同。
- 当前预期：通过。文件名原先用的是 UTC 日期，复核时改成导出时的本地日期，与“Exported at”取自同一个时刻；单测在上海与纽约两个时区各量一次。

## 附录 A：页面内测量代码

在被测页面的主环境里执行一次。

````js
// AnnHub 真实 Chrome 场景的页面内测量。在被测页面里执行一次，之后调用 window.__annTest 上的函数。
// 只读页面状态，不派发任何事件；操作仍要用可信输入完成。
window.__annTest = (() => {
  const UI = '[data-ann-ui]'
  const CONTROLS = 'a,button,[role="button"],input,select,textarea,summary'
  const MENU = '[data-ann-ui="selection-menu"]'
  const CAPSULE = '[data-ann-ui="block-capsule"]'
  const PREVIEW = '[data-ann-ui="screenshot-preview"]'

  const deepAll = (root, selector, out = []) => {
    out.push(...root.querySelectorAll(selector))
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) deepAll(el.shadowRoot, selector, out)
    return out
  }
  const deepAt = (x, y) => {
    let scope = document
    let el = null
    for (let i = 0; i < 12; i++) {
      const next = scope.elementFromPoint(x, y)
      if (!next || next === el) return next
      el = next
      if (!el.shadowRoot) return el
      scope = el.shadowRoot
    }
    return el
  }
  const box = r => ({ left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) })
  const label = el => (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 40)
  const floating = el => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement || n.getRootNode().host) {
      if (/fixed|sticky/.test(getComputedStyle(n).position)) return true
    }
    return false
  }

  /** 浏览器、窗口与外观。每次记录结果时一并保存。 */
  function env() {
    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      onLine: navigator.onLine,
      visibility: document.visibilityState,
      hasFocus: document.hasFocus(),
      dark: matchMedia('(prefers-color-scheme: dark)').matches,
      innerWidth,
      innerHeight,
      devicePixelRatio,
      url: location.href,
    }
  }

  /** 与 rect 重叠、并且在重叠处位于最上层的页面控件。判断时临时隐藏 ownUi（扩展自己的浮层）。floating 表示控件本身或祖先是 fixed / sticky（页面的浮动按钮）。 */
  function controlsUnder(rect, ownUi) {
    const hits = []
    for (const el of deepAll(document, CONTROLS)) {
      if (el.closest(UI)) continue
      for (const r of el.getClientRects()) {
        if (r.width < 2 || r.height < 2) continue
        const w = Math.min(r.right, rect.right) - Math.max(r.left, rect.left)
        const h = Math.min(r.bottom, rect.bottom) - Math.max(r.top, rect.top)
        if (w <= 1 || h <= 1) continue
        if (ownUi) ownUi.style.visibility = 'hidden'
        const top = deepAt(Math.max(r.left, rect.left) + w / 2, Math.max(r.top, rect.top) + h / 2)
        if (ownUi) ownUi.style.visibility = ''
        if (top && (top === el || el.contains(top))) hits.push({ control: label(el), overlap: `${Math.round(w)}x${Math.round(h)}`, floating: floating(el) })
        break
      }
    }
    return hits
  }

  /** 区块描边与页面元素的矩形差（CSS 像素）。描边对准这个元素时 maxDiff 接近 0。 */
  function outlineVs(target = 'article') {
    const outline = document.querySelector('[data-ann-ui="block-outline"]')
    const el = typeof target === 'string' ? document.querySelector(target) : target
    if (!outline || !el) return null
    const a = outline.getBoundingClientRect()
    const b = el.getBoundingClientRect()
    const maxDiff = Math.max(Math.abs(a.left - b.left), Math.abs(a.top - b.top), Math.abs(a.right - b.right), Math.abs(a.bottom - b.bottom))
    return { outline: box(a), element: box(b), maxDiff: Math.round(maxDiff) }
  }

  /** 包括 open shadow root 在内的匹配数，例如 countDeep('pre') 数页面上的代码块。 */
  function countDeep(selector) {
    return deepAll(document, selector).filter(el => !el.closest(UI)).length
  }

  /** 浮层盖住的页面控件。默认量区块胶囊；剪藏提示传 '[data-ann-ui="clip-toast"]'。covered 应为空数组。 */
  function coverOf(selector = CAPSULE) {
    const el = document.querySelector(selector)
    if (!el) return null
    const r = el.getBoundingClientRect()
    const inViewport = r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
    return { rect: box(r), inViewport, covered: controlsUnder(r, el) }
  }

  /** 开始计时：松开指针到选区菜单出现、指针最后一次移动到胶囊出现。read() 返回毫秒。 */
  function startTiming() {
    const t = { lastMove: null, up: null, menuBefore: null, menu: null, capsuleEl: null, capsule: [] }
    const onMove = e => {
      if (e.isTrusted) t.lastMove = performance.now()
    }
    const onUp = e => {
      if (!e.isTrusted) return
      t.up = performance.now()
      t.menu = null
      t.menuBefore = document.querySelector(MENU)
    }
    document.addEventListener('pointermove', onMove, true)
    document.addEventListener('pointerup', onUp, true)
    const mo = new MutationObserver(() => {
      const now = performance.now()
      const menu = document.querySelector(MENU)
      if (t.up !== null && t.menu === null && menu && menu !== t.menuBefore) t.menu = now
      const capsule = document.querySelector(CAPSULE)
      if (capsule && capsule !== t.capsuleEl && t.lastMove !== null) t.capsule.push(Math.round(now - t.lastMove))
      t.capsuleEl = capsule
    })
    mo.observe(document.documentElement, { childList: true, subtree: true })
    return {
      read: () => ({
        menuAfterPointerUpMs: t.menu !== null ? Math.round(t.menu - t.up) : null,
        capsuleAfterLastMoveMs: t.capsule.slice(),
      }),
      stop: () => {
        mo.disconnect()
        document.removeEventListener('pointermove', onMove, true)
        document.removeEventListener('pointerup', onUp, true)
      },
    }
  }

  /** 记录最后一次非空选区的外框。选中文字之前执行；进入截图会话会清掉选区，read() 之后仍能读到。 */
  function watchSelection() {
    let last = null
    const onChange = () => {
      const sel = document.getSelection()
      if (sel && sel.rangeCount && !sel.isCollapsed) last = box(sel.getRangeAt(0).getBoundingClientRect())
    }
    document.addEventListener('selectionchange', onChange)
    return { read: () => last, stop: () => document.removeEventListener('selectionchange', onChange) }
  }

  /** 截图会话里待确认的取景框（确认条出现时），与 watchSelection().read() 同一坐标系。 */
  function pendingFrame() {
    const el = document.querySelector('.ann-shot-rect')
    return el ? box(el.getBoundingClientRect()) : null
  }

  /** 截图编辑态里预览画布的内容。空白图只有一两种颜色。 */
  function previewStats() {
    const c = document.querySelector(`${PREVIEW} canvas`)
    return c ? canvasStats(c) : null
  }

  /** 已载入的 <img> 的内容，口径同 previewStats。资料库卡片上的截图是 '.entry-card img'，懒加载，先滚到可见。 */
  function imageStats(img) {
    if (typeof img === 'string') img = document.querySelector(img)
    if (!img || !img.naturalWidth) return null
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    c.getContext('2d').drawImage(img, 0, 0)
    return canvasStats(c)
  }

  function canvasStats(c) {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    const colors = new Set()
    let n = 0
    let white = 0
    let dark = 0
    let clear = 0
    for (let i = 0; i < d.length; i += 4 * 7) {
      n++
      const [r, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]]
      if (a < 10) clear++
      else if (r > 245 && g > 245 && b > 245) white++
      else if (r < 100 && g < 100 && b < 100) dark++
      if (colors.size < 5000) colors.add(`${r},${g},${b},${a}`)
    }
    const share = v => +(v / n).toFixed(3)
    return { width: c.width, height: c.height, distinctColors: colors.size, whiteShare: share(white), darkShare: share(dark), transparentShare: share(clear) }
  }

  /** 区域截图的编辑态里，页面上每个身份元素在预览图对应位置的灰色占位（#d1d5db）比例。截取之后不要滚动页面。 */
  function identityGray(selector = '[data-testid="User-Name"]') {
    const panel = document.querySelector(PREVIEW)
    const c = panel?.querySelector('canvas')
    if (!c) return null
    const base = panel.getBoundingClientRect()
    const k = c.width / base.width
    const ctx = c.getContext('2d')
    const out = []
    for (const el of document.querySelectorAll(selector)) {
      if (el.closest(UI)) continue
      const r = el.getBoundingClientRect()
      const x0 = Math.max(r.left, base.left) + 2
      const y0 = Math.max(r.top, base.top) + 2
      const x1 = Math.min(r.right, base.right) - 2
      const y1 = Math.min(r.bottom, base.bottom) - 2
      if (x1 - x0 < 4 || y1 - y0 < 4) continue
      const d = ctx.getImageData(
        Math.round((x0 - base.left) * k),
        Math.round((y0 - base.top) * k),
        Math.max(1, Math.round((x1 - x0) * k)),
        Math.max(1, Math.round((y1 - y0) * k)),
      ).data
      let gray = 0
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 209) <= 8 && Math.abs(d[i + 1] - 213) <= 8 && Math.abs(d[i + 2] - 219) <= 8) gray++
      out.push({ text: label(el), grayShare: +(gray / (d.length / 4)).toFixed(3) })
    }
    return out
  }

  const parse = s => {
    const m = /rgba?\(([^)]+)\)/.exec(s)
    if (!m) return null
    const [r, g, b, a = 1] = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number)
    return { r, g, b, a }
  }
  const luminance = c => {
    const ch = v => {
      v /= 255
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b)
  }

  /** 文字对第一个不透明祖先底色的 WCAG 对比度。底色是图片或渐变时不准，要人看。 */
  function contrast(el) {
    if (typeof el === 'string') el = document.querySelector(el)
    if (!el) return null
    const fg = parse(getComputedStyle(el).color)
    let bg = null
    for (let n = el; n && !bg; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor)
      if (c && c.a >= 0.99) bg = c
    }
    bg = bg || { r: 255, g: 255, b: 255, a: 1 }
    const mixed = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) }
    const [hi, lo] = [luminance(mixed), luminance(bg)].sort((x, y) => y - x)
    return +((hi + 0.05) / (lo + 0.05)).toFixed(2)
  }

  /** 对比度低于 min 的文字（默认 4.5:1，设计稿“对比度与尺寸”对正文与控件文字的要求）。scope 默认整页，也可传浮层的选择器。 */
  function lowContrast(scope = document.body, min = 4.5) {
    if (typeof scope === 'string') scope = document.querySelector(scope)
    if (!scope) return null
    const out = []
    const seen = new Set()
    for (const el of [scope, ...scope.querySelectorAll('*')]) {
      if (!el.getClientRects().length) continue
      if (![...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.nodeValue.trim())) continue
      if (getComputedStyle(el).visibility === 'hidden') continue
      const ratio = contrast(el)
      if (ratio === null || ratio >= min) continue
      const key = `${label(el)}|${ratio}`
      if (!seen.has(key)) out.push({ text: label(el), ratio, disabled: !!el.closest(':disabled,[aria-disabled="true"]') })
      seen.add(key)
    }
    return out
  }

  /** 资料库里报告 3.4 量过的几处文字（选择器对应当前实现，界面改版后要跟着改）。 */
  function libraryContrast() {
    const current = document.querySelector('nav [aria-current]')
    const pick = el => (el ? contrast(el) : null)
    return {
      dark: matchMedia('(prefers-color-scheme: dark)').matches,
      currentNav: pick(current),
      currentNavCount: pick(current?.querySelector('[class*=count]')),
      exportButton: pick(document.querySelector('.nav-export')),
      accentText: pick(document.querySelector('.entry-card-highlights')),
      cardMeta: pick(document.querySelector('.entry-card-source')),
    }
  }

  /** 可见文字和 aria-label、title、placeholder、alt 里的汉字与全角标点。扩展页面不传参数；网页上传 '[data-ann-ui]'，只查扩展浮层。 */
  function cjkLeaks(scope) {
    const re = /[　-〿㐀-鿿豈-﫿＀-￯]/
    const hits = []
    const walk = root => {
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let node = tw.nextNode(); node; node = tw.nextNode()) {
        const parent = node.parentElement
        if (re.test(node.nodeValue) && parent && parent.getClientRects().length) hits.push(node.nodeValue.trim().slice(0, 40))
      }
      for (const el of root.querySelectorAll('*')) {
        for (const attr of ['aria-label', 'title', 'placeholder', 'alt']) {
          const v = el.getAttribute(attr)
          if (v && re.test(v)) hits.push(`${attr}=${v.slice(0, 40)}`)
        }
        if (el.shadowRoot) walk(el.shadowRoot)
      }
    }
    if (scope) document.querySelectorAll(scope).forEach(walk)
    else walk(document.documentElement)
    return hits
  }

  /** 记录焦点落点。之后用真实的 Tab 等按键操作，read() 看有没有落到扩展浮层以外。 */
  function watchFocus() {
    const steps = []
    let tabs = 0
    const onKey = e => {
      if (e.isTrusted && e.key === 'Tab') tabs++
    }
    const onFocus = e => {
      const el = e.composedPath()[0]
      if (el instanceof Element) steps.push({ inUi: !!el.closest(UI), what: `${el.tagName.toLowerCase()} ${label(el)}` })
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('focusin', onFocus, true)
    return {
      read: () => ({ tabs, focused: steps.length, outsideUi: steps.filter(s => !s.inUi), steps: steps.slice() }),
      stop: () => {
        document.removeEventListener('keydown', onKey, true)
        document.removeEventListener('focusin', onFocus, true)
      },
    }
  }

  /**
   * 记录扩展浮层里 live region（role=status/alert/log 或 aria-live）的文字。how 为 inserted 表示区域带着文字一次插入，
   * changed 表示已在页面上的区域里文字变了；前者有的读屏不播报。这是读屏能播报的必要条件。
   */
  function watchLive() {
    const LIVE = '[aria-live]:not([aria-live="off"]),[role="status"],[role="alert"],[role="log"]'
    const t0 = performance.now()
    const seen = []
    const push = (region, how) => {
      const host = region.closest(UI)
      if (!host) return
      const text = (region.innerText || region.textContent || '').replace(/\s+/g, ' ').trim()
      const last = seen.at(-1)
      if (!text || (last && last.text === text)) return
      seen.push({
        ms: Math.round(performance.now() - t0),
        ui: host.getAttribute('data-ann-ui'),
        role: region.getAttribute('role') || region.getAttribute('aria-live'),
        how,
        text: text.slice(0, 80),
      })
    }
    const mo = new MutationObserver(records => {
      for (const rec of records) {
        for (const added of rec.addedNodes) {
          if (!(added instanceof Element)) continue
          for (const region of [added, ...added.querySelectorAll('*')].filter(el => el.matches(LIVE))) push(region, 'inserted')
        }
        const node = rec.target.nodeType === Node.TEXT_NODE ? rec.target.parentElement : rec.target
        const region = node?.closest?.(LIVE)
        if (region) push(region, 'changed')
      }
    })
    mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
    return { read: () => seen.slice(), stop: () => mo.disconnect() }
  }

  /** 资料库阅读视图里每处高亮的角色与可读名称（选择器对应当前实现）。 */
  function highlightA11y() {
    return [...document.querySelectorAll('[data-hl-id]')].map(el => {
      const hit = el.closest('[role]') || el
      const describedBy = (hit.getAttribute('aria-describedby') || '')
        .split(/\s+/)
        .filter(Boolean)
        .map(id => document.getElementById(id)?.textContent?.trim() || '')
        .join(' ')
      return {
        role: hit.getAttribute('role'),
        ariaLabel: hit.getAttribute('aria-label'),
        roleDescription: hit.getAttribute('aria-roledescription'),
        describedBy,
        text: (el.textContent || '').trim().slice(0, 40),
        colorClass: [...el.classList].find(c => /^md-hl-(?!hit)/.test(c)) || null,
      }
    })
  }

  /** 文章级区块的段落覆盖和它的 Markdown。先在同一页面执行附录 B 的识别代码（window.__annhub）。 */
  function articleCoverage() {
    const A = window.__annhub
    if (!A) throw new Error('先执行附录 B 的识别代码')
    const text = el => (el.innerText || '').replace(/\s+/g, ' ').trim()
    const cjk = s => (s.match(/[㐀-鿿]/g) || []).length / Math.max(1, s.length) > 0.3
    const visible = el => {
      if (!el.getClientRects().length) return false
      const cs = getComputedStyle(el)
      return cs.visibility !== 'hidden' && cs.display !== 'none'
    }
    const ps = [...document.querySelectorAll('p')].filter(visible).filter(p => text(p).length >= (cjk(text(p)) ? 25 : 60))
    const cover = new Map()
    for (const p of ps) {
      for (const c of A.candidatesFor(p, document)) {
        if (c.kind === 'article' && !cover.has(c.element)) cover.set(c.element, ps.filter(q => c.element.contains(q)).length / ps.length)
      }
    }
    let best = null
    for (const [el, v] of cover) if (!best || v > best.cover) best = { el, cover: v }
    if (!best) return { paragraphs: ps.length, cover: 0, pass: false, markdown: null }
    const markdown = A.elementToMarkdown(best.el).markdown
    const visiblePre = deepAll(best.el, 'pre').filter(pre => pre.getClientRects().length > 0 && !pre.closest(UI)).length
    return {
      paragraphs: ps.length,
      element: best.el.tagName.toLowerCase(),
      cover: +best.cover.toFixed(3),
      pass: best.cover >= 0.75,
      visiblePre,
      fencedBlocks: fencedBlocks(markdown),
      markdownChars: markdown.length,
      markdown,
    }
  }

  /** Markdown 里的围栏代码块数。围栏只由同一字符、不短于开头的一行关闭，代码内容里出现的 ``` 不算。 */
  function fencedBlocks(markdown) {
    let open = null
    let n = 0
    for (const line of markdown.split('\n')) {
      const m = /^ {0,3}(`{3,}|~{3,})/.exec(line)
      if (!m) continue
      if (!open) {
        open = m[1]
        n++
      } else if (m[1][0] === open[0] && m[1].length >= open.length && line.trim() === m[1]) open = null
    }
    return n
  }

  const visiblePres = () => deepAll(document, 'pre').filter(el => el.getClientRects().length > 0 && !el.closest(UI))

  /**
   * 一个代码块转成 Markdown 之后有没有丢行或并行：页面上显示的每个非空行都应该原样是围栏里的一行（比较时去掉首尾空白）。
   * missing 为空即通过；hidden 是围栏里有、页面上没显示的行数（例如 mdBook 折叠的样板行）。
   * 参数是页面上第几个可见的代码块（从 0 起，含 shadow root 里的），也可以传 pre 元素或选择器。需要附录 B。
   */
  function codeLines(pre = 0) {
    const A = window.__annhub
    if (!A) throw new Error('先执行附录 B 的识别代码')
    if (typeof pre === 'number') pre = visiblePres()[pre]
    else if (typeof pre === 'string') pre = document.querySelector(pre)
    if (!pre) return null
    const nonEmpty = text =>
      text
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
    const shown = nonEmpty(pre.innerText)
    const fenced = nonEmpty(A.elementToMarkdown(pre).markdown).slice(1, -1)
    const pool = new Set(fenced)
    const missing = shown.filter(line => !pool.has(line))
    return { shown: shown.length, fenced: fenced.length, hidden: Math.max(0, fenced.length - shown.length), missing: missing.slice(0, 5) }
  }

  /** 页面上全部可见代码块的 codeLines 汇总。withMissing 为 0 即通过。 */
  function allCodeLines() {
    const all = visiblePres().map(pre => codeLines(pre))
    const bad = all.find(r => r.missing.length)
    return { blocks: all.length, withMissing: all.filter(r => r.missing.length).length, hiddenTotal: all.reduce((n, r) => n + r.hidden, 0), firstMissing: bad ? bad.missing : null }
  }

  return {
    env,
    controlsUnder,
    coverOf,
    outlineVs,
    countDeep,
    startTiming,
    watchSelection,
    pendingFrame,
    previewStats,
    imageStats,
    identityGray,
    contrast,
    lowContrast,
    libraryContrast,
    cjkLeaks,
    watchFocus,
    watchLive,
    highlightA11y,
    articleCoverage,
    fencedBlocks,
    codeLines,
    allCodeLines,
  }
})()
````

## 附录 B：识别与转换代码

在仓库根目录执行，生成的 `probe.js` 约 14 KB；在被测页面的主环境里执行它的全部内容，之后页面上有 `window.__annhub`。源码变了要重新生成。

```bash
REPO="$PWD"
PROBE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/annhub-probe.XXXXXX")"
cat > "$PROBE_DIR/probe-entry.ts" <<EOF
import { candidatesFor, candidateSummary } from '$REPO/entrypoints/content/blocks'
import { elementToMarkdown } from '$REPO/entrypoints/content/markdown'
import { resolvePermalink } from '$REPO/entrypoints/content/page-meta'
;(window as unknown as Record<string, unknown>).__annhub = { candidatesFor, candidateSummary, elementToMarkdown, resolvePermalink }
EOF
npx esbuild "$PROBE_DIR/probe-entry.ts" --bundle --format=iife --minify --outfile="$PROBE_DIR/probe.js"
echo "$PROBE_DIR/probe.js"
```
