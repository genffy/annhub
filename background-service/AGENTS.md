# Background Service 约定

> 适用于当前 `background-service/` 实现；不是未来 monorepo 的目标划分。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-08。

## 服务边界

- `index.ts` 注册三个服务：`services/entries`（条目/属性/导出的消息门面）、`services/screenshot`（截取、跨域代取、下载、入库）、`services/system`（偏好、本地指标）。`service-manager.ts` 管生命周期与消息分发；`event-handlers/command-handler.ts` 接两条命令（区域截图、区块模式），没有注入式兜底（`scripting` 已移除）。
- 共享 IndexedDB 连接走 `store-instance.ts` 的单例；服务不各自开库。
- 新消息先在 `types/messages.ts` 登记，再同步 handler、调用方和测试。读用户数据、写类消息按 `sender.ts` 校验（扩展页面或页面顶层 frame），不要再复制判断。

## 领域接线

- `services/entries` 只做消息到 `learning-core/store` 的适配：保存前 `cleanSourceUrl` 去令牌参数、按注册表附加类型预设，不复制领域规则。属性筛选、排序、分页全部经 `learning-core/query`。
- ZIP 导出在 service worker 里执行：逐 Blob 读资产、`buildExport` 生成、`chrome.downloads.download` 交付。MV3 worker 没有 `URL.createObjectURL`，交付用 dataUrl；构建仍是 Blob 分批。
- `services/screenshot`：`CAPTURE_VISIBLE_TAB` 只拍发送者所在窗口且前后各查一次活动状态，不要用 `WINDOW_ID_CURRENT`；`FETCH_IMAGE` 持有 `<all_urls>` 的网络位置，只经 `fetch-policy.ts`（公网 http(s)、不带凭据、只返回不超过 `MAX_IMAGE_BYTES` 的图片、重定向后再查一次）。R1 下载固定 PNG（格式设置属 R2）。
- `services/system`：偏好即 `settings-schema.ts` 的 layer C（chrome.storage，条目绝不放这里）；指标经 `services/metrics/record.ts` 的字典与分桶，属性只能是枚举/布尔/分桶数字。
- 指标事件在写入成功/失败的路径上就地记录（`capture.saved`、`capture.undone`、`capture.save_failed`、`screenshot.copied/downloaded`、`export.completed`）；读侧事件（`entry.reopened`、`library.queried`）由页面触发。

## 验证

- 消息协议或服务注册变化：`npm run compile`、对应 service 单测、相关 E2E。
- 持久化变化：`npx vitest run learning-core` 加对应 service 单测；截图链路跑 `e2e/screenshot-capture.spec.ts`。
