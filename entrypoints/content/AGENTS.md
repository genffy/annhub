# Content Script 约定

> 适用于当前 `entrypoints/content/` 实现；不是未来 monorepo 的目标划分。全局规则见根目录 `AGENTS.md`。
> 更新：2026-09-25。

## 职责与入口

- `index.tsx` 编排 Mode A、Mode B 和截图会话；`mode-manager.ts` 管全局模式。Mode A 的 HoverMenu 提供四个动作：Fragment（打开采集 Modal）、高亮（可加备注）、剪藏、截图（extension PRD §2.1）。Mode B 由 `Alt+H` / `Cmd+Shift+H` 进入，选中即 Clip+高亮，`Esc` 退出。
- `annotation-core/` 只处理站点规则、DOM policy、Range 和 marker；`highlight/` 负责高亮业务与恢复；`capture/` 负责 Fragment 草稿和 Modal；`screenshot/` 负责本地截取与编辑。
- `vocab-label/` 是历史专项模块。只在明确要求兼容、清理或迁移时修改其产品行为。

## 页面内容与高亮

- 新站点的内容容器和永久链接规则集中加到 `annotation-core/platform-rules.ts`，不要在业务模块散写 hostname 分支。
- selector 优先稳定 `data-*`、非动态 ID、过滤后的 class、结构路径；动态 ID 由共享规则过滤。
- 当前跨页恢复合并页面 URL 命中与同域 `metadata.sourceUrl` 命中，按 ID 去重；SPA 恢复在立即、1 秒、2 秒、3 秒重试，selector 失败时回退到正文文本搜索。
- Annotation Core 不做颜色、备注、存储等业务决策。页面规则、Range 或 marker 变化时跑 annotation-core 与 highlight 单测及相关 E2E。

## Fragment 采集

- `capture/capture-context.ts` 从 Selection Range 构造内容、句段语境、页面来源和 DOM 定位。提取失败可让用户修正，不用空语境直接入库。
- Modal 分标准“核验 -> 应用”与深度“理解 -> 核验 -> 应用”两种流程（深度模式是全局偏好，单次可切）。核验是用户显式确认（记录时间与来源，摘要/备注可选）；修改 content/excerpt/source/kind 会清除确认。保存要求应用非空且不是 content/excerpt 的复述——没有语言词数门槛；重复内容先提示，用户确认后可强制保存。
- “同时高亮原文”在 Fragment 保存成功后单独执行，失败不回滚 Fragment。表单状态 300ms 防抖写入 `chrome.storage.session`（SW 启动时开放给 untrusted context），同会话导航后可恢复；保存失败保留全部输入；卸载时清理监听器和定时器。
- kind、核验字段和最新产品语义以 [docs/v2/fragments.md](../../docs/v2/fragments.md) 与 [docs/v2/processing.md](../../docs/v2/processing.md) 为准，当前实现以源码为准。改采集流程时跑 capture 单测和 Fragment E2E。

## 截图

- 区域截图从视口 CSS 坐标按 dpr 裁剪；调用 `captureVisibleTab` 前隐藏扩展 UI。元素截图经离屏克隆栅格化，跨域资源由 background 内联。
- 选区内本地标注与马赛克只把处理后的 PNG 交给后台；保存和下载失败时保留编辑会话。目标资产与 `visual` 契约见 [docs/v2/screenshot.md](../../docs/v2/screenshot.md)。
- 改截图链路时跑 `entrypoints/content/screenshot/__tests__`，构建扩展后跑 `e2e/screenshot-capture.spec.ts`。
