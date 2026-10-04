# Background Service 约定

> 适用于当前 `background-service/` 实现；不是未来 monorepo 的目标划分。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-04。

## 服务边界

- `index.ts` 注册服务；`service-manager.ts` 管生命周期和消息处理；`event-handlers/` 接入命令、runtime 与安装事件。
- 新消息先在 `types/messages.ts` 登记，再同步 service handler、调用方和测试。读取用户数据、写类消息按 `sender.ts` 的 `isExtensionPageSender` 校验，不要再复制判断；敏感配置读取不得回传密钥。`__tests__/message-protocol.test.ts` 会检查 `UIToBackgroundMessage` 中每个类型都有 handler，后台发往内容脚本的消息放进 `BackgroundToUIMessage`。
- Service Worker 可重启。持久状态放存储层，不能只放服务实例内存；错误响应要让调用方区分失败与成功。

## 领域接线

- `services/fragment/` 负责 wire 到 domain 的适配；创建和校验调用 `learning-core/`，不复制领域规则。Fragment、ReviewLog 和 Outbox 的事务边界以共享 store 与 [存储契约](../docs/v2/storage.md) 为准。输出工坊与知识关系已由 D-10 移出产品范围，代码中不再有对应服务、消息或存储。
- `services/fragment/direct-connect.ts` 是扩展→Desktop 逐项交付（`PUT /v1/fragments/{id}`、`PUT /v1/assets/{id}`）：201/200 裁剪事件、401/403 停止自动重试、410/409/413/422 确定性失败裁剪并报告、网络错误保留队列由 alarm（`annhub-delivery-retry`）重试。网络请求不得进入 IndexedDB 事务。
- `services/screenshot/` 只承担浏览器截图 API、跨域资源、下载和截图集入库。处理后的图像从 content 以 `dataUrl` 传输（runtime 消息不能携带 Blob），service worker 转 Blob 后与截图元数据同事务写入共享 `fragment-store` 的 `assets`/`screenshots` stores（[存储契约](../docs/v2/storage.md) §3.3）。
- `services/llm/` 是可选路径，失败必须能回到手工处理。历史专项服务（词表标注、欧路）保持隔离，不增加新产品接线；Logseq 服务已删除。
- ZIP 导出在扩展页面侧执行（`utils/export-content.ts`）：页面直连共享 IndexedDB 读图片字节，高亮/剪藏经 JSON 消息获取；不要把 Blob 放进 runtime 消息。

## 验证

- 消息协议或服务注册变化：`npm run compile`、对应 service 单测、相关调用链 E2E。
- Fragment 或截图持久化变化：跑对应 store / service 单测，并验证失败响应、重启后读取和跨端契约；截图需额外跑 `e2e/screenshot-capture.spec.ts`。
