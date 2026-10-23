# 批注与录屏路线：#88–#94 实现对照

> 更新时间：2026-10-23
>
> 这是已开 issue 的实现对照，不是产品契约。行为、字段和验收仍以 [v2 文档](../v2/README.md) 为准。本页不表示这些能力已经采纳；按仓库约定，实现某个 issue 的提交必须同时改 `docs/v2/` 里对应的契约。在那之前不要写功能代码。
>
> 约束：本地优先，不要求账号，不接云端 AI。两条产物分开：批注长图（含滚动）仍是现有 `screenshot` 图片；标签页录屏是本地 WebM 文件。录屏不改 PR #87（`docs/plans/video-frame-notes.md`，尚未合入 main）里的 `video` / `timestamp` / `channel` / `subtitle` / `idea`。

证据和验收原文在 GitHub issue 里，这里不复制。Presentify 的交互以 2026-10-23 核对的官网、[FAQ](https://presentifyapp.com/faq) 和 [快捷键页](https://presentifyapp.com/presentify-keyboard-shortcuts) 为准。

| Issue | 锚点                                                                            |
| ----- | ------------------------------------------------------------------------------- |
| #88   | [88 荧光笔直线与线宽](#88-荧光笔直线与线宽)                                     |
| #89   | [89 页面实时批注叠加层](#89-页面实时批注叠加层)                                 |
| #90   | [90 滚动长图先拼后批](#90-滚动长图先拼后批)                                     |
| #91   | [91 滚动坐标系](#91-滚动坐标系)                                                 |
| #92   | [92 标签页像素录屏](#92-标签页像素录屏)，权限见 [92 的权限影响](#92-的权限影响) |
| #93   | [93 录屏批注与光标高亮](#93-录屏批注与光标高亮)                                 |
| #94   | [94 Spotlight 与 Zoom 以及 rrweb](#94-spotlight-与-zoom-以及-rrweb)             |

## 现状对照

标注发生在截取之后的位图上。页面上没有画笔层，也没有滚动拼接和录屏。

```text
快捷键 / 选区菜单 / 区块胶囊
  -> 截图会话 entrypoints/content/screenshot/index.ts
       区域：CAPTURE_VISIBLE_TAB -> background-service/services/screenshot/index.ts
            每秒最多 2 次；第三次返回 CAPTURE_RATE_LIMITED
            页面里 requestCapture 隔 400ms 再要，最多 3 次
       元素：element-capture.ts 离屏克隆，不经过滚动
       标注：editor.ts 的 renderScreenshot 画进 croppedCanvas
       工具栏：toolbar.tsx，五色，撤销是 annotations.pop()
       确认：SAVE_SCREENSHOT，PNG，与图片同一事务
  -> 复制 / 下载走 displayCanvas（再加水印和美化）
```

| 事实                                                                                                                                | 位置                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 工具只有矩形、椭圆、箭头、画笔、马赛克、文字。线宽写死为 `Math.max(2, 3 * scale)`，没有荧光笔，没有不带箭头的直线                   | `screenshot/editor.ts` 的 `DrawTool`；`screenshot/toolbar.tsx`         |
| 五色是 `#e5484d` `#f6c453` `#147d72` `#ffffff` `#20252b`，默认红                                                                    | `toolbar.tsx` 的 `colors`；会话字段 `color`                            |
| 撤销只弹出最后一条标注，再从 `sourceCanvas` 整张重画。自动建议的马赛克区域另有移除按钮                                              | `index.ts` 的 `undo`；`renderScreenshot`                               |
| 标注坐标是裁剪画布像素。预览被美化垫大时，指针要先减去 `contentOrigin`                                                              | `index.ts` 里把指针换到画布坐标的那一段                                |
| 三块画布：`sourceCanvas` 原始截取，`croppedCanvas` 匿名 + 马赛克 + 标注（入库），`displayCanvas` 再加美化与水印（预览、复制、下载） | `entrypoints/content/AGENTS.md` 截图一节                               |
| 调用 `captureVisibleTab` 前隐藏扩展 UI 并等两帧。后台再确认标签页仍是当前窗口里显示着的那个                                         | `index.ts`；`services/screenshot/index.ts` 的 `captureWindow`          |
| 滚动拼接整页写在契约的范围外                                                                                                        | `docs/v2/screenshot.md` §2 末句                                        |
| 浮层挂在 `[data-ann-ui]` 上，不用 shadow root，z-index 用 `2147483647`。截图会话只在顶层框架                                        | `screenshot/index.ts`；内容脚本约定 D-29                               |
| 会走到截取或保存的入口只认 `isUserInput` 或扩展消息                                                                                 | `user-input.ts`                                                        |
| 入库图片只能是 `image/png`，单张上限 `MAX_IMAGE_BYTES`（10 MiB）                                                                    | `learning-core/assets.ts`；`docs/v2/storage.md` §4；`docs/v2/entry.md` |
| 条目类型只有 `clip` 和 `screenshot`。截图 `content` 必须是空串                                                                      | `docs/v2/entry.md`                                                     |
| 清单权限只有 `storage`、`commands`、`downloads`，外加 `<all_urls>`。最低 Chrome 114。没有 offscreen 文档                            | `wxt.config.ts`；`docs/v2/permissions.md` §2–§5                        |
| 隐私政策权限表由测试对着清单核对：表里的每一项必须在 `permissions` 数组里，数组里的每一项必须出现在表里                             | `utils/__tests__/legal-pages.test.ts`                                  |
| 序号徽章是 #81，本仓库还没有这个工具                                                                                                | `DrawTool` 没有 badge                                                  |
| 视频截帧的 `video` / `timestamp` 等是另一条静态截图路线                                                                             | PR #87 的计划；本页不改那些字段                                        |
| 仓库里没有 `tabCapture`、`MediaRecorder`、`rrweb`                                                                                   | 全库检索无对应实现                                                     |

## 两条产物

1. **批注长图。** 产物仍是今天的 `screenshot`：裁剪、匿名、马赛克、标注之后的 PNG。滚动只改变这张图怎么来。先拼成一张大图再进现有编辑器（#90）；边滚边画是后一步（#91），导出时把笔画栅格化到同一张图上。
2. **讲解视频。** 产物是下载到本地的 WebM，可选麦克风。像素来自标签页捕获，批注和光标环画在页面上，因此会进画面（#92、#93）。它不进 `assets`，也不新建条目类型。

监控平台的 session replay（rrweb、FullStory、Sentry Replay 一类）只借三件事：明确的开始/停止、录制进行中的可见状态、敏感内容在进产物之前就挡住。不借 DOM 事件流、网络载荷、远程回放。对照写在 [94](#94-spotlight-与-zoom-以及-rrweb)。

## Presentify 能迁进扩展的交互

Presentify 是 macOS 菜单栏应用，画在整个屏幕上，能盖住任意 App。扩展只能盖住**当前标签页的视口**，拍不到浏览器工具栏，也拍不到 Chrome 以外的窗口。

| Presentify                                      | 放进哪一档                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 笔、荧光笔、矩形、椭圆、箭头、直线、文字        | #88 画进位图，#89 再画到页面上。色板继续用现有 5 色                                                          |
| 线宽档，以及按住 Shift 把自由笔画成直线         | #88                                                                                                          |
| 最多 5 色之外的渐变描边                         | 可做，但 #88 把它标成非必须。真要画，用 `createLinearGradient`。把 CSS 渐变字符串赋给 `fillStyle` 会画成黑色 |
| 按住修饰键给矩形/椭圆半透明填充                 | 范围外。issue 没要                                                                                           |
| 自动擦除                                        | 只放在 #89 的叠加层。已经进 `croppedCanvas` 的笔画不擦                                                       |
| 隐藏控制面板再画                                | #93：录制中的控件不要放在会被拍进 WebM 的页面里                                                              |
| 光标环、圆角方、菱形，左键点击涟漪              | #93。只跟页面里的指针，换不了系统光标                                                                        |
| 光标闲置后隐藏环                                | 能做，不放进 #93 的验收                                                                                      |
| 聚光灯（周围变暗）                              | #94 评估为延后。标签页里用 CSS 遮罩即可，盖不住浏览器外框                                                    |
| 跟随光标的放大镜、整屏放大                      | #94 评估为延后。放大页面会重排；像素放大要在离屏把视频帧再画一遍                                             |
| 画在任意 App、全屏会议软件、PDF 阅读器、Sidecar | 系统能力。扩展不做                                                                                           |
| 独立白板                                        | 不做。`docs/v2/product.md` §2.3 排除自由白板                                                                 |
| Chrome 没有焦点时仍生效的全局快捷键             | 系统能力。现有 `commands` 只在 Chrome 里                                                                     |

## 阶段与依赖

```text
Phase 1  无新权限
  #88 笔画模型（荧光笔、直线、线宽）
  #89 页面叠加层     软依赖 #88：没有 #88 时先接现有六种工具
  #90 先拼后批       与 #88/#89 并列，拼完的图走进今天的编辑器
  #81 序号徽章       并列，不在本页设计；只共用色板和撤销栈

Phase 2
  #91 文档坐标       硬依赖 #90 的拼接结果和 #89 的叠加层
  #92 像素录屏       硬依赖「需产品拍板」的权限。与批注 issue 并列，不依赖 #79–#86

Phase 3
  #93 录屏时的笔画和光标环   硬依赖 #92 与 #89（笔触来自 #88）
  #94 只交付本页的评估。Spotlight 若要做，排在 #93 之后。rrweb 不交付
```

打码流水线（#85）继续走 `mosaic.ts` / `anonymize.ts`，本批不改马赛克语义。OCR（#86）继续延后：`product.md` §2.3 排除模型接入。

## 共用笔画

编辑器、叠加层、滚动导出和录屏画的是同一种记录（#88、#89、#91、#93）。序号徽章（#81）以后往同一个联合类型里加自己的 `tool`，不要再做一套颜色或撤销。

假设：笔画在内存里，仍不另存为附件。入库的还是栅格化之后的 PNG（`screenshot.md` §2）。

```typescript
type StrokeStep = 's' | 'm' | 'l'

type Annotation =
  | { tool: 'rectangle' | 'ellipse' | 'arrow' | 'line' | 'pen' | 'highlighter'; start: Point; end: Point; points: Point[]; color: string; width: StrokeStep }
  | { tool: 'mosaic'; start: Point; end: Point; points: Point[]; color: string }
  | { tool: 'text'; start: Point; text: string; color: string }
```

- `width` 不放在马赛克和文字上。马赛克仍由 `pixelateRegion` 按块平均。
- 中档复现今天的线宽：`Math.max(2, 3 * scale)`。细档 2 CSS 像素乘 `scale`，粗档 8 CSS 像素乘 `scale`，再和 2 取最大。`scale` 是现有的 `capturedDpr`。
- 荧光笔在此基础上把线宽再乘 3，`globalAlpha = 0.35`，圆头，只描边。画完恢复 alpha，避免下一笔一起变淡。假设：不用 `multiply`，深色页面上正文仍可读。
- 直线是没有箭头的线段。箭头工具保持今天的箭头。
- 按住 Shift 画笔时，把自由笔收成水平、竖直或 45° 的直线，仍记成 `pen`。这是 Presentify 的 Shift 行为，和单独的直线工具并存。
- 撤销继续 `annotations.pop()` 然后整张重画。荧光笔的透明度靠重画，不能在上一帧上再涂一层。
- 色板数组仍只在 `toolbar.tsx` 定义一次。#81 的徽章读取同一数组。本页不规定徽章的计数、拖动和样式。
- 渐变描边不做。真要加，沿笔画建 `CanvasGradient`，不要写 CSS 渐变字符串。

## 88 荧光笔直线与线宽

Phase 1。在原位编辑器里增加荧光笔和直线，笔和荧光笔可选三档线宽。确认、复制、下载都带上这些笔画。无新权限。

### 88 的实现

1. 按上一节扩 `Annotation` 和 `renderScreenshot`。矩形、椭圆、箭头、画笔走同一档线宽；荧光笔走加粗加透明的分支；`line` 只画 `start` 到 `end`。
2. `toolbar.tsx` 增加两个工具按钮和三档线宽。线宽控件放进已有的横向滚动区，确认和取消仍固定在右侧（`screenshot.md` §1.1）。
3. 会话的草稿对象带上当前 `width`。指针换算继续减去 `contentOrigin`，美化预览上的落点不变。
4. 文案加在 `utils/ui-text.ts`：`shot.tool.highlighter`、`shot.tool.line`、`shot.tool.width` 及三档名字。中英都要。
5. 默认颜色仍是红。用户要荧光笔效果时自己点黄。不改默认色。

### 88 的文件

- `entrypoints/content/screenshot/editor.ts`
- `entrypoints/content/screenshot/toolbar.tsx`
- `entrypoints/content/screenshot/index.ts`（草稿、撤销、重画）
- `utils/ui-text.ts`
- 单测放在 `entrypoints/content/screenshot/__tests__/`，断言细/中/粗的线宽、荧光笔的 alpha、直线没有箭头
- 像素 E2E 沿用 `e2e/screenshot-beautify.spec.ts` 的读图像素方式：荧光笔不是实心遮盖，直线与箭头不同，撤销回到上一笔
- 实现该 issue 时改 `docs/v2/screenshot.md` §1.1 的工具表

### 88 的风险

窄视口下工具栏已经横向滚动。多两个按钮和线宽控件之后，仍要保证确认和取消露在外面。荧光笔若逐帧叠加 alpha，拖拽预览会越涂越实，所以预览必须走现有的整张重画。

### 88 的验收

对齐 #88：荧光笔与直线出现在工具栏；笔和荧光笔至少三档线宽；五色不变；笔画进 `croppedCanvas`，确认、复制、下载都保留；撤销与现有工具同一条栈；无新权限；完全本地。

## 89 页面实时批注叠加层

Phase 1。在当前标签页上画，再把笔画送进现有编辑器。只覆盖顶层框架的视口。

### 89 的实现

新建 `entrypoints/content/screenshot/page-ink.ts`，负责叠加层的 DOM 和监听。绘制调用 `editor.ts` 里抽出的同一个描边函数，避免两套笔触。

叠加层是 `[data-ann-ui]` 下的透明 canvas，铺满视口，`pointer-events` 在画的时候为 `auto`。不改宿主节点，不加 shadow root。退出时摘掉节点和监听，和截图会话的清理同一套。

假设：入口放在现有截图会话里，作为一个模式，而不是第三条快捷键。`commands` 里已经有区域截图和区块模式。新快捷键可以以后再加，它不构成新权限，但要改 `wxt.config.ts`、`constants.ts`、`command-handler.ts` 和命令文案。

捕获方式采用「先藏 UI，再重放笔画」，这样两帧隐藏规则不用开口子：

1. 记下当前 `Annotation[]`（视口 CSS 像素）。
2. 隐藏整个扩展 UI，包括墨迹，等两帧。
3. 走现有 `requestCapture`。
4. 打开现有原位编辑器，把这些笔画用 `renderScreenshot` 画进 `croppedCanvas`。区域选区只保留落在选区内的笔画，坐标减去选区原点再乘 `capturedDpr`。

这样墨迹不会因为某一帧没藏干净而漏进图，也不会因为藏得太干净而丢掉。`screenshot.md` 实现时要写明：页面墨迹是重放到位图上的，不是被 `captureVisibleTab` 拍进去的 DOM。

自动擦除只存在于叠加层：每条笔画一个计时器，到点从数组里删掉并重画。假设：默认关；打开时可选约 2 秒或 5 秒。已经重放进编辑器的笔画不参与计时。

假设：画的时候挡住页面点击。按住 Alt 把叠加层设为 `pointer-events: none`，这一下交给页面，松手恢复。和 Presentify 按住 Fn 把操作交回下层是同一类交互。只认 `isUserInput`。

子框架不挂这个层（D-29）。跨源 iframe 里的像素能被之后的视口截图拍到，但笔只能画在顶层视口上。

### 89 的文件

- 新的 `entrypoints/content/screenshot/page-ink.ts`
- `editor.ts` 的描边函数
- `screenshot/index.ts` 接模式切换、两帧隐藏、重放
- `utils/ui-text.ts`
- 实现时改 `docs/v2/extension.md` 与 `screenshot.md`
- 测试：退出后文档里没有残留节点和监听；伪造事件不能开始或落笔；重放后的像素落在选区内

### 89 的风险

页面自己的全屏层也可能用最大 z-index，盖住扩展的情况要在真机上看。自动擦除如果误接到 `annotations` 编辑栈，会把已经入库路径上的笔画删掉，所以计时器只能留在 `page-ink`。Alt 穿透时不要把这一下记成笔画。

### 89 的验收

对齐 #89：有页面批注模式；工具至少覆盖笔、箭头、矩形、文字，#88 落地后再接荧光笔、直线和线宽；退出清理干净；截图产物包含这些笔画，同时仍满足截前藏 UI；自动擦除不影响已截取的图；无新的主机权限。

## 90 滚动长图先拼后批

Phase 1。把有限高度的文章页拼成一张图，再进入今天的编辑器。拼接完成之前不记录笔画。无新权限。实现前先改 `docs/v2/screenshot.md` 里「滚动拼接整页不属于当前截图范围」那一句，契约定了再写代码。

### 90 的实现

纯函数放在新的 `entrypoints/content/screenshot/scroll-stitch.ts`。会话只负责滚动、调用现有 `requestCapture` 和 `pageStable`（`selection.ts`）。不要另写一套截取频率或两帧隐藏。

假设的范围：

- 只滚 `document.scrollingElement`。文档不滚、内容在内部 `overflow` 容器里时，停下来说明这次拼不了，不自动去猜最大的 div。
- 只拼纵向。`scrollWidth` 明显大于视口时照常拼当前横向位置，并说明横向不在这次里。
- 有限篇长。假设最多 30 段，并且编码后的 PNG 必须能放进 `MAX_IMAGE_BYTES`。再往下会超出时，把已经拼好且能编码进上限的部分送进编辑器，并说明后面没有继续拼。编码失败则整张不入库。
- `visualViewport.scale !== 1`，或循环中途 `devicePixelRatio` 变了，就中止。请用户把页面缩放恢复后再试。
- 取消（`Esc`）丢掉已拍的段，不入库。

循环：

1. 记下起点 `scrollTop`、视口高度、`devicePixelRatio`、`scrollHeight`。临时把根上的 `scroll-behavior` 设为 `auto`，`overflow-anchor` 设为 `none`，结束时恢复。
2. 步长 = 视口高度 − 重叠。假设重叠 80 CSS 像素，用来吸收取整，也给固定头检测留一条缝。
3. 每一段：`scrollTo` 到目标，等滚动落稳再 `pageStable(500)`，藏扩展 UI 两帧，`requestCapture`。两次调用之间至少隔 500ms，让浏览器的每秒 2 次配额有余量。`CAPTURE_RATE_LIMITED` 仍走现有重试。段与段之间可以显示「3/12」，但这一层在按下快门的那两帧必须藏住。
4. 用实际滚到的 `scrollTop` 计算落点，不用请求的目标值：`destY = Math.round((scrollTop - originScrollTop) * dpr)`。
5. 到底、达到段数上限、或下一张会让画布超出浏览器能分配的尺寸或 10 MiB，就停。

固定定位：每一帧在 `captureVisibleTab` 之前，把探测到的钉住元素设为 `visibility: hidden`（不用 `display: none`），拍完立即恢复。探测是开拍前滚 1 CSS 像素，视口坐标几乎不动的 `fixed` / `sticky`。这样页眉不会在每一屏重复，第一屏被页眉盖住的内容也能入图；页眉本身不出现在长图里。若隐藏前后 `scrollHeight` 或哨兵元素位置变化超过 2 CSS 像素，就停止并说明固定头会挡住内容，不交付一张静默重复页眉的图。

无限列表和虚拟列表：滚不到稳定的底，或 `scrollHeight` 在循环里持续变大，就停在段数上限并说明页面还在往下长。不承诺 SPA 虚拟列表。

拼完的 canvas 成为 `sourceCanvas` / `croppedCanvas`，`capturedDpr` 用拼接时的 dpr。之后的标注、马赛克、复制、下载、入库全部走现有编辑器，坐标就是这张大图的像素。

### 90 的文件

- 新的 `scroll-stitch.ts`：`destY`、步长、段数上限、固定头裁切，单测给数字
- `screenshot/index.ts` 接滚动循环和取消
- `utils/ui-text.ts` 失败文案：固定头、内部滚动容器、还在变长、超过大小、缩放不是 100%、横向不在范围内
- 实现前改 `docs/v2/screenshot.md` §2 和 §5 的失败表
- E2E 用仓库里的长文夹具，不要上真实网站。断言固定头只出现一次，或出现约定的失败文案；断言段与段之间没有明显的重复条

### 90 的风险

`captureVisibleTab` 的配额让一篇十屏的文章至少要数秒。等待放在页面里，和现有注释一致：worker 的定时器会晚。懒加载图片会在两段之间撑高页面，`destY` 必须用实际 `scrollTop`。Chrome 对 canvas 的单边和面积有上限，先试分配，失败就停，不要让页面崩。10 MiB 是现有入库上限（Q-03 仍是校准项）；本 issue 不提高它。提高上限要另做产品决定。

元素截图的离屏克隆不要拿来拼整页，字体和跨域图的降级是为单元素准备的。

### 90 的验收

对齐 #90：有滚动长图模式；分段 `captureVisibleTab` 按滚动偏移拼接；结果能批注、马赛克、复制、下载、入库；固定头、无限列表、超高、配额或体积不足都有文案；优先有限高度的文章页；遵守每秒最多 2 次和藏 UI 两帧；无新权限。

## 91 滚动坐标系

Phase 2。依赖 #90 的拼接和 #89 的叠加层。用户边滚边画，笔画挂在文档内容上，导出时落到长图像素上，看起来和先拼后批的同一支笔一致。

默认策略就一种，不并存两条合成管线：笔画记录在滚动内容坐标里，导出时栅格化到 #90 拼出的那张图上。分段各自栅格化再贴回去容易和「先拼后批」差出半像素，不做。

### 91 的坐标

文档坐标相对 `scrollingElement` 的内容原点，单位是 CSS 像素。视口坐标是客户区，不含浏览器外框。

```typescript
function viewportToDocument(point: CssPoint, scroll: { scrollLeft: number; scrollTop: number }): CssPoint {
  return { x: point.x + scroll.scrollLeft, y: point.y + scroll.scrollTop }
}

function documentToViewport(point: CssPoint, scroll: { scrollLeft: number; scrollTop: number }): CssPoint {
  return { x: point.x - scroll.scrollLeft, y: point.y - scroll.scrollTop }
}

function documentToStitchedPixel(point: CssPoint, origin: { scrollLeft: number; scrollTop: number }, dpr: number): CssPoint {
  return { x: (point.x - origin.scrollLeft) * dpr, y: (point.y - origin.scrollTop) * dpr }
}
```

例：dpr 为 2，起点 `scrollTop` 100，当前 `scrollTop` 500，视口里 y 为 40。文档 y 为 540，长图像素 y 为 `(540 - 100) * 2 = 880`。单测锁这些数。

滚动时叠加层用 `documentToViewport` 平移，不在 `scroll` 事件里改文档坐标。导出时用 `documentToStitchedPixel` 写入 #88 的 `Annotation`，再交给 `renderScreenshot`。

横向滚动：纯函数保留 `scrollLeft`。#90 的界面可以仍只做纵向，函数不要先写成只有 y。

钉住的层：落笔时，忽略扩展自己的节点，若指针下的元素是 `fixed`，或是正卡在视口边缘的 `sticky`，这条笔画标 `space: 'viewport'`。假设：导出长图时丢掉 viewport 笔画，并给一行说明。把它们画进每一段会重复，画进某一段会对不上。文档流里的笔画才跟随滚动。

缩放：与 #90 相同，`visualViewport.scale !== 1` 或 dpr 中途变化就降级，不另造一套缩放公式。

`overflow-anchor` 在 #90 的捕获期间关掉。#91 的跟随滚动不关它，否则会改变用户正在看的页。跟随用的是事件发生时的 `scrollTop`，不缓存上一次的增量。

### 91 的文件

- 新的 `entrypoints/content/screenshot/page-space.ts`，只放上面三个函数和 viewport 笔画的判定入参（由调用方传入「是否钉住」）
- `page-ink.ts` 在滚动模式下改记文档坐标
- `scroll-stitch.ts` 提供原点 `scrollTop` / `scrollLeft` 和 dpr，供导出换算
- 单测只测纯函数：滚动后再滚回来坐标不变；固定层不进长图；dpr 与原点的例题
- 实现时把默认策略写进 `docs/v2/screenshot.md`

### 91 的风险

`sticky` 在卡住之后，指针的文档坐标落在页眉下面的内容上，而不是页眉上。所以钉住判定要在落笔时做，不能等导出再猜。固定头被 #90 从后续段裁掉之后，viewport 笔画更不能硬画上去。缩放和横向滚动若没有夹具，就保持降级文案，不要假装对齐。

### 91 的验收

对齐 #91：文档写明默认策略和坐标系；滚动时笔画不漂；导出映射到长图像素，并与先拼后批的绘制函数相同；固定层、横向、非 100% 缩放有测试或明确降级；纯函数有单测。不重做拼接算法，不做录屏时间轴。

## 92 标签页像素录屏

Phase 2。用户手势开始和停止，当前标签页录成本地 WebM，麦克风可选。拒绝麦克风时仍保留画面。不上传，不建账号，不写 `screenshot` 条目，不改 #79–#86 的字段。

### 92 的实现

Service worker 没有 DOM，不能拿着 `MediaStream`。媒体放在 offscreen 文档里。仓库里还没有 offscreen 入口，新增 `entrypoints/offscreen/`，由后台在开始时 `chrome.offscreen.createDocument`，理由用 `USER_MEDIA`，停止后关掉。Chrome 同时只能有一个 offscreen 文档；现在没有别的用途，不要为录屏再开第二个。

```text
用户点击（内容脚本或扩展页，必须是用户手势）
  -> 后台校验发送者是目标标签的顶层框架，或扩展自己的页面
  -> chrome.tabCapture.getMediaStreamId({ targetTabId })
  -> offscreen：getUserMedia，chromeMediaSource 为 tab，带上 streamId
  -> 可选麦克风：见下方权限节。AudioContext 把两条音轨接到 MediaStreamDestination
  -> 视频轨仍用标签页的那一条
  -> MediaRecorder，mimeType 用 video/webm;codecs=vp9,opus，不支持时降到 vp8
  -> 停止：offscreen 里用 blob URL 调用已有的 chrome.downloads
```

回声：标签页音轨和麦克风只接进 `MediaStreamDestination`，不接 `AudioContext.destination`。麦克风打开回声消除。不要把标签页的声音再放出来。

假设：只录用户点下去时的那个 `tabId`。同一标签里导航，流还在，内容脚本会重载，后台在 `tabs.onUpdated` 完成后再把录制状态告诉新页面。这个监听只在录制进行时挂着，结束就摘掉，和取景框记忆的 `listenForFrames()` 一样，避免任何标签更新都唤醒 worker。标签关掉就停止并下载已有片段。用户切到别的标签时，捕获的仍是原来的那一个（后台标签可能被节流）。进行状态用 `chrome.action` 的徽章表示，徽章在浏览器外框上，不会被 `tabCapture` 拍进画面。页面里不要放一枚会被拍进去的录制灯。

假设：快捷键先不直接调用 `getMediaStreamId`。`commands` 是否算用户手势，要等真机确认。在那之前，快捷键只负责把开始按钮交到焦点上。

导航期间续录，不新开一段。这一点写进实现时的 `docs/v2` 说明，避免做成「一导航就停」或「跟着当前活动标签走」两种没人拍板的行为。活动标签切换时的「继续 / 停止」若要改，另做产品决定；默认是继续录被选中的那个标签。

落盘沿用截图下载的目录习惯：`AnnHub/recording-<本地时间>.webm`，`saveAs: false`。`DOWNLOAD_IMAGE` 今天只收 png/jpeg/webp，不要把 WebM 塞进那个校验。给下载单独一条消息，或在 offscreen 里直接调用 `chrome.downloads`，并复用 `DOWNLOAD_FAILED` 这种稳定错误码，不把浏览器原文给用户。

不入库。`ImageAsset.mimeType` 只有 `image/png`，单张 10 MiB，装不下视频，也不该装。资料库条目、导出 ZIP、`video` / `timestamp` 都不要碰。以后若要进库，是新的条目类型和存储契约，不在本 issue。

假设：内存里的片段到了约 15 分钟，或体积大到再涨就有风险时，自动停止并下载，文案说明已分段保存。不把片段写进 IndexedDB。

指标：假设 MVP 不新增事件。若要加，先改 `docs/v2/metrics.md`，只记枚举和时长分桶（有没有麦克风），不记 URL、标题、画面或音频。

从 session replay 借来的只有：开始/停止成对、徽章一直可见、用户没点之前不采集。像素录像不能事后打码。分享前的遮挡仍走 #85 的静图流水线；录屏里要挡，就在 #93 的叠加层上画，并且会烧进 WebM。

### 92 的文件

- 新的 `entrypoints/offscreen/` 录制页
- 新的后台服务或 `background-service/services/screenshot/` 旁的录制服务。消息登记在 `types/messages.ts`，handler、调用方、测试一起加
- `background-service/services/entries/sender.test.ts` 会把每个 handler 对着外部发送者跑一遍。新 handler 必须拒绝外部发送者，并且只接受目标标签的顶层框架或扩展页
- `wxt.config.ts` 的权限，见下一节
- 测试用假的 `tabCapture`、offscreen 和 `MediaRecorder`：麦克风被拒时仍有视频轨；音轨没有接到 `destination`；外部发送者被拒绝；下载的类型是 webm；IndexedDB 不出现新条目

### 92 的风险

见下一节的权限。另外：offscreen 被系统回收会丢掉未下载的片段，停止路径要先拿到 blob 再关文档。`MediaRecorder` 在 Chrome 114 上稳定的是 WebM；不要做 mp4 或 wasm 转码。后台标签的帧率会降，文案里写明录的是哪一个标签。

### 92 的权限影响

**需产品拍板。** 当前清单是 `storage`、`commands`、`downloads` 和 `<all_urls>`（`wxt.config.ts`，`permissions.md` §2–§4）。下面每一项在拍板之前不要写进清单，也不要改隐私政策。

Chrome 权限说明以 [Permissions](https://developer.chrome.com/docs/extensions/reference/permissions-list) 为准，该页更新日期 2026-09-09。

| 能力              | 清单                                                                       | 安装警告                                                                                                                                                                      | 还要改什么                                                                                                                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tabCapture`      | MVP 需要。`getMediaStreamId` 没有这项权限不能静默锁住当前标签              | 警告文案是 “Read and change all your data on all websites”。`<all_urls>` 已经是同一句，安装框里多半不会多出一行。能力本身是新的：会持续读取该标签的画面和标签音频             | `permissions.md` §2 加一行，§4 从「刻意没有」里划掉；§6 商店说明从 §2–§4 取材；§7 的改动清单；隐私政策中英权限表；`legal-pages.test.ts` 会失败直到表和清单一致                                                                   |
| `offscreen`       | MVP 需要。worker 不能录                                                    | 该页没有给出安装警告                                                                                                                                                          | 同样写进 §2 和隐私政策表。测试只认 `permissions` 数组里的字符串                                                                                                                                                                  |
| 麦克风            | 清单里没有对应权限名。运行时 `getUserMedia({ audio: true })`               | 没有新的安装警告。扩展源站会弹出麦克风授权。offscreen 和一闪而过的 popup **不能**弹出这个授权，要先在可见的扩展页（例如选项页或专门的录制页）拿到授权，offscreen 再打开麦克风 | 隐私政策第 1 节的数据边界加上「麦克风只进入本地 WebM，不上传」。商店的隐私实践申报麦克风。拒绝或失败时只录画面                                                                                                                   |
| `getDisplayMedia` | MVP 不用。它不增加清单权限，每次要用户在浏览器的选择器里选标签、窗口或屏幕 | 选择器本身就是提示                                                                                                                                                            | offscreen 的 `DISPLAY_MEDIA` 理由从 Chrome 116 才有，而本仓库最低版本是 114（`permissions.md` §5，`wxt.config.ts` 的 `minimum_chrome_version`）。走这条路要提高最低版本，或在 114、115 上禁用。这是全桌面/跨窗口的后续，不是 MVP |

拍板之后的同一次提交要一起改：`wxt.config.ts`、`docs/v2/permissions.md`、`website/public/privacy-policy.html`（中英权限表和数据流）、`website/public/terms-of-service.html` 的日期。法律页测试要求两份页面、两种语言的更新日期是同一天；只改隐私政策的日期会让测试失败。商店权限说明和隐私披露按 `permissions.md` §6、§7。根 `AGENTS.md` 的联动表已经把 `wxt.config.ts` 的权限指到 `permissions.md`、隐私政策权限表和商店说明，按那一行做，不要再发明第二份权限清单。

可选权限（`optional_permissions` + 用户手势下的 `chrome.permissions.request`）能让不录屏的用户看不到新能力。法律页测试今天只解析必选 `permissions` 数组：隐私表里写了 `tabCapture` 而它只在可选列表里，测试会认为「表里有、清单没有」。若拍板走可选权限，同一次提交要让测试把可选权限也视为已申报，而不是删掉断言。

最低版本维持 114 时，MVP 只用 `tabCapture` + offscreen `USER_MEDIA`。不要为了 `getDisplayMedia` 在同一次改动里提高 `minimum_chrome_version`。

### 92 的验收

对齐 #92：用户手势开始和停止；本地 WebM；麦克风失败时仍有画面；混音不回放造成回声；默认不上传、不强制账号；指标不含页面内容；权限、隐私政策和清单在功能代码之前按上一节改完；导航行为按本节写明；录制中的批注不在本 issue。

## 93 录屏批注与光标高亮

Phase 3，也可以紧跟 #92 做成 2.5。依赖 #92 的像素流和 #89 的叠加层。`tabCapture` 拍的是标签页合成结果，画在页面上的笔和光标环会进 WebM，不需要再在 offscreen 里合成一遍。

### 93 的实现

- 笔、箭头、矩形沿用 #89 / #88。录制过程中可以开关。停止时 `page-ink` 摘掉节点和监听，并停掉轨道。
- 控件（工具、颜色、停止）放在扩展页或工具栏弹出层，不放进标签页。页面里只留墨迹、光标环和点击涟漪，否则工具栏会烧进教程视频。Presentify 的「不显示控制面板」是同一取舍。
- 光标环：`pointer-events: none` 的层，跟 `pointermove`。假设最小集合是环、圆角方、菱形三形，颜色用同一五色，大小一档能改即可。左键涟漪认 `event.button === 0` 且 `isUserInput`。右键动画和闲置隐藏不做。
- 交互策略：环和涟漪不拦截点击，页面照常操作。笔、箭头或矩形武装之后，这一笔的 `pointerdown` 由叠加层吃掉，页面收不到这次手势。按住 Alt 时叠加层穿透，方便边讲边点。这是批注模式的临时拦截，不是让画笔和页面点击同时发生。

### 93 的文件

- `page-ink.ts` 增加环、涟漪和 Alt 穿透
- 录制服务只负责开始/停止时通知内容脚本，不解析笔画
- `utils/ui-text.ts`
- 测试：停止后节点和监听都没了；环的 `pointer-events` 是 `none`；武装画笔时页面收不到该次点击；Alt 按下时收得到

### 93 的风险

内容脚本在导航后重载，环会消失直到后台再次注入。注入完成前的几帧没有环，可以接受。不要把环画进一个会挡住点击的全屏层。Spotlight 和缩放不在这里做。

### 93 的验收

对齐 #93：录制中能开关至少箭头、笔、矩形，并且出现在 WebM 里；可选光标高亮和左键涟漪；交互策略按上一节；停止后清理；只留在本地。

## 94 Spotlight 与 Zoom 以及 rrweb

Phase 3 的评估。本 issue 的交付就是这一节，不写功能代码，不加入 rrweb 依赖，不接云端回放。

### 94 的聚光灯

标签页内可行，工作量小，排在 #93 之后若产品还要再做。全视口叠加一层，`pointer-events: none`，用径向遮罩在光标周围留空，其余铺半透明黑。`tabCapture` 会拍到这层。能调的是半径和暗度，存在现有 `storage` 里。盖不住浏览器外框和别的窗口。形状用圆或圆角方即可。

### 94 的缩放

延后，而且不是 CSS 能干净做完的。

- 放大页面（`transform` / `zoom`）会重排，录出来的教程和用户操作的布局不是同一个。
- 叠加一个「放大镜」却采样不到页面像素。内容脚本读不了标签页视频帧。用 `captureVisibleTab` 填放大镜会撞上每秒 2 次的配额，看起来是幻灯片。
- 和 Presentify 接近的做法，是 offscreen 里把视频帧画到 canvas，再把光标周围放大画回去。页面上的笔已经在帧里，不能再叠一次。这是一条新的合成管线，比 #93 大，默认不排期。
- 整屏放大是系统能力，扩展不做。

### 94 的像素 WebM 与 rrweb

|            | 像素 WebM（#92 的交付）                            | rrweb 事件包                                                                 |
| ---------- | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| 体积       | 视频，分钟级可以到几十到上百 MB                    | 普通文档较小；含 canvas 快照时也会大                                         |
| 保真       | 用户看见的像素、字体、canvas、视频画面             | 重放 DOM。canvas、WebGL、跨源 iframe、封闭 shadow 保真差。重放端字体可以不同 |
| 隐私       | 画面里有什么就录什么，含当时可见的输入。麦克风另计 | 记录 DOM 文本和输入值，必须默认掩码。没有麦克风，但仍能漏出页面内容          |
| 播放       | 系统播放器打开 WebM                                | 要自带播放器，不是普通视频文件                                               |
| 本地优先   | 下载到磁盘，无账号                                 | 事件包可以只放本地，但很容易被做成上传。播放器不是资料库已有的能力           |
| 和教程产物 | 用户要的就是带笔和声音的视频                       | 适合排障回放，替代不了 WebM                                                  |
| 和本仓库   | `downloads` 已有                                   | 新依赖、新界面。内容脚本约定不改宿主 DOM 去挂钩，事件录制要挂钩整个文档      |

建议：

- **做：** 像素 WebM（#92）以及其上的笔和光标环（#93）。
- **延后：** 聚光灯。等 #93 稳定后再决定，实现就是 CSS 遮罩，不新开权限。
- **不做：** rrweb 导出、rrweb 播放器、云端 session replay、整屏缩放、离屏放大镜合成。若将来有人重提 rrweb，它只能是 WebM 之外的可选本地文件，默认掩码输入，默认不上传，并且不替换 WebM。在那之前不加入依赖。

### 94 的验收

对齐 #94：书面结论在本页；有可行实现和工作量；有对照表；做、不做、延后写明。不实现 Spotlight、Zoom，不接入 rrweb。

## 相邻 issue 的边界

| Issue            | 本页怎么对待                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| #81 序号徽章     | 共用 `toolbar.tsx` 的五色和 `annotations` 撤销栈。徽章的计数、拖动、删除、重置由 #81 自己加一个 `tool`。本页不设计徽章外观 |
| #79–#86 视频截帧 | 静态画面加 `video` / `timestamp` 等属性，见 PR #87。录屏不读播放进度，不写这些属性，不改 `sourceUrl`                       |
| #85 打码         | `mosaic` 工具和匿名检测保持原语义。荧光笔不是打码。录屏不能事后打码                                                        |
| #86 OCR          | 继续延后，本页不选型本地或远程识别                                                                                         |

## 假设

下面每一条都是假设。和产品拍板不一致时，以拍板为准，并先改 `docs/v2/` 再改代码。

1. 线宽三档，中档等于今天的 `Math.max(2, 3 * scale)`；荧光笔线宽再乘 3，alpha 0.35，不用 multiply。
2. 渐变描边、形状填充、右键点击动画、光标闲置隐藏，都不在对应 issue 的交付里。
3. #89 的入口是截图会话里的模式，不新增快捷键。捕获用「藏 UI + 重放笔画」。自动擦除默认关，只作用于叠加层。
4. #90 只滚文档滚动根，纵向，最多 30 段，PNG 仍受 10 MiB 限制。超出时保留已拼好且能编码的部分并说明。非 100% 缩放就停，取消丢弃。固定头在每帧拍摄时 `visibility: hidden`；隐藏引起布局跳动就停并说明。页眉本身不进长图。
5. #91 只用文档坐标加导出栅格化。钉住的笔画不进长图。
6. #92 在权限拍板之前不改清单和隐私政策。拍板后的 MVP 是必选 `tabCapture` 与 `offscreen`，外加运行时麦克风。不提高 Chrome 114。不入库。同一标签导航后续录。徽章表示状态。约 15 分钟自动停止。MVP 不加指标事件。
7. #93 的控件在扩展界面里，不在页面里。Alt 穿透。
8. #94 的聚光灯延后，缩放和 rrweb 不做。
