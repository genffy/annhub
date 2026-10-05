# 主动加工规则（L2）

> 层级：core
> 更新：2026-10-04

## 1. 职责

主动加工把原始摘录变成用户自己的知识记录。它发生在采集现场，因为此时用户仍知道这段内容为何重要。

```text
理解 -> 核验 -> 应用 -> 保存
```

现有字段继续使用 `guess / verified / use`，但 UI 统一使用“理解、核验、应用”的通用语义。

页面级流程和文案以 [扩展 PRD](extension.md) 为准。

## 2. 三步契约

| 步骤 | 作用                         | 产物                  | 可否跳过                 |
| ---- | ---------------------------- | --------------------- | ------------------------ |
| 理解 | 写下当前解释、判断或问题     | `processing.guess`    | 可按快速模式省略         |
| 核验 | 回看来源或个人推测并明确确认 | `processing.verified` | 不可跳过；说明与备注可选 |
| 应用 | 说明如何使用、验证或迁移     | `processing.use`      | 不可                     |

应用是硬门槛。没有应用的记录只能保存为高亮或剪藏。

核验步骤必须可由用户手工完成。用户点确认后记录来源与 `confirmedAt`；只核对原文而无修正时不要求写摘要。核验表示“已审视当前内容”，不表示系统判定它为真；争议论点可保持 `stance=uncertain`，问题可保持 `status=open`，灵感可标明个人推测。修改内容、语境、来源或 kind 后须重新确认。

AnnHub 不创建进入学习核心的“稍后加工” Fragment 草稿。Modal 中用户已输入的短生命周期表单状态可保存在 `chrome.storage.session`，仅用于错误、Worker 重启和同一浏览器会话内导航后的恢复；采集摩擦仍通过 Highlight/Clip 分流解决。

## 3. 按类型配置

```typescript
interface ProcessingPipelineConfig<K extends FragmentKind> {
  kind: K
  interpretationPrompt: string
  verificationSources: Array<'source-material' | 'llm' | 'manual'>
  applicationPrompt: string
  applicationValidator: (text: string) => ValidationResult
  buildDetail: (draft: CaptureDraft) => DetailOf<K>
}
```

各 kind 的理解、核验、应用提问集中在 [kinds.md](kinds.md)（§4 卡片的“采集提问”），本文不重复。

## 4. 校验

通用校验要求用户显式确认核验步骤，且 `use` 非空、不是原文复制。更强规则由 kind 决定。

禁止使用固定的单一语言 token 数量作为所有碎片的共同门槛。长度只能作为辅助信号，核心问题是应用内容是否表达了可执行的使用、验证或解释。

首版通用校验：

```text
trim 后非空
AND processing.verified.confirmedAt 有效、来源合法
AND 不等于 content
AND 不等于 excerpt
AND 至少表达 action / target / question / context 中的一项
```

无法可靠自动判断最后一项时，UI 给出具体提示，但 domain 层至少执行前三项。

## 5. 核验来源

核验优先级由类型配置决定：

1. 原始材料中的定义、证据或上下文。
2. 用户提供的可信参考资料。
3. 可选 LLM 建议。
4. 用户手工总结。

结果必须记录来源。模型结果不能伪装成原文结论，手工结果也不能标记为模型生成。

## 6. 状态与错误

```text
idle -> interpreting -> verifying -> applying -> saving -> success
                              |            |
                           degraded     save-error
```

- 核验失败时允许重试或手工填写。
- 保存失败时保留全部输入。
- 已输入内容后退出必须确认。
- 返回上一步不清空后续草稿。
- 模型不可用不得阻塞进入应用步骤。

## 7. 反模式

- 用模型代写用户的应用内容。
- 把“稍后整理”作为默认出口。
- 核验失败就关闭流程。
- 所有 kind 使用同一提示和同一校验器。
- 把应用字段写成标签、来源或原文摘要的重复。
