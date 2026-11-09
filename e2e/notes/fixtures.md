# 专项夹具

> 适用范围：`e2e/` 里页面形状专用的 HTML 夹具，以及用到它们的测试；上级约定见 [../AGENTS.md](../AGENTS.md)。

- `keyboard-blocks.html`（几个并列的单元：区块模式从焦点所在的单元起步，`Tab` 按文档顺序在同档单元间移动；测试：`block-clip.spec.ts`）
- `timeline.html`（X 式时间线：帖子列紧挨侧栏，Parent 停在帖子、离开与 Esc 收起描边，胶囊的左右缘留在帖子内）
- `hover-geometry.html`（窄块、紧贴窗口顶的块、代码卡片与过短的 `section`：胶囊盖住静止的指针后仍在，标注留在窗口里、不压胶囊，行数不算末尾换行；测试：`block-hover-geometry.spec.ts`）
- `x-article.html`（X 长文页的 hydrated 形态：嵌套阅读视图、og 标题、节标题、引用卡与时间戳条；测试：`platform-x.spec.ts` 的长文下载用例）
- `media`（视频帖与滚到第二张的多图轮播：`screenshot-media.spec.ts` 读预览画布像素，断言当前视频帧与当前幻灯在元素截图里）
- `columns`（三栏页：内栏自滚、窗口 scrollY 为 0 时，划词菜单仍贴内栏的选区）
- `longpage.html`（滚动长图的五屏长页）
- `virtualfeed.html`（回收单元格的虚拟时间线，同一个结构路径在不同滚动高度是另一条帖子；测试：`screenshot-frame.spec.ts` 的“沿用上次取景框时页面不动”）。`page-shapes.spec.ts` 在真实浏览器里验识别与转换。
