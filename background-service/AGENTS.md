# Background Service 约定

> 适用于当前 `background-service/` 实现；不是未来 monorepo 的目标划分。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-04。

## 服务边界

- `index.ts` 注册服务；`service-manager.ts` 管生命周期和消息处理；`event-handlers/` 接入命令、runtime 与安装事件。
- 新消息先在 `types/messages.ts` 登记，再同步 service handler、调用方和测试。读取用户数据、写类消息按 `sender.ts` 的 `isExtensionPageSender` 校验，不要再复制判断；敏感配置读取不得回传密钥。`__tests__/message-protocol.test.ts` 会检查 `UIToBackgroundMessage` 中每个类型都有 handler，后台发往内容脚本的消息放进 `BackgroundToUIMessage`。
- Service Worker 可重启。持久状态放存储层，不能只放服务实例内存；错误响应要让调用方区分失败与成功。

## 领域接线

- `services/fragment/` 负责 wire 到 domain 的适配；创建和校验调用 `learning-core/`，不复制领域规则。Fragment、ReviewLog 和 Outbox 的事务边界以共享 store 与 [存储契约](../docs/v2/storage.md) 为准。输出工坊与知识关系已由 D-10 移出产品范围，代码中不再有对应服务、消息或存储。
- `services/fragment/direct-connect.ts` 是扩展→Desktop 逐项交付（`PUT /v1/fragments/{id}`、`PUT /v1/assets/{id}`）：只有 201/200（Desktop 已持久化）或本地记录已不存在才删除待发送任务。410/409/413/422 和其他 4xx 不会删除：任务标记 `rejection` 后停止自动重试，在设置页列出原因，用户选择重试或忽略（`RESOLVE_REJECTED_DELIVERIES`）。单项 5xx 只计失败并继续下一项，同一项反复失败（`MAX_SERVER_FAILURES`）后同样搁置，连续几项 5xx 才结束本轮；401/403 停止自动重试；网络错误保留队列由 alarm（`annhub-delivery-retry`）重试。哈希与请求体一致：`canonicalJson` 把 `undefined` 成员当作不存在。网络请求不得进入 IndexedDB 事务。配对码只在 service worker 内读取：`GET_DESKTOP_DIRECT_CONNECT` 只给扩展页面返回 `hasToken`，写入端点必须是 `http` 回环地址（`normalizeEndpoint`），已存的非回环端点读取时改回默认值，保证配对码不会发往本机以外。
- `services/screenshot/` 只承担浏览器截图 API、跨域资源、下载和截图集入库。处理后的图像从 content 以 `dataUrl` 传输（runtime 消息不能携带 Blob），service worker 转 Blob 后与截图元数据同事务写入共享 `fragment-store` 的 `assets`/`screenshots` stores（[存储契约](../docs/v2/storage.md) §3.3）。
- `services/llm/` 只做可选 Provider（[ai.md §8](../docs/v2/ai.md)）：保存用户自己的接口与密钥，测试连接；密钥不回传页面。失败必须能回到手工处理。
- ZIP 导出在扩展页面侧执行（`utils/export-content.ts`）：页面直连共享 IndexedDB 读图片字节，高亮/剪藏经 JSON 消息获取；不要把 Blob 放进 runtime 消息。

## 验证

- 消息协议或服务注册变化：`npm run compile`、对应 service 单测、相关调用链 E2E。
- Fragment 或截图持久化变化：跑对应 store / service 单测，并验证失败响应、重启后读取和跨端契约；截图需额外跑 `e2e/screenshot-capture.spec.ts`。
