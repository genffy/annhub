# Background Service 约定

> 适用于当前 `background-service/` 实现；不是未来 monorepo 的目标划分。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-08。

> D-18（2026-10-07）起，Fragment 与 LLM 不再属于产品范围，剪藏与截图并入统一的条目，D-19（2026-10-08）又让高亮成为剪藏里的标注（不再是条目类型），目标契约见 [条目数据契约](../docs/v2/entry.md) 与 [存储契约](../docs/v2/storage.md)。下文 `services/fragment/` 与 `services/llm/` 是迁移前的旧实现，按路线图 R1 移除；移除前只为修缺陷改动，不在它们上面加新功能。

## 服务边界

- `index.ts` 注册服务；`service-manager.ts` 管生命周期和消息处理；`event-handlers/` 接入命令、runtime 与安装事件。
- 新消息先在 `types/messages.ts` 登记，再同步 service handler、调用方和测试。读取用户数据、写类消息按 `sender.ts` 的 `isExtensionPageSender` 校验，不要再复制判断；敏感配置读取不得回传密钥。`__tests__/message-protocol.test.ts` 会检查 `UIToBackgroundMessage` 中每个类型都有 handler，后台发往内容脚本的消息放进 `BackgroundToUIMessage`。
- Service Worker 可重启。持久状态放存储层，不能只放服务实例内存；错误响应要让调用方区分失败与成功。

## 领域接线

- `services/fragment/` 负责消息到 domain 的适配；创建和校验调用 `learning-core/`，不复制领域规则。Fragment 的存储边界以共享 store 与 [存储契约](../docs/v2/storage.md) 为准。输出工坊与知识关系（D-10）、桌面客户端与跨端交付（D-17）已移出产品范围，代码中不再有对应服务、消息或存储。
- `services/screenshot/` 只承担浏览器截图 API、跨域资源、下载和截图集入库。处理后的图像从 content 以 `dataUrl` 传输（runtime 消息不能携带 Blob），service worker 转 Blob 后与截图元数据同事务写入共享 `fragment-store` 的 `assets`/`screenshots` stores（[存储契约](../docs/v2/storage.md) §3）。`CAPTURE_VISIBLE_TAB` 只拍发送者所在窗口，且发送者必须是该窗口的活动标签页（截取前后各查一次），`captureVisibleTab` 不要再用 `WINDOW_ID_CURRENT`；`FETCH_RESOURCE` 持有 `<all_urls>` 的网络位置，所以只经 `fetch-policy.ts`：公网 http(s)、不带凭据、只返回不超过 `MAX_IMAGE_BYTES` 的图片，重定向后的地址同样检查。截图集的读、删消息只答扩展页面。
- `services/llm/` 是按 D-18 移出产品范围的旧实现（保存用户自己的接口与密钥，测试连接），没有功能消费者，R1 删除；删除之前密钥仍不回传页面。
- ZIP 导出在扩展页面侧执行（`utils/export-content.ts`）：页面直连共享 IndexedDB 读图片字节，高亮/剪藏经 JSON 消息获取；不要把 Blob 放进 runtime 消息。

## 验证

- 消息协议或服务注册变化：`npm run compile`、对应 service 单测、相关调用链 E2E。
- Fragment 或截图持久化变化：跑对应 store / service 单测，并验证失败响应和重启后读取；截图需额外跑 `e2e/screenshot-capture.spec.ts`。
