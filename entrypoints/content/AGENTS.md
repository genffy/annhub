# Content Script 约定

> 适用于当前 `entrypoints/content/` 实现；不是未来 monorepo 的目标划分。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-08。

## 职责与入口

- 页面里只有两种采集：剪藏（选区/区块）与截图。`index.tsx` 编排选区菜单、区块入口、区块模式和截图会话；高亮不在页面里（资料库读剪藏时才做，R2）。
- `selection-menu.ts` 是两项菜单（剪藏、截图，顺序固定）：无最短长度、全空白选区不出现，键盘 `Tab`/`Enter` 可操作，悬停/聚焦约 300ms 显示后果提示（extension.md §2.1）。
- `clip-flow.ts` 一次点击保存 + 约 3 秒「已剪藏 · 撤销 · 编辑」提示 + 快速编辑气泡；失败保留选区与已输入内容并给重试（extension.md §3）。
- `markdown.ts` 是唯一的 DOM→Markdown 转换（链接、标题层级、列表、代码块、表格、强调；页面界面与隐藏内容剔除；100k 块边界截断），选区与区块共用，不各自实现。
- `page-meta.ts`：语境提取（句/段、上限、包含选区）、页面 meta（author/published/description/title）与永久链接（X 帖子 status 链接、一节标题锚点、其余页面地址）。
- `blocks.ts` 七种区块识别，只在指针停留后沿祖先链（含 open shadow root）运行，不整页扫描；`block-hover.ts` 悬停胶囊（右上角跨边缘、角点被占依次避让、高块贴窗口可见上沿）与键盘区块模式（`Tab`/`↑↓`/`Enter`/`S`/`Esc`，链接不响应点击）。
- 浮层样式全部挂在 `[data-ann-ui]`/`.ann-*` 命名空间下，经 manifest 注入（不使用 shadow root），不改宿主页面的 DOM。

## 输入信任与站点规则

- 会话在页面 DOM 里，页面脚本能派发任何事件：一切会走到特权 API（截取、跨域代取、保存）的入口只认 `user-input.ts` 的 `isUserInput`（`event.isTrusted`）或扩展自己的消息（`TRIGGER_SCREENSHOT`/`TRIGGER_BLOCK_MODE`）。jsdom 的事件都不可信，单测 mock `isUserInput`。
- 新站点的永久链接规则集中维护（X 帖子在 `page-meta.ts` 的 `resolvePermalink`，Medium 文章规则待补），不要在业务模块散写 hostname 分支。
- 页面常在 `document` 上监听单键快捷键：扩展自己的输入框（快速编辑、截图文字标注）要把键盘事件留在自己界面里（`stopPropagation`）。
- 同源 iframe 与 open shadow root 里的选区和区块必须可用；跨源 iframe、可编辑区、受限页不出现入口也不报错（capture.md §3）。

## 截图

- 区域截图从视口 CSS 坐标按 dpr 裁剪，调用 `captureVisibleTab` 前隐藏扩展 UI 等两帧；元素截图经离屏克隆栅格化，跨域图片由 background 代取内联（`FETCH_IMAGE`）。
- 选区内本地标注与马赛克只把处理后的 PNG 交后台入库；确认/复制/下载三个去处互相独立，复制与下载保留会话；`http:` 页面复制提示下载（screenshot.md §4）。
- 匿名默认值来自设置（`GET_SETTINGS`），会话内 `A` 切换；`Esc` 在文字输入期间先关输入框。

## 验证

- 改转换、识别、菜单或胶囊：跑 `npx vitest run`（相关单测）并构建后跑对应 E2E（`e2e/selection-clip.spec.ts`、`e2e/block-clip.spec.ts`、`e2e/screenshot-capture.spec.ts`）。
- 改截图链路先跑 `entrypoints/content/screenshot/__tests__`。
