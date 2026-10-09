# Library 页面约定

> 适用于当前 `entrypoints/library/`（应用页：全部、剪藏、高亮、截图、属性、设置，详情抽屉，阅读视图）和 `entrypoints/popup/`（同一套壳的紧凑版）；不是未来 monorepo 的目标划分。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-09。

## 职责与入口

- `App.tsx` 是壳：左导航、hash 路由、列表、详情抽屉。`reading-view.tsx`、`highlight-surface.tsx`、`markdown-view.tsx` 是阅读与库内高亮；`markdown-view.tsx` 是渲染以及“选区 ↔ 源文本偏移”换算的唯一实现（RK-13），界面与导出不各自换算。`property-panel.tsx`、`properties-view.tsx` 管属性，`settings-view.tsx` 管设置。
- 页面不开 IndexedDB，也不复制领域规则：数据只经 `types/messages.ts` 的消息；查询、校验、归一化在 `learning-core`。
- 视图、筛选、抽屉里打开的条目和阅读视图都写入 URL hash，刷新后恢复（extension.md §2.2）；路由状态只有 URL 一个真源。
- 写入纪律：编辑在失焦或确认时提交一次；失败保留已输入的内容，显示本地化的错误与重试；任何关闭路径（`Esc`、遮罩、返回、导航）先提交未保存的编辑（根 `AGENTS.md` 第 5 条）。
- 文案全部走 `utils/ui-text.ts`（中英对应），不在 TSX 里写字面量；错误由稳定错误码映射成本地化文案，不直接展示错误码或后台的英文 message。
- 渲染不解析原始 HTML；链接只允许 http(s)，新标签页打开并带 `rel="noopener noreferrer"`（capture.md §3.1）。

## 验证

- 渲染与偏移换算等纯函数：`npx vitest run entrypoints/library`。
- 页面行为：先 `rm -rf .output/chrome-mv3 && npm run build`，再跑 `e2e/library-export.spec.ts`、`e2e/reading-highlight.spec.ts`。选区一律用真实鼠标和键盘操作（三击、拖选、`dblclick`），不要程序化设置 Range 再派发合成事件。

## 已知问题

> 2026-10-09 在真实 Chromium（Playwright 加载构建产物）里对照 `docs/v2` 复核的结果，基线提交 `cfe7c2c`。「实测」是已复现的，「读码」是读代码得出的，先写测试确认。
> 优先级：P0 主流程不可用或数据写错；P1 与契约不符但有绕行；P2 清理与质量。完成标准与处理顺序见 [roadmap.md 第 3、5 节](../../docs/v2/roadmap.md)，需要拍板的点见 [validation.md 第 5 节](../../docs/v2/validation.md)（每条有默认，不阻塞）。
> 每条先写能复现的失败测试，再修；不要放宽断言、跳过或隔离测试来求绿（根 `AGENTS.md`）。修完在本节删除该条，历史看 git。

- **RV-LIB-01 · 阅读视图关不掉，路由丢失**（P0）。契约：extension.md §2.2、§4.2；US-LIB-03。
  - 现象（实测）：抽屉里点“阅读”后地址栏仍是 `#/all`；`Esc` 和 ← 都没有反应；刷新回到列表；直接打开 `#/read/<id>` 也被改写成 `#/all`。抽屉里打开的条目同样不在 URL 里，刷新即丢。
  - 位置：`App.tsx` 的 `readHash`、`writeHash` 与 `hashchange` 监听：每次 state 变化都按当前视图重写 hash，把 `#/read/<id>` 覆盖掉；`onClose` 用 `history.back()`，退回的历史项 hash 相同，不触发 `hashchange`，`readingId` 不清；`reading-view.tsx` 的 `Esc` 走同一条路径。
  - 要求：URL 是路由状态的唯一真源（URL → state 单向，写 URL 只发生在用户操作时）；打开阅读 = 导航到 `#/read/<id>`，打开抽屉 = 写入可恢复的条目参数；关闭 = 回到进入前的列表路由（保留筛选，尽量保留滚动位置），深链进入时回到该条目所属类型的列表，不依赖 `history.back()`；`writeHash` 不覆盖它不认识的路由。快速编辑气泡的“更多属性”经 `OPEN_EXTENSION_PAGE` 带的 `view=<entryId>` 页面根本不读（读码），改成打开那一条；两端一起改，并清理没有用的 `export` 参数。
  - 测试：e2e 走真实点击路径（行 → 抽屉 → 阅读）断言地址、`Esc` 关闭、← 关闭、刷新恢复、深链进入后关闭；“更多属性”打开的页面里抽屉显示该条目。**同时改正 `e2e/reading-highlight.spec.ts` 里“刷新后 `reading-view` 变为 detached”的断言**，它与 extension.md §4.2 相反。

