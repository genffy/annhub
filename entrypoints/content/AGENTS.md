# Content Script 约定

> 适用于当前 `entrypoints/content/` 实现；不是未来 monorepo 的目标划分。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-10。

## 职责与入口

- 页面里只有两种采集：剪藏（选区/区块）与截图。`index.tsx` 编排选区菜单、区块入口、区块模式和截图会话；高亮不在页面里（资料库读剪藏时才做，R2）。
- `selection-menu.ts` 是两项菜单（剪藏、截图，顺序固定）：无最短长度、全空白选区不出现；选区端点在 input、textarea、contenteditable 里不出现；键盘 `Tab` 聚焦某一项后 `Enter` 才触发，没聚焦时回车属于页面；悬停/聚焦约 300ms 显示后果提示（extension.md §2.1）。`onScreenshot` 钩子可缺省：子框架里菜单只有“剪藏”（D-29）。open shadow root 里的选区用 `getComposedRanges` 取范围，没有这个接口的 Chrome 降级为 `selection.toString()` 的纯文本剪藏（`plainTextForSelection`，D-25）。
- `clip-flow.ts` 一次点击保存 + 约 3 秒「已剪藏 · 撤销 · 编辑」提示 + 快速编辑气泡；失败保留选区与已输入内容并给重试（extension.md §3）。条目 ID 由调用方生成并随重试复用（保存幂等），`startedAt` 在点击时记下随消息发出。三个保存函数返回 `ClipOutcome | ClipFailure`：失败带后台的稳定错误码，`showFailureToast` 按码说明原因（配额不足时提示先导出），不认识的码只说“保存失败”，绝不回显原始信息。气泡只提交用户改动过的字段（`UPDATE_ENTRY` 的 `properties.set`、`note`），等响应成功才关闭，失败时气泡与输入都在、错误按同一套码显示在气泡里；标签超限在提交前就地提示。
- `markdown.ts` 是唯一的 DOM→Markdown 转换（链接、标题层级、列表、代码块、表格、强调；页面界面与隐藏内容剔除；100k 块边界截断），选区与区块共用，不各自实现。约定：`<br>` 是硬换行（行尾两个空格），表格单元格内折叠为空格；嵌套列表缩进到父项内容列；页面界面按 class/id 的**词**匹配剔除（语义容器不做 class 启发式）；文本节点里的 Markdown 记号按字面转义（`escapeText`），渲染器 `entrypoints/library/markdown-view.tsx` 的 `inlineRuns` 与 `learning-core/markdown.ts` 的纯文本化共用同一个转义约定，改一处要三处一起改。
- `page-meta.ts`：语境提取（取选区两端最近的块级祖先，上限、包含选区）、页面 meta（author/published/description/title）与永久链接（X 帖子 status 链接、一节标题锚点、其余页面地址）。meta 过长或不合规时降级而不是让保存失败：title、description 在字符边界截断并折叠换行，多位作者按分隔符拆开、超长单项丢弃。
- `blocks.ts` 七种区块识别，只在指针停留后沿祖先链（含 open shadow root）运行，不整页扫描；识别逐元素兜底，任何元素出错都等于“没有候选”，永不向页面抛异常。“一节”在标题与段落平铺的页面上是标题到下一个同级或更高级标题的兄弟区间（`BlockCandidate.range`，描边用 `candidateRect` 取外接矩形，转换与锚点只取区间）；内容容器按 class **词**匹配，没有 `article`/`main`/已知容器时取文字密集的 `div`（直接含至少三个有文字量的块）。`block-hover.ts` 悬停胶囊（右上角跨边缘、角点被占依次避让、高块贴窗口可见上沿）与键盘区块模式（`Tab`/`↑↓`/`Enter`/`S`/`Esc`，链接不响应点击）。键盘模式的状态是 `modeChain`（目标的层级链，最里层在前）与 `modeDepth`：链只在换目标时整体替换，`↑↓` 只动深度——所以 `↓` 走回 `↑` 走过的链；每个单元都从它的锚点（`candidateAnchor`：一节取标题，其余取元素本身）重新探测，`Tab` 才能在标题与段落平铺的页面上走各节，`Enter`/`S` 保存的就是描边的那个（含 `range`）。同层单元（`peersOf`）只在按 `Tab` 时现算，指针移动不重扫整页、也不滚页（只有键盘移动才 `scrollIntoView`）。起点是键盘焦点所在的单元，否则是视口里第一个（`firstVisibleChain`，D-27 的默认）；模式取得键盘焦点（焦点原先在子框架里时，按键才会到这里），退出时还回去。状态行是 `role=status` 的活动区，只读“类型 · 摘要”（一节只读它那一段），按键提示不在其中反复播报。
- 浮层样式全部挂在 `[data-ann-ui]`/`.ann-*` 命名空间下，经 manifest 注入（不使用 shadow root），不改宿主页面的 DOM。

