# 截图编辑器的美化、水印、序号与线宽

> 适用范围：`entrypoints/content/screenshot/` 的输出与标注工具；上级约定见 [../../screenshot/AGENTS.md](../AGENTS.md) 与 [../../AGENTS.md](../../AGENTS.md)。

- 美化（screenshot.md §4.4）的合成只有一份实现，在 `screenshot/output.ts`（背景、内边距、圆角、阴影、画布比例与水印；预览、复制、下载共用）。
- `beautify-panel.ts` 是工具栏“美化”打开的面板，纯 DOM、不留状态：显示会话给它的样式，只报告用户改了哪个字段，复原与“改动即开启”的结果由会话 `sync` 回去。
- 会话里有三块画布：`sourceCanvas`（原始截取）、`croppedCanvas`（再加匿名、马赛克与标注，入库存的就是它）、`displayCanvas`（再加美化与水印，预览显示、复制与下载发出去的就是它）。
- `displayCanvas` 永远是单独的一块：给 `canvas.width` 赋值会清空画布，与 `croppedCanvas` 合成一块时，一画标注整张图就空了。
- 标注坐标是截取画布的坐标，预览上的指针位置要先减去 `contentOrigin`（内容在画布里的偏移）。
- 画布渐变用 `createLinearGradient`，把 CSS 渐变字符串赋给 `fillStyle` 画出来是黑的；阴影的 alpha 与图形自己的 alpha 相乘，所以阴影由画在画布外的不透明图形经 `shadowOffsetX` 投到内容上。
- 背景、内边距、圆角的取值与默认样式只在 `output.ts` 定一次（`BEAUTIFY_BACKGROUND_IDS`、`PADDING_PX`、`BEAUTIFY_RADII`、`DEFAULT_BEAUTIFY`，背景的颜色与明暗在 `BEAUTIFY_BACKGROUNDS`），面板、设置页的选项和 `settings-schema.ts` 的校验与默认值都从它派生。
- 背景的名字是 `ui-text` 里的 `shot.beautify.background.<id>`，不在界面里用字母或数字编号。
- 美化面板的摆放由 `placePanel` 算：预览旁边（先右后左），放不下再放工具栏下方、预览上方；原位仍然清爽就不挪，不盖住预览与工具栏，不出窗口。
- 预览按 `previewBox` 在选区周围长大，超出视口时缩小，工具栏跟着挪；复制与下载仍是完整像素。
- 尺寸标签由 `placeSizeLabel` 放：预览左上角外侧，上方放不下或被工具栏占着就放下方，再不行放进左上角内侧（`SIZE_LABEL_ROOM` 是它在上方要的地方，也是预览离窗口顶的最小距离，两处必须是同一个数）；它 `pointer-events: none`，放进图里也不挡画标注。
- 面板打开时键盘落在它的第一个控件上，`Esc` 先关面板（焦点回美化按钮），再次按下才取消会话。
- 预览出现时键盘落在工具栏的第一个按钮上：工具栏是 React 根，第一次渲染用 `flushSync` 同步提交——React 19 的 `createRoot().render()` 可能晚于下一帧才提交，找按钮的那一帧就扑空，焦点留在页面上（测试：`e2e/screenshot-capture.spec.ts` 连开 6 次预览）。
- 水印（screenshot.md §4.3、§5）的排版与绘制也只有一份实现，在 `screenshot/output.ts`：`watermarkLayout` 排版（图片在前、文字在后，整行贴着所选的角；只有文字时保持原来的锚点，不量字宽），`paintWatermark` 绘制，设置页的预览与它共用 `watermarkBox`。
- `enabled` 是唯一的开关，图片和文字只是内容：关着时不解码、不画，`W` 也不出现；`W` 同时开关图片与文字，只影响这一次。
- 图片在会话拿到设置时解码一次（`decodeWatermarkImage`，用 `HTMLImageElement.decode()`：设置校验只看 PNG 签名和大小，“头是对的、内容坏了”的文件要靠解码才发现），之后 `refreshDisplay` 同步地画。
- 解码在拖拽选区期间就结束了；预览已经出来时才结束，就补画一次。
- 读不出来是 `null`：只画文字，不抛错也不写日志（screenshot.md §5）。
- 文字的墨色随背景明暗换（`onDark`），图片按原样画、不换色；两者共用同一个 `globalAlpha`，画完复位。
- 水印只画在 `displayCanvas` 上，入库存的 `croppedCanvas` 从不带水印，所以预览、复制与下载是同一份像素。
- 设置页预览同样调用 `paintWatermark` 画图片与文字，改画法时只改这一份，不在设置页另抄一份。
- 文字标注框的所有关闭路径——`Enter`、`Esc`、点别处、开下一个框——都走 `commitText`：已输入的文字变成标注，空框不留标注。它先清 `textInput` 再 `remove()`：Chrome 在移除有焦点的元素时同步触发 `blur`，顺序反了会重入，外层的 `remove()` 抛“节点已不是子节点”的 DOMException（测试：`e2e/screenshot-beautify.spec.ts`；页面抛错会让用例失败）。
- 序号（screenshot.md §1.1）是标注的一种（`StepAnnotation`），和其他标注在同一个数组里、由同一个 `renderScreenshot` 画，不另开绘制路径。
- 数字不存：`stepNumbers` 按放下的顺序在同一组（`sequence`）里现数，所以删掉一个，后面的自动前移；“重置计数”只把会话的 `stepSequence` 加一。
- 撤销栈存快照（标注数组加 `stepSequence`），画上、写下、放下、拖动、删除与重置都经 `commit` 进栈，`undo` 整体还原；按住拖动时只重画，松开才 `commit`。
- 选中只是会话的 `selectedStep` 加一个 DOM 圆圈（`screenshot-step-selection`，里面是“×”），不画进任何画布；`shownStep` 只在工具是序号、没有按住、徽章还在标注里时才算选中，撤销拿走的徽章不会留下圆圈。
- 大小、命中、贴边与墨色都在 `editor.ts`（`stepRadius`、`stepAt`、`clampStep`、`stepInk`），随 `capturedDpr` 缩放，会话只接线。
- 荧光笔、直线与线宽（screenshot.md §1.1）也是普通标注，由同一个 `renderScreenshot` 画。
- 画笔、直线、荧光笔的标注带 `width`（细、中、粗），像素由 `editor.ts` 的 `lineWidth` 按工具与 `capturedDpr` 换算；矩形、椭圆、箭头没有这个字段，固定 3 像素。
- 荧光笔是一条路径只描一次，`globalAlpha` 取 `HIGHLIGHTER_ALPHA`，所以来回涂不加深，画完 `restore`；直线按住 `Shift` 时终点经 `snapLine` 落到最近的水平、竖直或 45° 线上，每次指针移动与松开都按事件的 `shiftKey` 重算。
- 会话只记当前的 `lineWidth`：和颜色一样每次截图从默认开始，换线宽不进撤销栈；这三种工具开着时，工具栏下方显示线宽一行。
