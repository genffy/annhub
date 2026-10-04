# 体验与指标

> 层级：product
> 状态：产品度量真源
> 更新：2026-10-04

本文定义 AnnHub 的激活、核心习惯、指标口径和体验护栏。指标只用于改进产品，不作为操纵用户增加使用时长的手段。

默认只在本地计算和展示指标。任何外发遥测必须单独开启，并且只发送聚合事件、耗时、错误码和版本，不发送 content、excerpt、用户写下的理解与应用、URL 或标题。

## 1. 核心体验承诺

用户在使用 AnnHub 时应持续感受到：

1. 我知道这条内容来自哪里。
2. 我留下的是自己的理解，不只是系统摘要。
3. 系统在合适的时候让我重新调用它。
4. 我可以随时导出，不依赖远程账户才能访问数据。

## 2. 首次激活

### 2.1 激活定义

激活分两层，分别统计，不把 Desktop 可选性混进扩展采集漏斗：

```text
扩展激活：安装后 24 小时内创建 1 个有效 Fragment，并从碎片库再次打开它
学习激活：首次创建 Fragment 后 7 天内，Desktop 接收该记录并完成首次复习评分
```

两个指标分别以安装扩展的用户和创建过 Fragment 的用户为分母；无法识别的安装不纳入分母。无 Desktop 的用户仍可达到扩展激活。

### 2.2 首次体验

1. 安装扩展。
2. 引导用户选中当前页面的一段内容。
3. 解释 Highlight 与 Fragment 的差别。
4. 完成一个 `concept` 或 `excerpt` Fragment。
5. 启动 Desktop，由扩展调用本地服务写入 Fragment。
6. 完成一条示范复习。

不创建虚假示例数据混入用户库。演示数据只存在于独立演示模式。

## 3. 核心习惯

理想周节奏：

```text
工作日：遇到高价值内容时创建少量 Fragment
每日或隔日：完成不超过 10 分钟的到期复习
需要时：回到来源核对，修正理解
```

产品不规定每日采集配额，也不使用连续签到维持习惯。

## 4. North Star Metric

**Weekly Retrieved Fragments（每周成功提取碎片数）**

定义：按 Desktop 配置的本地时区计算 ISO 周；一周内至少有一次复习评分为 `good` 或 `easy` 的去重 Fragment 数量。同一 Fragment 在一周内多次成功只计一次。

排除：

- 只浏览、没有提交评分的碎片。
- 评分为 `again` 或 `hard`。
- 会话中途退出、评分未写入成功的条目。
- 已在 Desktop 本地删除的 Fragment。

这个指标对应“知识能被主动提取”，而不是“知识被收藏”。编号 M-18。

评分是用户自评，M-18 必须与 M-08（未使用提示的 good / easy 比例）和 [H-06](validation.md) 的应用质量抽样一起解读，避免把“点得快”当成“记得住”。

## 5. 指标目录

每个指标有稳定编号，其他文档用编号引用。“事件”列指向第 10 节的事件字典；“目标或护栏”列只写已确认的护栏，新的目标值在 [validation.md](validation.md) 的假设里登记并随阶段 V 校准。

