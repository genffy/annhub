# Library 页面约定

> 适用范围：`entrypoints/library/`（应用页：全部、剪藏、高亮、截图、属性、设置，详情抽屉，阅读视图）与 `entrypoints/popup/`（同一套壳的紧凑版）。全局规则见根目录 [AGENTS.md](../../AGENTS.md)；按主题的细则见下面的按需读取。

## 职责与入口

- `App.tsx` 是应用页的壳，`route.ts` 是 hash 路由的读写；`reading-view.tsx`、`highlight-surface.tsx`、`markdown-view.tsx` 是阅读与库内高亮，`property-panel.tsx`、`properties-view.tsx`、`property-order.ts` 管属性，`settings-view.tsx` 管设置，`filter-bar.tsx` 管筛选条，`entrypoints/popup/App.tsx` 是同一套壳的紧凑版。各部分的细则见按需读取。
- 页面不复制领域规则：条目的查询与写入只经 `types/messages.ts` 的消息；查询、校验、归一化在 `learning-core`。页面只在三处直接开同源 IndexedDB，都是读大块字节或要求逐 Blob 处理的地方：截图卡片读图片 Blob、导出（`export-dialog.tsx` 只做界面与状态，`onExport` 用 `buildExport` 逐 Blob 构造 ZIP，把 Blob URL 交给 `chrome.downloads`，下载时机与文件名不变）、设置页清理孤儿资产。
- 视图、筛选、抽屉里打开的条目和阅读视图都写入 URL hash，刷新后恢复（extension.md §2.2）；
- 路由状态只有 URL 一个真源：`route.ts` 的 `readHash` 与 `listHash` 是一对带往返单测的纯函数，列表路由用 `e=<id>` 表示抽屉（`#/entry/<id>` 同样打开抽屉），阅读是 `#/read/<id>`，带 `?h=<高亮 id>` 时打开后滚到那条高亮（高亮视图的每条高亮都这样链接）。
- 写 URL 只发生在用户操作里（导航链接 push，筛选 `replaceState`），不在 state 变化的 effect 里重写，也不覆盖它不认识的路由。
- 写入纪律：编辑在失焦或确认时提交一次（属性值先改本地草稿，`Enter` 或失焦提交，输入法组合期间不提交；高亮浮层的备注失焦只保存、不关浮层）；失败保留已输入的内容，显示本地化的错误与重试；任何关闭路径（`Esc`、遮罩、返回、导航）先提交未保存的编辑（根 `AGENTS.md` 第 5 条）。任何写入成功后列表、总数、导航计数与候选一起刷新（`reload`）。
- 文案全部走 `utils/ui-text.ts`（中英对应），不在 TSX 里写字面量（测试：`utils/__tests__/ui-literals.test.ts` 用语法树拦：JSX 文字、面向用户的属性、字符串里的汉字，以及模板字符串各段与 `+` 拼接里的全角标点）。
- 拼出来的名称整句放进 `ui-text`，由各语言给出自己的标点（`reading.highlightLabel`：中文“高亮，黄色：原文”，英文“Highlight, Yellow: …”），不在代码里拼“：”；
- 错误由稳定错误码映射成本地化文案（`failureReason`/`entryErrorText`，配额不足时带“先导出”的说明），不直接展示错误码或后台的英文 message；
- 导出失败的原因按阶段与错误类别选（`export-error.ts`），每条都说明没有生成文件。
- 载入期间列表为空时显示“加载中”，不显示空状态。
- 列表与高亮视图的查询随要发出的查询文本重跑（`entryQueryJson`、`highlightQueryJson`），不随注册表重跑：随注册表回复再发同一个查询，第二次往返期间已经显示的空状态会变回“加载中”（测试：`e2e/library-browse.spec.ts`）。
- URL 带属性条件时，查询等注册表回来再发，不先显示未筛选的列表。

## 按需读取

| 主题                       | 文件                                                             |
| -------------------------- | ---------------------------------------------------------------- |
| 壳、导航、列表、筛选与卡片 | [notes/shell-and-lists.md](notes/shell-and-lists.md)             |
| 阅读、抽屉与属性           | [notes/drawer-and-properties.md](notes/drawer-and-properties.md) |
| 样式、弹窗与设置页         | [notes/styles-and-settings.md](notes/styles-and-settings.md)     |

## 验证

- 渲染与偏移换算等纯函数：`npx vitest run entrypoints/library`。
- 页面行为：先 `rm -rf .output/chrome-mv3 && npm run build`，再跑：
  - `e2e/library-browse.spec.ts`
  - `e2e/library-drawer-edit.spec.ts`
  - `e2e/library-export.spec.ts`
  - `e2e/library-layout.spec.ts`
  - `e2e/library-properties-page.spec.ts`
  - `e2e/library-property-regressions.spec.ts`
  - `e2e/library-queries.spec.ts`
  - `e2e/library-shell.spec.ts`
  - `e2e/reading-highlight.spec.ts`
  - `e2e/settings-drafts.spec.ts`
  - `e2e/popup-entry.spec.ts`
- 选区一律用真实鼠标和键盘操作（三击、拖选、`dblclick`），不要程序化设置 Range 再派发合成事件；双击一个词时点词自己的中点（用 Range 量），不要点包含它的片段的中点——片段的中点可能落在邻词上。
