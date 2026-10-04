# 间隔复习规则（L3）

> 层级：core
> 更新：2026-10-04

## 1. 职责

复习引擎在合适时间重新激活碎片，并根据实际提取难度安排下一次复习。

核心不变量：**复习日志是事实，调度状态是派生结果。**

页面流程以 [Desktop PRD](desktop.md) §5 为准。

## 2. 状态机

```text
new -> review
  |       |
  +-------+-> relearning（again）
                 |
                 +-> review（hard / good / easy）
```

`learning` 保留为兼容状态，但四档 v1 不新建该状态；未来若引入短间隔学习步，必须提升 schedulerVersion 并提供跨端重放 fixture。

四档评分：

| rating  | 语义                         |
| ------- | ---------------------------- |
| `again` | 无法回忆或理解明显错误       |
| `hard`  | 能回忆，但需要较多提示或推理 |
| `good`  | 正常完成提取                 |
| `easy`  | 快速、完整且能说明边界       |

评分按钮在答案或参考信息揭示后显示，并展示预计下次间隔。

## 3. 四档 v1 调度

新 Fragment 初始为 `new`、repetitions/lapses/intervalDays 为 0、easeFactor 为 2.5、nextReviewAt 为创建时间。评分采用纯函数 `(state, rating, now) -> nextState`，`now` 与时间戳均为 UTC epoch 毫秒；一天固定为 24 小时，不按本地零点延长或缩短间隔。

| 评分 | intervalDays | repetitions / lapses | easeFactor |
| ---- | ------------ | -------------------- | ---------- |
| again | 1 | repetitions 归零，lapses +1 | `max(1.3, ease - 0.2)` |
| hard | `max(1, round(max(1, previousInterval) * 1.2))` | 不变 | `max(1.3, ease - 0.15)` |
| good | 首次 1、第二次 6，之后 `max(1, round(previousInterval * ease))` | repetitions +1 | 不变 |
| easy | 首次 4，之后 `max(2, round(previousInterval * ease * 1.3))` | repetitions +1 | ease +0.15 |

`round` 对非负数采用四舍五入，先计算间隔再更新 easeFactor；`nextReviewAt = now + intervalDays * 86_400_000`。`again` 进入 relearning，其他评分进入 review。使用提示只记录在 ReviewLog，不自动改写用户选择的评分。每条日志保存 schedulerVersion；评分状态与不可变日志必须同事务写入，成功提交后才移动会话游标。日志重放还需要最初的 ReviewState 和版本化公式，不能仅靠日志字段猜测初始状态。

**演进路线**（[D-04](validation.md) 已采纳）：四档 v1 保持不变。阶段 V 结束后，用真实复习日志离线重放，对比 v1 与以“期望记忆率”为核心旋钮的间隔重复算法（FSRS 类）的预测准确度；只有已有足够的本地日志做离线对比、且出现“间隔过短或过长”的明确反馈时才升级。升级须提升 `schedulerVersion`、保留 v1 日志及其重放 fixture，只向用户暴露“期望记忆率”一个旋钮，并保持每日建议量上限（第 5 节）。依据见 [market.md §4.3](market.md)。

## 4. 通用题型

每个 kind 的默认题面和四级提示梯度（由粗到细）集中在 [kinds.md](kinds.md)（§1 总览，§4 卡片）。每个 kind 在四档 v1 中只有一个默认题型；梯度的第四级统一为核验确认。

「核验确认」级展示核验确认状态；有摘要时展示摘要，没有摘要时回看原始语境（与 [kinds.md §3](kinds.md) 一致）。

使用过提示必须写入日志，否则评分数据会高估真实掌握程度。

## 5. 每日队列

- 以 `nextReviewAt <= now` 选择到期记录；本地日历只用于展示“今日”，不改变到期判定。
- 默认排序为 `nextReviewAt` 升序、`lapses` 降序、`createdAt` 升序、`id` 升序，保证两端和重启后稳定。
- 每日建议上限默认 20 条，用户可在 5 到 50 之间配置；它限制当天建议量，不强制同一会话做完。
- 单次会话按每条 45 秒估算，默认最多 `min(剩余每日建议量, floor(600 / 45)) = 13` 条；用户可主动继续下一会话，未完成到期项保留原 `nextReviewAt`。
- 开始时持久化会话 ID、选中 Fragment ID 顺序和游标；评分提交成功后才前进。中途退出从未评分项继续，已删除项跳过并记录原因。
- 无到期碎片时仍展示可执行的整理入口。

## 6. 非目标

- 不把重复浏览算作完成复习。
- 不用采集数量直接推断掌握程度。
- 不让 LLM 决定调度结果。
- 不为每个 kind 建一套独立调度器。

## 7. 待验证

以下问题同时登记在 [validation.md §7](validation.md)（Q-01）。调度算法的演进路线见第 3 节末尾。

- 同一 kind 是否需要多种题型及切换阈值；四档 v1 每个 kind 只提供一个默认题型。
