# 响应类型与发送者校验的登记规则

> 适用范围：`types/messages.ts` 的消息协议；上级约定见 [../AGENTS.md](../AGENTS.md)。

- 每条消息的响应 `data` 形状登记在 `types/messages.ts` 的 `ResponseDataMap`（RV-BG-12）：从 handler 实际返回读出来写，不照调用方的希望写。`MessageHandlers` 的返回类型与 `MessageUtils.sendMessage` 的结果都由它推导，调用方不写类型实参；改 handler 的返回字段，调用方在编译期报错。
- 新消息不进 `ResponseDataMap` 时，`ResponseDataForEveryMessage`（对全联合的 `Pick`）编译失败，这是穷尽性检查；`utils/__tests__/message.test.ts` 里带 RV-BG-12 的用例引用它。
- 发给标签页内容脚本的消息（四个 `TRIGGER_*`、`RECORDING_LIFECYCLE`、`DOWNLOAD_NOTICE`）单列在 `TabMessage` 联合里：`command-handler.ts` 的 `sendToActiveTab`、popup 的 `chrome.tabs.sendMessage`、内容脚本的 `onMessage` 都用它；它们没有响应 `data`。
- 读用户数据、写类消息按 `../sender.ts` 校验（三档清单见 [sender-rules.md](sender-rules.md)），不复制判断；拒绝与失败的响应 `data` 为空。