| ID | 指标 | 口径 | 范围 | 来自事件 | 目标或护栏 |
| -- | ---- | ---- | ---- | -------- | ---------- |
| M-02 | Fragment completion rate | 打开采集窗口后成功保存的比例，可按退出阶段拆分 | 扩展 | `capture.modal_opened`、`capture.saved`、`capture.step_reached`、`capture.exited` | 退出率持续高于 40% 时先减字段（第 6.1 节） |
| M-03 | 采集用时 | 从打开到保存的中位时间，按标准、深度模式分别统计 | 扩展 | `capture.saved` | 标准 < 60 秒；深度 < 120 秒 |
| M-04 | Context correction rate | 用户修改自动上下文或来源的比例 | 扩展 | `capture.saved` | 无固定阈值；持续上升说明语境提取需要改进 |
| M-05 | Application quality proxy | 应用字段通过校验且非原文复制的比例，并以第 7 节的抽样校准 | 扩展 | `capture.saved`、抽样 | 抽样“具体场景”占比，见 [H-06](validation.md) |
| M-06 | Extension-to-Desktop latency | 本地服务可连接时，从扩展保存到 Desktop 可见的中位时间 | 两端 | `delivery.item_result`、`delivery.latency` | 先建立基线 |
| M-07 | Due completion rate | 当天到期中完成评分的比例 | Desktop | `review.session_started`、`review.card_rated`、`review.session_ended` | 见 [H-02](validation.md) |
| M-08 | Good/Easy without hint rate | 未使用提示且评为 good 或 easy 的比例 | Desktop | `review.card_rated` | 趋势指标，随复习次数观察 |
| M-11 | 扩展激活率 | 见第 2.1 节 | 扩展 | `capture.saved`、`fragment.reopened` | 先建立基线 |
| M-12 | 学习激活率 | 见第 2.1 节 | 两端 | `connection.paired`、`delivery.item_result`、`review.card_rated` | 见 [H-09](validation.md) |
| M-13 | Desktop 周活跃与四周留存 | 见第 9 节末段 | Desktop | `review.card_rated` | 先建立基线 |
| M-14 | Kind 修正率 | 保存前用户修改了自动推断 kind 的比例 | 扩展 | `capture.saved` | 高于 20% 时不得隐藏 kind 选择器（第 6.3 节） |
| M-16 | 安全出口使用率 | 放弃采集窗口的会话中，改存 Highlight 或 Clip 的比例 | 扩展 | `capture.exited` | 见 [H-05](validation.md) |
| M-17 | AI 建议采纳率 | 核验建议中，被用户接受或轻改后采用的比例，以及被标为“不准确”的比例；按云端与设备端分别统计 | 扩展 | `ai.suggestion_resolved` | 见 [H-11](validation.md) |
| M-18 | Weekly Retrieved Fragments | 见第 4 节 | Desktop | `review.card_rated` | 北极星；先建立基线 |

## 6. 体验护栏

### 6.1 采集摩擦

- Fragment Modal 退出率持续高于 40% 时，优先减少字段或改进分流，不放宽 Fragment 的核心质量门槛。
- 标准模式的中位完成时间目标小于 60 秒。
- 深度模式的中位完成时间目标小于 120 秒。

### 6.2 队列负担

- 默认每日队列上限 20 条，可在 5 到 50 之间配置。
- 预计时长超过 10 分钟时，默认只生成一个短会话。
- 逾期数量不使用红色大数字制造焦虑；只显示本次建议完成量。

### 6.3 自动化可信度

- kind 自动推断修正率高于 20% 时，不得隐藏 kind 选择器。
- 模型的核验建议必须允许标记“不准确”，并计入 M-17。

### 6.4 数据可靠性

- 本地保存成功但事件未入队的数量必须为 0。
- 重复逐项交付产生的重复实体数必须为 0；扩展更新覆盖 Desktop 复习评分的次数必须为 0。
- ZIP 中指向缺失图片的链接必须列入导出报告，不得静默忽略。

## 7. 质量抽样

仅靠行为指标无法判断知识质量。产品迭代需要定期人工抽样以下记录：

- Fragment 是否脱离原网页仍可理解。
- 用户应用是否表达真实使用场景。
- 复习问题是否要求提取而非照抄。

抽样数据必须由用户显式导出或在本地执行，不默认上传正文。

### 7.1 评分表

每周从本地库随机抽 20–30 条 Fragment，由两位评审在不知道作者的情况下独立评分，只记录评分，不记录正文。

| 维度 | 评分 | 判定要点 |
| ---- | ---- | -------- |
| 独立可理解 | 是 / 部分 / 否 | 只看这条 Fragment，能否说清它是什么、来自哪里、为何重要 |
| 应用具体 | 具体 / 泛泛 / 敷衍 | 具体 = 同时含一个对象（任务、文档、判断）和一个动作或问题；泛泛 = 只有其一；敷衍 = 都没有或只复制原文，示例见 [kinds.md §3](kinds.md) |
| kind 合适 | 合适 / 可更换 / 不合适 | 对照 [kinds.md §2](kinds.md) 的选择顺序 |
| 来源标签诚实 | 是 / 否 | 标为 `source-material` 的核验确实回看了原文；标为 `llm` 的确为未改动的模型建议 |

