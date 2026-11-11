# 页面批注与录制

> 适用范围：`entrypoints/content/annotation/` 与录制光标；上级约定见 [../AGENTS.md](../AGENTS.md)。

- 批注层（annotate.md §1）在 `annotation/layer.ts`：透明覆盖层骑浏览器的 top layer（`showPopover`），页面自己的浮层、全屏内容与原生模态对话框盖不住它。
- 原生模态对话框会挡住其余全部指针（包括这层），所以对话框开着时层挪进对话框里住、关闭后挪回（`syncDialogPlacement`，`dialog:modal` 需要 Chrome 105+）。
- 没选工具时页面照常可交互，选了工具后一笔拖画只落在层上。
- 墨迹在层存活期间存在：退出、刷新、导航即清空，不保存任何东西。
- “截图”按钮（或截图快捷键）把墨迹交给截图会话，层先藏起来，会话结束再把舞台还回来（`index.tsx` 的 `enterScreenshotWithInk`）。
- 工具栏可设自动擦除（关闭/3 秒/8 秒三档，默认关闭，annotate.md §1.2）。
- 墨迹模型只有一份，在 `annotation/ink.ts`（annotate.md §1.2）：笔画按画下那一刻的**页面** CSS 坐标存储（跟随页面滚动），画在钉住窗口的元素（fixed、当前吸顶的 sticky）上的笔画保持视口坐标并带 `pinned` 标记——滚动长图不带上它。ink 换算成截图编辑器标注的规则也只在这里：整段落在取景框内的保持原生形状，完全在外面的丢弃，跨界的在边界处切断。
- 画笔与荧光笔的笔画是轨迹（annotate.md §1.2）：`points` 就是指针的样点，只追加。
- 两点形状（直线、箭头、矩形、椭圆）的 `points[1]` 是“终点”，每次移动改写它——对轨迹工具也这样做，就会让每一笔都带一条起点到终点的连线，拖动时还有一条跟着指针的线（`follow` 按工具分两条路；测试：`annotation/__tests__/layer-strokes.test.ts`）。
- 样点用 `pointer-samples.ts` 的 `pointerSamples` 取，批注层与截图编辑器共用：浏览器每帧只派发一个 `pointermove`，一帧里折叠的移动在 `getCoalescedEvents()` 里，不读就是折线。
- `pointerup` 的合并列表是空的，退回事件本身。
- 平滑只在 `screenshot/editor.ts` 的 `tracePath`（二次曲线以样点为控制点、过相邻样点的中点，首尾半段是直的，所以笔迹从第一个样点起、到最后一个样点止）：两边都经 `drawAnnotation` 画，墨迹截进编辑器样子不变。
- 直线、箭头、矩形、椭圆与墨迹裁剪出来的 `polyline` 不走它（矩形的角是角）。
- 钉住窗口的笔画（`isPinnedPoint`）从第一个样点起存视口坐标：存成加了滚动量的页面坐标，而 `inkToViewport` 又把它当视口坐标用，滚动之后画的笔画会落在指针下方一个滚动量的位置。
- 画布在选了工具时 `touch-action: none`：缺了它，触摸与手写笔的第一次移动被浏览器当成平移，随后 `pointercancel`，什么也画不出。
- 一次只画一笔（已有笔画在进行中，或不是主指针的 `pointerdown` 不开始新的一笔，`move`/`up`/`cancel` 按 `pointerId` 过滤）。
- `Ctrl`/`Cmd`+`Z` 在 `onKeydown` 里：选了工具且焦点不在可编辑区域时才拦下撤销，“指针”时属于页面（annotate.md §1.2）。
- 录制时（annotate.md §3）被录标签页有光标高亮与点击涟漪（`cursor-highlight.ts`：`pointer-events: none`，指针离开页面时隐藏，截图截取期间也隐藏，免得高亮进了图）。
- 录制状态的到达路径：脚本启动时先读 `chrome.storage.local` 的录制标记（[storage.md §2](../../../docs/product/storage.md)），读到真才经 `RECORDING_STATUS` 问一次后台——普通页面加载与同源子框架加载不唤醒 worker。
- 此后以 `RECORDING_LIFECYCLE` 消息为准，每个框架都跟着开关光标高亮；生命周期消息到过之后，迟到的启动读数不得回滚它（`lifecycleSeen`）。录制中批注层以无工具栏形态打开（`setRecordingMode`），批注的控件不进画面（annotate.md §3.1）。

- 改批注层、墨迹或它的换算：先跑 `entrypoints/content/annotation/__tests__`，再跑 `e2e/page-annotation.spec.ts`；改录制状态接线或光标高亮后跑 `e2e/recording-annotation.spec.ts`。