## 输入信任与站点规则

- 会话在页面 DOM 里，页面脚本能派发任何事件：一切会走到特权 API（截取、跨域代取、保存）的入口只认 `user-input.ts` 的 `isUserInput`（`event.isTrusted`）或扩展自己的消息（`TRIGGER_SCREENSHOT`/`TRIGGER_BLOCK_MODE`）。jsdom 的事件都不可信，单测 mock `isUserInput`。
- 新站点的永久链接规则集中维护（X 帖子在 `page-meta.ts` 的 `resolvePermalink`，Medium 文章规则待补），不要在业务模块散写 hostname 分支。
- 页面常在 `document` 上监听单键快捷键：扩展自己的输入框（快速编辑、截图文字标注）要把键盘事件留在自己界面里（`stopPropagation`）。
- 同源 iframe 与 open shadow root 里的选区和区块必须可用；跨源 iframe、可编辑区、受限页不出现入口也不报错（capture.md §3）。内容脚本注册到所有框架（`allFrames`），子框架只在与顶层同源时启用。截图会话、取景坐标和被截取的标签页都属于顶层框架的视口，所以子框架里只提供剪藏（D-29）：菜单没有“截图”、胶囊没有“截图”、区块模式没有 `S`，两个快捷键只发给顶层框架，子框架收到也不理。

## 截图

- 区域截图从视口 CSS 坐标按 dpr 裁剪，调用 `captureVisibleTab` 前隐藏扩展 UI 等两帧；元素截图经离屏克隆栅格化，跨域图片由 background 代取内联（`FETCH_IMAGE`）。
- 拖拽松开后选区进入待确认态（`Enter` 确认、`Esc` 取消），单击元素路径不变；吸附、八向手柄、方向键微调、`Shift` 临时锁比、层级 `↑↓` 与元素+边距的几何换算都是 `screenshot/selection.ts` 的纯函数，会话只做接线（screenshot.md §1.2、§1.4）。
- 上次取景框按标签页 + 路径存 `sessionStorage`（`pagehide` 清除），元素锚点带 10% 容差；找不到元素时滚回记录位置沿用，取景框超窗只提示不强截。
- 区域截取前用透明 sweeper 清扫悬停样式并等 `pageStable`（连续两帧布局不变，最长 500ms），元素 + 边距能放进视口时走区域截取，放不下提示而不是截不全。
- 选区内本地标注与马赛克只把处理后的 PNG 交后台入库；确认/复制/下载三个去处互相独立，复制与下载保留会话；`http:` 页面复制提示下载（screenshot.md §4）。JPEG 下载一律先铺白（`matteOnWhite`），透明处不会变黑。入库的 `startedAt` 是点击“保存”的时刻（D-22），不含此前的编辑时间；失败文案经 `screenshotFailureText`/`screenshotSaveErrorText` 由稳定错误码生成，不显示后台的原始信息。
- 会话期间在 capture 阶段吞掉可信的 `click`/`dblclick`/`auxclick`/`contextmenu`/`submit`（扩展自己的界面内除外，进入预览后恢复）：取消 `pointerdown` 挡不住随后的 `click`，不吞的话单击选取链接会真的跳转（`e2e/page-entry.spec.ts` 守着）。
- 匿名默认值来自设置（`GET_SETTINGS`），会话内 `A` 切换；`Esc` 在文字输入期间先关输入框。

## 验证

- 改转换、识别、菜单或胶囊：跑 `npx vitest run`（相关单测）并构建后跑对应 E2E（`e2e/selection-clip.spec.ts`、`e2e/block-clip.spec.ts`、`e2e/screenshot-capture.spec.ts`、`e2e/page-entry.spec.ts`、`e2e/page-shapes.spec.ts`）。`page-shapes` 用平铺文档、div 汤、Docusaurus、带 meta 的文章、各类内容形状和页面界面类名的夹具，在真实浏览器里验识别与转换；转换器的转义约定还要跑 `learning-core/__tests__/fixtures/page-text.ts` 的共享夹具（`__tests__/markdown.test.ts` 里）。
- 改截图链路先跑 `entrypoints/content/screenshot/__tests__`；改选区确认、吸附、手柄、层级或取景框记忆后跑 `e2e/r3-frame.spec.ts`（改源码必须 `rm -rf .output/chrome-mv3 && npm run build` 再测，`.output` 不随源码变化重建）。