“应用具体”评为“具体”的比例就是 [H-06](validation.md) 的判据。两位评审不一致的条目讨论后定稿，并记录一致率；一致率低于 70% 时先修订判定要点，再继续抽样。

## 8. 不采用的指标

- 总收藏数。
- 每日打开次数。
- 总停留时长。
- 连续使用天数。
- LLM 调用次数。

这些指标可能增长，但不能证明用户获得了可调用知识。

## 9. 发布门禁

每个产品阶段发布前至少验证：

1. 主流程在关闭 LLM 和断网时仍可完成。
2. 用户输入在所有已知错误路径中不丢失。
3. 无 Desktop 时仍能导出包含 Markdown 和已保存图片的 ZIP；文件可独立阅读，ZIP 不被宣传为完整恢复备份。
4. 新增自动化结果有来源标签和拒绝入口。
5. 页面和术语符合 Extension/Desktop 的职责边界。

“周活跃用户”指该自然周至少完成一次复习评分的 Desktop 用户；四周留存以首次学习激活的用户为分母。

## 10. 事件字典

指标由下列事件计算。事件只在本地累计，外发遥测须单独开启（见本文开头）。

**通用规则**：

- 事件名为“域.动作”。属性只能是枚举、布尔值或分桶数字。
- **禁止**出现 `content`、`excerpt`、URL、页面标题、标签文本、用户写下的理解与应用，及任何可还原它们的片段。
- 耗时统一分桶：< 15 秒、15–30 秒、30–60 秒、60–120 秒、> 120 秒。数量分桶：0、1–2、3–5、6–10、> 10。
- 新增事件须同时登记它服务的指标；没有对应指标的事件不记录。

| 事件 | 触发时机 | 允许属性 | 服务指标 |
| ---- | -------- | -------- | -------- |
| `capture.modal_opened` | 采集窗口打开 | `entry`（selection / manual-inspiration / from-highlight / from-clip / screenshot）、`mode`（standard / deep） | M-02 |
| `capture.step_reached` | 进入理解、核验、应用任一步 | `step` | M-02 |
| `capture.saved` | Fragment 本地写入成功 | `kind`、`mode`、`verified_source`（source-material / manual / llm）、`duration`（分桶）、`context_edited`、`source_edited`、`kind_changed`、`highlight_also` | M-02、M-03、M-04、M-05、M-11、M-14 |
| `capture.exited` | 关闭窗口且未保存 | `last_step`、`had_input`、`fallback`（none / highlight / clip） | M-02、M-16 |
| `capture.save_failed` | 保存失败 | `error_code` | 数据可靠性 |
| `fragment.reopened` | 从碎片库再次打开一条 Fragment | `surface`（extension / desktop） | M-11 |
| `connection.paired` | 配对成功 | `first_time`、`duration`（从开始配对起，分桶） | M-12、[H-08](validation.md) |
| `delivery.item_result` | 一项交付得到终态结果 | `item`（fragment / asset）、`result`（created / unchanged / stale / conflict / gone / unauthorized / network / server）、`attempts`（分桶） | M-06、M-12 |
| `delivery.latency` | 交付成功 | `latency`（分桶） | M-06 |
| `export.completed` | 导出结束 | `result`（full / partial）、`missing_assets`（分桶） | 数据可靠性 |
| `review.session_started` | 复习会话开始 | `queue_size`（分桶）、`source`（today / resume） | M-07 |
| `review.card_rated` | 一次评分成功提交 | `kind`、`rating`、`used_hint`、`duration`（分桶） | M-07、M-08、M-12、M-13、M-18 |
| `review.session_ended` | 会话结束或退出 | `completed`（分桶）、`remaining`（分桶）、`reason`（finished / exited） | M-07 |
| `ai.suggestion_resolved` | 用户处理完一条核验建议 | `provider`（cloud / on-device）、`action`（accepted / edited / rejected / marked_inaccurate） | M-17 |

## 11. 本地指标面板

指标默认只在本地计算，并在设置页以聚合数字展示，不展示任何正文。阶段 V 期间，伙伴在回访时共享屏幕给产品负责人查看，不新增导出或上传入口（见 [validation.md §2](validation.md)）。