- **RV-LIB-02 · 列表只显示最新 50 条**（P0）。契约：search.md §4；US-LIB-01；D-28。
  - 现象（实测）：60 条的库只渲染 50 条，没有翻页入口（响应里的 `nextCursor` 从未被页面使用）；来源、标签下拉的候选来自第一页，最老条目独有的来源或标签筛选不到，没有标签时标签下拉整个不出现。
  - 位置：`App.tsx` 的 `QUERY_ENTRIES` 调用与 `refreshCounts`（用第一页条目推导候选；每次载入和每次关抽屉发 4 次整库查询）。
  - 要求：按 D-28 默认提供“显示更多”（追加下一页，键盘可达，总数常显）；候选与计数由后台一次聚合返回（见 RV-BG-04 的 facets），不在前端用一页数据去推；翻页期间新增或删除条目不重复、不漏项（沿用 keyset 游标）。
  - 测试：120 条夹具，能浏览到最老一条；最老条目独有的标签与来源出现在下拉里并可筛选。

- **RV-LIB-03 · 写入后列表陈旧**（P0）。契约：extension.md §2.3、§4.1；US-LIB-01。
  - 现象：从抽屉删除条目后数据库少一条，列表仍显示该行，顶部“共 N 条”不变（实测）；抽屉里改标题、标签、备注后列表行不更新；`DELETE_ENTRY` 失败时抽屉照常关闭（读码）。
  - 位置：`App.tsx` 的 `DetailDrawer` 关闭与删除分支、`refreshCounts`（只更新导航计数与候选，不重查列表）。
  - 要求：任何写入成功后，列表、总数、导航计数同步；失败时保留抽屉，显示本地化错误与重试。
  - 测试：删除后断言 DOM 行数、“共 N 条”与导航计数；改标题后行内标题变化；让后台返回失败时抽屉保留并报错。

- **RV-LIB-04 · 高亮视图的搜索与筛选没有接线**（P1）。契约：extension.md §2.3；search.md §5；US-LIB-01、US-LIB-03。
  - 现象：`#/highlights` 里搜索框与来源、标签、属性、时间控件都不改变结果，搜无意义的词仍显示全部分组；没有颜色筛选；`#/highlights?q=Alpha`、`#/properties?…` 刷新后搜索框为空（`readHash` 只剥掉 `all|clips|screenshots` 前缀）（均为实测）；顶部计数显示的是条目数而不是高亮数（读码）。
  - 位置：`App.tsx` 的 `refreshCounts`（`QUERY_HIGHLIGHTS` 只以空 query 调用）、`readHash`、`writeHash`。
  - 要求：高亮视图把当前搜索与筛选发给 `QUERY_HIGHLIGHTS`，增加颜色筛选，计数为“共 N 条高亮”；时间按高亮自己的创建时间（领域层见 RV-CORE-05）；组序按 D-24 的默认；URL 的生成与解析收敛成一对带单测的纯函数，所有视图往返一致。
  - 测试：两个剪藏各一条不同颜色的高亮，搜索、颜色、来源、标签、时间各筛一次；带筛选的 `#/highlights?…` 刷新后恢复。

- **RV-LIB-05 · 属性与设置的值逐键持久化**（P0）。契约：extension.md §4.1（改动在失焦或点击保存时写入）；US-PROP-01。
  - 现象（实测）：文本属性在每个 `onChange` 里 `UPDATE_ENTRY`，而输入框的 `value` 来自回写后的条目（受控输入 + 异步回写）：0ms 间隔输入 15 个字符只保存下 5 个；在中间插入时光标被重置到末尾；每个按键还各发一条 `entry.property_edited`。中文输入法的组合输入会被打断（推断，未实测）。设置页的水印文字、质量与透明度滑块同样每次变化就写一次。
  - 位置：`property-panel.tsx` 的 `ValueEditor`、`setValue`、`persist`；`settings-view.tsx` 的 `patch` 调用。
  - 要求：本地草稿 + 失焦、`Enter` 或保存按钮时提交一次；组合输入期间不提交；失败保留草稿并显示本地化错误与重试；关闭前提交（RV-LIB-08）；滑块类控件在松手（`change`）时提交，拖动中只更新本地预览。
  - 测试：`keyboard.type(text, { delay: 0 })` 后输入框和存储里的值都等于输入；在中间插入后光标位置不变；派发 `compositionstart`/`compositionend` 序列的用例。

