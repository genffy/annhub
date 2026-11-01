# 样式、弹窗与设置页

> 适用范围：`entrypoints/library/` 的样式、工具栏弹窗与设置页；上级约定见 [../AGENTS.md](../AGENTS.md)。

- `settings-view.tsx` 管设置。
- 本地指标面板按 [metrics.md §5](../../../docs/product/metrics.md) 的近似口径覆盖 M-03、M-11、M-19–M-25 与 M-31（录制使用）：计算在 `learning-core/metrics.ts` 的 `metricSummaries`，经 `GET_METRICS` 一次读回，页面只渲染聚合数字。
- 设置页的水印预览复用输出侧的 `paintWatermark`，图片读不出来时只画文字并提示重新上传。
- 「录制」分区显示麦克风授权状态、可就地发起授权请求（extension.md §2.5、annotate.md §2.1），并设置录制时的光标高亮——开关、形状与颜色（annotate.md §3.2）。

- 样式是手写 CSS：`style.css` 开头有自己的重置，设计令牌在 `styles/tokens.css`，没有 Tailwind 也没有它的 preflight。
- 控件不会自己继承字体，重置里要写 `button, input, select, textarea { font-family: inherit }`，否则每个控件都用浏览器自己的字体，弹窗的重置同理（测试：`e2e/library-shell.spec.ts` 与 `e2e/popup-entry.spec.ts` 量计算后的字体）。
- 新增按钮、输入和链接按钮要自己写外观，否则显示浏览器默认外观。
- 强调色有两个令牌：`--ann-accent` 是填充（按钮底、描边、焦点环），文字用 `--ann-accent-text`；
- 类型色另有九个令牌 `--ann-type-<type>`、`--ann-type-<type>-soft`、`--ann-type-<type>-text`（图标/描边、标签底色、标签与高亮计数的文字，亮暗成对，取值见 `styles/tokens.css`），类型色只做辅助不单独表意，当前导航项仍整行用强调色；
- 暗色下两者不同，强调色文字压在 `--ann-accent-soft` 上时用错令牌只有 2.58:1（测试：`e2e/library-layout.spec.ts` 与 `e2e/popup-entry.spec.ts` 量类型标签与阅读视图的当前标签）。
- 弹窗是 520 宽的壳：左侧 52 像素图标栏、右侧 `.popup-body`，高度随内容（最小 340，浏览器弹窗上限 600，壳不竖向滚动），快捷键提示在 `.popup-body` 里、列表下方，不能做成壳的第三列。
- 弹窗同时是批注与录制的入口（annotate.md §1.1、§2.1）：当前页可批注时给批注按钮，录制入口带麦克风开关、进行中显示时长，开始失败与下载失败就地说明并可重试或放弃；
- chrome:// 等内容脚本进不去的页面给原因而不是按钮。
- 筛选条会换行，不能溢出或互相盖住，里面的控件也不能比所在的框更宽，整页不能横向滚动；
- 筛选弹层（`.filter-pop`）是 `position: fixed` 的浮层，避开滚动容器的裁剪，宽度用 `max-width: min(360px, calc(100vw - 16px))` 收在窗口里。
- 版式由 `e2e/popup-entry.spec.ts`（弹窗的宽度、暗色对比度）、`e2e/library-browse.spec.ts`（筛选条在 1180、1024、390 像素宽度下）和 `e2e/library-layout.spec.ts`（列表的卡片网格、设置页的行与控件、Markdown 表格、窄窗口图标栏）用 `getBoundingClientRect` 与 `getComputedStyle` 断言守着。
- 设置页在 `.page-body` 里滚动（导航不跟着走，visual.md §4），内容是两列卡片网格（容器查询：内容宽窄于约 860 变一列）。
- 每张卡片是容器（`container-type: inline-size`）：行在卡片窄于约 420 时改成上下排，按卡片宽度判断，不按视口写断点（视口 721 像素时卡片只有约 420 像素宽）。
- 控件都是原生表单控件加样式，共用件在 `settings-card.tsx`（卡片与行）、`settings-switch.tsx`（`role="switch"`，读屏名称是行的功能名，`aria-labelledby`）、`settings-seg.tsx`（分段单选组）、`settings-slider.tsx`、`settings-posbox.tsx`、`settings-check-chip.tsx`、`settings-swatches.tsx`（色块取 `output.ts` 的 `backgroundCss`，不另抄色值）。
- 滑块拖动中只改本地值，`pointerup` / `keyup` / `blur` 才 `patch`，失败不丢值并提示（测试：`e2e/settings-drafts.spec.ts`）。
- 层叠规则：容器上的通配规则会盖住类名上的外观（如 `.settings-view button` 会压掉 `.hl-dot-*` 的背景）；
- 给一类控件设的上限会被同类名的复合控件继承（`.filter` 的 `max-width` 也套在带着这个类的日期范围上）；
- 容器里放着用户内容（Markdown）时，容器的元素规则要写成子代选择器（`.drawer-section > h3`，不带 `>` 会连正文里的 `##` 标题一起压掉；测试：`e2e/library-layout.spec.ts` 拿阅读视图当参照量抽屉里的标题）；
- 权重相同的规则按源码顺序取胜（窄窗口里计数徽章的填充规则要把 `.nav-item-current .nav-count` 一起列上）；
- TSX 里的类名没有对应规则时页面照样渲染，只是排版散掉。
- 新增类名时先写规则，再看真实页面。
- 窄窗口图标栏只有 60 像素：品牌用 `assets/icons/logo.svg` 的遮罩（构建时内联进 CSS）代替字样，文字留给读屏；计数徽章与分组小标题收起，图标仍有 `title` 提示。折叠后的新元素要在 `e2e/library-layout.spec.ts` 的“都在图标栏里”断言下过；折叠按钮也在图标栏里（`e2e/library-shell.spec.ts`）。
