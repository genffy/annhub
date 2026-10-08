# Content Script 约定

> 适用于当前 `entrypoints/content/` 实现；不是未来 monorepo 的目标划分。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-08。

> 页面里没有高亮：选区菜单只有剪藏与截图，页面不留标记，没有回访恢复和连续高亮模式；高亮在资料库里读剪藏时完成。下文的高亮、marker、恢复与连续高亮描述的是尚未移除的旧实现，按路线图 R1 移除；剪藏新增区块入口（见 [采集规则](../../docs/v2/capture.md)）。

> 碎片、采集窗口、媒体片段与 AI 不属于产品范围，目标契约见 [条目数据契约](../../docs/v2/entry.md) 与 [采集规则](../../docs/v2/capture.md)。下文 HoverMenu 的“碎片”动作和“Fragment 采集”一节描述的是尚未移除的旧实现，按路线图 R1 移除；移除前只为修缺陷改动，不在它上面加新功能。

## 职责与入口

- `index.tsx` 编排选区菜单（HoverMenu）、连续高亮模式和截图会话；`mode-manager.ts` 管连续高亮模式的开关。HoverMenu 目前提供四个动作：碎片 / Fragment（打开采集 Modal，旧实现）、高亮（备注可选）、剪藏（出现约 3 秒的“已剪藏”撤销条）、截图，悬停或聚焦约 300ms 显示“耗时 · 产物”提示（目标是剪藏、高亮、截图三项，extension PRD §2.1）。连续高亮模式由 `Alt+H` / `Cmd+Shift+H` 进入，每次选中只创建一条高亮，`Esc` 退出（extension PRD §7.1）。
- `annotation-core/` 只处理站点规则、DOM policy、Range 和 marker；`highlight/` 负责高亮业务与恢复；`capture/` 负责 Fragment 草稿和 Modal；`screenshot/` 负责本地截取与编辑。

## 页面内容与高亮

- 新站点的内容容器和永久链接规则集中加到 `annotation-core/platform-rules.ts`，不要在业务模块散写 hostname 分支。
- 区块剪藏（[capture.md §6.2](../../docs/v2/capture.md)）的区块识别只在指针停留之后运行，只检查指针下的祖先链（含 open shadow root），不整页扫描；滚动、拖选和输入时不运行。胶囊与描边是扩展自己的浮层，不改宿主页面的 DOM，位置要避开宿主页面自己的按钮。
- 页内的输入框（剪藏后的快速编辑气泡、截图的文字标注）要把键盘事件留在扩展自己的界面里：页面常在 `document` 上监听单键快捷键（X、YouTube、GitHub、Gmail），在气泡里打字不能触发它们。这是读码得到的线索，没有运行复现过；实现时补一条带单键快捷键的 fixture 用例。
- 引导里的“打开示例页面”如果是扩展自己的 `chrome-extension://` 页面，内容脚本的匹配范围 `<all_urls>` 通常不会注入它，首次使用的第一条剪藏就采不了；示例页要么是普通网页地址，要么显式注入。同样是读码线索，未运行复现。
- selector 优先稳定 `data-*`、非动态 ID、过滤后的 class、结构路径；动态 ID 由共享规则过滤。
- 当前跨页恢复合并页面 URL 命中与同域 `metadata.sourceUrl` 命中，按 ID 去重；SPA 恢复在立即、1 秒、2 秒、3 秒重试，selector 失败时回退到正文文本搜索。
- Annotation Core 不做颜色、备注、存储等业务决策。页面规则、Range 或 marker 变化时跑 annotation-core 与 highlight 单测及相关 E2E。

## Fragment 采集

- `capture/capture-context.ts` 从 Selection Range 构造内容、句段语境、页面来源和 DOM 定位。提取失败可让用户修正，不用空语境直接入库。
- Modal 分标准“核验 -> 应用”与深度“理解 -> 核验 -> 应用”两种流程（深度模式是全局偏好，单次可切）。核验步骤是来源语境对照卡 + “确认已核对”勾选 + 核验来源（原文 / 手工），摘要/备注默认折叠；修改 content/excerpt/source/kind 或核验来源会清除确认。“回到原文”把窗口收成底部条并滚动、标记选区（CSS Custom Highlight），已填内容保留。保存要求应用非空且不是 content/excerpt 的复述——没有语言词数门槛；重复内容先提示，用户确认后可强制保存。
- 关闭时有输入必须经 `CloseDialog`：继续编辑 / 改存为高亮 / 改存为剪藏 / 放弃（页面选区已不存在的草稿只有前后两项）；改存把已填文字写进备注，埋点记 `fallback`。保存失败保留全部输入并提供重试 / 复制我的输入 / 改存为剪藏 / 导出内容；保存前先做配额校验。
- “同时高亮原文”在 Fragment 保存成功后单独执行，失败不回滚 Fragment，成功态给出“重试高亮”。表单状态 300ms 防抖写入 `chrome.storage.session`（SW 启动时开放给 untrusted context），同会话导航后可恢复；保存失败保留全部输入；卸载时清理监听器和定时器。
- 界面文案按语言本地化（[extension.md §2.7](../../docs/v2/extension.md)）：用户可见的文案（含“碎片 / Fragment”）只经 `utils/ui-text/`，每个 key 必须同时给出 zh 与 en，语言随浏览器界面语言，不写死中文或英文；窗口配色只用 `capture/theme.tsx` 的令牌（品牌紫 + 亮暗外观）。
- 这条流程不属于目标契约，按路线图 R1 移除；目标契约见 [条目数据契约](../../docs/v2/entry.md) 与 [采集规则](../../docs/v2/capture.md)。移除之前改它只为修缺陷，改完跑 capture 单测和 Fragment E2E。

## 截图

- 区域截图从视口 CSS 坐标按 dpr 裁剪；调用 `captureVisibleTab` 前隐藏扩展 UI。元素截图经离屏克隆栅格化，跨域资源由 background 内联。
- 会话在页面 DOM 里，页面脚本能派发任何事件，所以截图会话的指针与按键只认 `user-input.ts` 的 `isUserInput`（`event.isTrusted`）；触发只走 background 的消息，兜底触发是调用隔离环境里注册的 `SCREENSHOT_TRIGGER_GLOBAL`，不要再用 `window` 自定义事件。任何会走到特权 API（截取、跨域代取）的新入口都按同样的规则：起点是用户输入或扩展自己的消息。jsdom 的事件都不可信，单测里 mock `isUserInput`。
- 选区内本地标注与马赛克只把处理后的 PNG 交给后台；保存和下载失败时保留编辑会话。目标资产与条目契约见 [docs/v2/screenshot.md](../../docs/v2/screenshot.md) 与 [docs/v2/entry.md](../../docs/v2/entry.md)。
- 改截图链路时跑 `entrypoints/content/screenshot/__tests__`，构建扩展后跑 `e2e/screenshot-capture.spec.ts`。