- **RV-LIB-06 · 添加属性**（P0）。契约：entry.md §5.2、§5.3 第 7 条；US-PROP-01。
  - 现象（实测）：添加 `date`、`datetime` 属性必败（默认值 `''` 被校验拒绝，页面显示“值不符合该属性的类型或上限”）；添加 `text`、`list` 把 `""`、`[]` 写进存储（违反“空值=未设置”，也虚增使用数）；添加 `checkbox` 直接写入 `true`（应只在被切换后写入）。注册表里已有的 text、list 属性再次添加不产生行（读码）。
  - 位置：`property-panel.tsx` 的 `addProperty`、`defaultValueFor`。
  - 要求：添加只登记定义（必要时）并让这一行进入可编辑状态；行的出现由界面状态决定，而不是存储里的空值；用户输入有效值后才写入；空串、空数组、清空一律删键。
  - 测试：六种类型各添加一遍，断言存储里没有空值；已在注册表里的属性可以再次添加。

- **RV-LIB-07 · 属性面板与属性页的其他缺口**（P1）。契约：entry.md §5.2–§5.5；extension.md §2.4；US-PROP-01、US-PROP-02。
  - 列表属性一律经过 `normalizeTags`（每项 ≤ 32 字符、≤ 20 项）：`author` 等列表属性编辑时长项被静默丢弃（读码）。标签的更紧上限只用于 `tags`，其余按列表类型的上限（50 项、每项 100 字符）。
  - 清空 `title` 即删除该属性（实测；entry.md §5.4 不可清空）。清空时恢复原值并提示；领域层同样拒绝（RV-CORE-03）。
  - 属性页的“使用数”由前端用 `QUERY_ENTRIES { limit: 200 }` 的结果自己数：205 条的库里用了 3 次的属性显示 0，且删除按钮可点（实测）。使用数由后台按整个库计算后返回（store 已有 `propertyUsageCount`），“删除未使用”的确认列表也用它。
  - 内置属性 `author`、`published`、`description` 的预设勾选点了又弹回（实测；存储层静默忽略，见 RV-CORE-02）；预设列里只有 `title`、`tags` 固定。
  - 新建属性表单没有“默认值”输入；系统字段（`type`、`source`、`created`、`updated`）应在面板里只读显示，现在只有一行来源与创建日期（读码）。

- **RV-LIB-08 · 备注清不掉；关闭路径丢输入**（P0）。契约：根 `AGENTS.md` 第 5 条；extension.md §4.1、§4.2、§6。前置：RV-BG-03。
  - 现象（实测）：抽屉里清空备注后失焦，库里的旧备注仍在（`{ note: undefined }` 经 JSON 序列化丢掉该键，后台收到 `{}`）；备注框里有未保存文字时按 `Esc` 关闭抽屉，文字丢失。高亮浮层里：在备注框输入后点“删除”或颜色点，先触发的失焦保存并关闭浮层，随后的点击落空，高亮仍在。浮层备注超过 1,000 字符时写入失败，而浮层已经关闭，输入丢失（读码）。
  - 位置：`App.tsx` 的 `DetailDrawer` 中 `persist`；`highlight-surface.tsx` 的 `HighlightPopover`（`onBlur → onNote → setPopover(null)`）。
  - 要求：协议能表达清除（`null` 语义，见 RV-BG-03）；所有关闭路径先提交未保存的编辑；浮层失焦只保存、不关闭，关闭由用户的显式操作触发，按钮点击不被失焦吞掉；写入失败保留浮层与输入，显示错误与重试。
  - 测试：清空备注往返；备注里有未保存文字时按 `Esc`，再打开能看到该文字；浮层里输入后点删除，高亮被删除；点颜色，颜色改变。

