# Content Script 约定

> 适用范围：`entrypoints/content/`。全局规则见根目录 [AGENTS.md](../../AGENTS.md)；批注与截图各有一份子约定，见下面的按需读取。

## 职责与入口

- 页面里有两种采集（剪藏：选区/区块；截图）、页面下载（区块胶囊/`D` 键把区块取成 Markdown 文件夹，`download-flow.ts` 的提示条跟进度，download.md §2）和一层页面批注（录制时的光标高亮也挂在页面上，annotate.md §3）。`index.tsx` 编排选区菜单、区块入口、区块模式、截图会话与批注层的进入/退出；高亮不在页面里（资料库读剪藏时才做）。
- `selection-menu.ts` 是两项菜单（剪藏、截图，顺序固定）：无最短长度、全空白选区不出现。
- 选区端点在 input、textarea、contenteditable 里不出现。
- 键盘 `Tab` 聚焦某一项后 `Enter` 才触发，没聚焦时回车属于页面。
- 悬停/聚焦约 300ms 浮出深色后果卡片（`.ann-menu-tip`，两行：动作名 + 后果；在菜单的外侧——菜单在选区上方时在菜单上方、翻到下方时跟到下方、与菜单左缘对齐、无箭头，放不下时夹回视口、不盖选区；纯浮层，胶囊永远只有一行按钮，不留空白行，呈现规则见 extension.md §2.1）。
- 菜单是深色浮条，带指向选区中点的小三角（`--ann-caret`，`ann-menu-below` 翻转）。
- 菜单贴着选区第一行、水平居中，并夹在选区所在的内容列里：宽视口里选区右侧的空当往往是旁边一栏（X 主页的 Premium/搜索栏），窗口放得下不等于该摆到选区右外侧。
- 坐标用视口 CSS 像素（与 `getClientRects`、`position: fixed` 同一套），不加窗口滚动，也不加 iframe 在父页面上的偏移——中栏自己的滚动已经反映在矩形里，子框架的菜单用子框架自己的视口。
- `onScreenshot` 钩子可缺省：子框架里菜单只有“剪藏”（capture.md §3）。
- open shadow root 里的选区用 `getComposedRanges` 取范围，没有这个接口的 Chrome 降级为 `selection.toString()` 的纯文本剪藏（`plainTextForSelection`，capture.md §3）。
- `clip-flow.ts` 一次点击保存 + 约 3 秒「已剪藏 · 撤销 · 编辑」提示（深色胶囊，底部细条是同一份倒计时：悬停/聚焦暂停、离开重开一轮，`TOAST_MS` 与 CSS 动画时长成对改）+ 快速编辑气泡（头部一行“已剪藏 · 失焦即保存”，标签是 chip 输入——`Enter`/逗号提交、空输入 `Backspace` 删最后一个、失焦提交剩余文字，提交的标签列表仍经 `normalizeTags`）。
- 失败保留选区与已输入内容并给重试（extension.md §3）。
- 条目 ID 由调用方生成并随重试复用（保存幂等），`startedAt` 在点击时记下随消息发出。
- 三个保存函数返回 `ClipOutcome | ClipFailure`：失败带后台的稳定错误码，`showFailureToast` 按码说明原因（配额不足时提示先导出），不认识的码只说“保存失败”，绝不回显原始信息。
- 气泡只提交用户改动过的字段（`UPDATE_ENTRY` 的 `properties.set`、`note`），等响应成功才关闭，失败时气泡与输入都在、错误按同一套码显示在气泡里。
- 标签超限在提交前就地提示。
- 转换器由剪藏与下载共用，按用途输出；平台提取、元数据和转换细则见 [notes/content-conversion.md](notes/content-conversion.md)。

## 输入信任与站点规则

- 会话在页面 DOM 里，页面脚本能派发任何事件：一切会走到特权 API（截取、跨域代取、保存、起录）的入口只认 `user-input.ts` 的 `isUserInput`（`event.isTrusted`）或扩展自己的消息（`TRIGGER_SCREENSHOT`/`TRIGGER_BLOCK_MODE`/`TRIGGER_ANNOTATE`）。jsdom 的事件都不可信，单测 mock `isUserInput`。
- 新站点的永久链接规则集中维护（X 帖子在 `page-meta.ts` 的 `resolvePermalink`，Medium 文章规则待补），不要在业务模块散写 hostname 分支。
- 页面常在 `document` 上监听单键快捷键：扩展自己的输入框（快速编辑、截图文字标注）要把键盘事件留在自己界面里（`stopPropagation`）。
- 同源 iframe 与 open shadow root 里的选区和区块必须可用；跨源 iframe、可编辑区、受限页不出现入口也不报错（capture.md §3）。内容脚本注册到所有框架（`allFrames`），子框架只在与顶层同源时启用。截图会话、取景坐标和被截取的标签页都属于顶层框架的视口，所以子框架里只提供剪藏：菜单没有“截图”、胶囊没有“截图”、区块模式没有 `S`，发给标签页的三条触发（截图、区块、批注）只发顶层框架（`frameId: 0`），子框架收到也不理；录制开关不进页面，worker 直接处理。

## 按需读取

| 主题                   | 文件                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| 内容转换与元数据       | [notes/content-conversion.md](notes/content-conversion.md)           |
| 页面批注与录制         | [annotation/AGENTS.md](annotation/AGENTS.md)                         |
| 截图会话、选区与匿名   | [screenshot/AGENTS.md](screenshot/AGENTS.md)                         |
| 美化、水印、序号与线宽 | [screenshot/notes/editor-tools.md](screenshot/notes/editor-tools.md) |
| 区块识别与键盘模式     | [notes/blocks-and-keyboard.md](notes/blocks-and-keyboard.md)         |
| 浮层样式与命名空间     | [notes/overlays.md](notes/overlays.md)                               |

## 验证

- 改转换、识别、菜单或胶囊：跑 `pnpm test`（相关单测）并构建后跑对应 E2E（`e2e/selection-clip.spec.ts`、`e2e/block-clip.spec.ts`、`e2e/screenshot-capture.spec.ts`、`e2e/page-entry.spec.ts`、`e2e/page-shapes.spec.ts`）。
- `page-shapes` 用平铺文档、div 汤、Docusaurus、长文（标题直接在 `main` 里、引言占满窗口、图里有代码）、带 meta 的文章、各类内容形状和页面界面类名的夹具，在真实浏览器里验识别与转换。
- 转换器的转义约定还要跑 `core/__tests__/fixtures/page-text.ts` 的共享夹具（`__tests__/markdown.test.ts` 里）。

改批注、截图各自要跑的测试见对应子文件；改源码必须 `rm -rf .output/chrome-mv3 && pnpm run build` 再测 E2E，`.output` 不随源码变化重建。