- **RV-LIB-09 · 阅读视图的高亮保真**（P0）。契约：entry.md §4.1–§4.2；extension.md §4.2；RK-13；US-LIB-03。前置：RV-BG-03。
  - 表格（实测）：渲染成 `<pre>` 且去掉了分隔行，却仍以首行的 `data-s` 为基准，后续行偏移错位。在第 2 个数据行双击 “Bob” 存成 `start:39, end:42, quote:"ine"`（指向上一行 `Engineer` 里的字符）；表格里也不渲染高亮。表格要逐单元格带 `data-s` 渲染（或保留分隔行的源文本只隐藏它），高亮能创建并显示。
  - 元素端点（实测）：`offsetInSource` 对 `startContainer`、`endContainer` 是元素的选区，把 DOM 子节点下标当成全文字符偏移；三击选中整段、`Ctrl+A`、跨块拖选都会命中，三击时不出现工具条。先把元素端点归一为相邻的文本位置，再换算。
  - 引文（实测）：`quoteForRange` 取的是源 Markdown 切片，跨链接、粗体的选区会带上 `](url)`、`**`（得到 `See [the docs](https://example.com/docs) and **bold words** now`）。entry.md §4.2 要求“被选中的渲染文字，纯文本”：由选区的渲染文字生成引文，再按 §4.2 去首尾空白并限长。
  - 软换行（实测）：多行段落的行与行之间没有空白（`paragraphline`）。段内换行渲染为空格，硬换行渲染为 `<br>`。
  - 链接目的地含括号（读码）：`INLINE` 里的 `\([^)\s]+\)` 在第一个 `)` 结束，`…/Foo_(bar)` 被截断。用平衡括号规则。
  - 工具条的“备注”只创建高亮、不打开备注输入（extension.md §4.2），`highlight.created` 的 `has_note` 恒为 `false`；`H` 快捷键不检查修饰键，`Ctrl+H` 也会创建高亮（读码）。
  - 测试：e2e 用真实鼠标（三击、拖选、`dblclick`）；`markdown-view` 单测用固定 Markdown 夹具（表格、嵌套列表、含括号的链接、行内代码、围栏、多行段落），断言 `content.slice(start, end)` 的渲染文字等于引文。

- **RV-LIB-10 · 抽屉、导航与可访问性**（P1）。契约：extension.md §2.2、§4.1、§7.2；US-LIB-02。
  - 抽屉声明了 `aria-modal`，却没有焦点陷阱、关闭后不回到触发位置、没有遮罩（点遮罩关闭，extension.md §4.1）；`Esc` 在输入法组合期间也会关闭（推断）。
  - 窄屏（≤ 720px）下导航靠 `font-size: 0` 加 `::first-letter` 只剩首字母：英文的 Screenshots 与 Settings 都是 “S”，没有图标也没有提示；`.nav-note`（导出结果）整个隐藏；阅读视图的右栏直接 `display: none`（规格：收到正文下方）。图标栏要有图标与可读名称，不隐藏状态信息，右栏下移。
  - 导航底部缺“截图快捷键提示”（extension.md §2.2）。
  - 测试：键盘用例（抽屉内 `Tab` 循环、关闭后焦点回到触发行）；窄窗口 e2e（图标栏可分辨、导出结果可见、阅读右栏可达）。roadmap 第 5 节的键盘与读屏走查在这些修好之后才有意义。

- **RV-LIB-11 · 设置页缺口**（P1）。契约：extension.md §2.5；storage.md §7。读码加页面检查。
  - 没有“默认高亮颜色”的入口（`defaultHighlightColor` 无处设置）；水印图片超过 512 KB 时静默忽略，且上传后无法移除；快捷键只是静态文字（应显示当前绑定，并给出到浏览器快捷键设置页的入口）；异常残留资产只显示数量（应能列出 ID 并清理）。

- **RV-LIB-12 · 其他界面缺口与文案泄漏**（P1）。契约：extension.md §2.3、§2.6、§2.7、§5、§6。
  - 首次引导卡没有“打开示例页面”（`public/sample.html`、`sample.en.html` 无人引用）。
  - 截图视图应是画廊（缩略图、标题、来源主机，悬停出现下载与删除），全部与剪藏列表里的截图行应带缩略图，抽屉里的截图应可放大并下载；现在是文字行。缩略图可由原图重建（storage.md §2）。
  - 弹窗点击条目应在资料库里打开该条目，现在只打开列表（`entrypoints/popup/App.tsx` 的 `openLibrary`）。
  - 导出失败时显示“保存失败”，应显示原因与未导出项（extension.md §6）；汇总里的 `· N missing` 是硬编码英文。
  - 文案泄漏与兜底：`built-in`、`· context`、`<h3>context</h3>`、`'not found'`、`'update failed'`，以及多处直接展示后台返回的错误码。全部走 `ui-text.ts` 与错误码映射；`utils/__tests__/locale-keys.test.ts` 旁补一条检查，TSX 里不得出现未登记的用户可见字面量。

- **RV-LIB-13 · 搜索的调用方式**（P1）。契约：search.md §6（搜索不得阻塞页面交互）；metrics.md §9（`library.queried`）。
  - 现象（实测）：搜索框每个按键触发一次 `QUERY_ENTRIES` 和一条 `library.queried`（6 个字符 6 条）；页面载入也记一条；`filters` 恒为 `'0'`。
  - 要求：防抖（约 250ms）并取消过期请求；`library.queried` 只在用户发起的搜索或筛选落定后记一次，`filters` 为启用的筛选维度数（分桶）；计数与候选由一次聚合返回（RV-BG-04）。
  - 测试：键入 6 个字符只发 1 次查询、记 1 条事件；页面载入不记。
