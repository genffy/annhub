# Background Service 约定

> 适用于当前 `background-service/` 实现；不是未来 monorepo 的目标划分。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-10。

## 服务边界

- `index.ts` 注册三个服务：`services/entries`（条目/属性的消息门面）、`services/screenshot`（截取、跨域代取、下载、入库）、`services/system`（偏好、本地指标）。`service-manager.ts` 管生命周期与消息分发；`event-handlers/command-handler.ts` 接两条命令（区域截图、区块模式），只发给标签页的顶层框架（`frameId: 0`），没有注入式兜底（`scripting` 已移除）。
- 共享 IndexedDB 连接走 `store-instance.ts` 的单例；服务不各自开库。
- 新消息先在 `types/messages.ts` 登记，再同步 handler、调用方和测试。读用户数据、写类消息按 `sender.ts` 校验，不要再复制判断。
- 发送者分三档，每个 handler 自己校验，`services/entries/sender.test.ts` 遍历所有 handler 守着：
  - 只有扩展页面：全部查询（`QUERY_ENTRIES`、`QUERY_HIGHLIGHTS`、`QUERY_FACETS`、`GET_ENTRY`、`GET_ASSET_DATA_URL`）、属性注册表（`LIST_PROPERTIES`、`UPSERT_PROPERTY`、`DELETE_PROPERTY`、`DELETE_UNUSED_PROPERTIES`）、四个高亮操作、`USAGE_ESTIMATE`、`ORPHAN_REPORT`、`GET_METRICS`；
  - 扩展页面与同源内容脚本：`SAVE_CLIP`、`GET_SETTINGS`、`RECORD_EVENT`（按字典校验）、`OPEN_EXTENSION_PAGE`；`SAVE_SCREENSHOT`、`DOWNLOAD_IMAGE`、`CAPTURE_VISIBLE_TAB`、`FETCH_IMAGE` 还要求发送者是顶层框架；
  - 内容脚本只能动它自己刚保存的条目：`DELETE_ENTRY`、`UPDATE_ENTRY`（只开放标题、标签、备注）。依据是 `sender.ts` 的 `rememberCapture` / `isRecentCapture`，记在 `chrome.storage.session`（每个框架最近 20 条、10 分钟），所以 worker 被回收之后，撤销与快速编辑照样成立；不要把它改回只放内存。`SET_SETTINGS` 对内容脚本只开放 `appendDisabledSite`，关闭区块入口是单独的 `DISABLE_BLOCK_ENTRY`。
- `entrypoints/background/index.ts` 在脚本顶层同步注册 `runtime.onMessage`（MV3 要求：空闲后被消息唤醒时，监听器必须已经存在），处理器先 `await whenReady()`（三个服务初始化完成）再 `dispatchMessage`，未知类型立即返回错误。不要把注册挪到任何异步初始化之后；`e2e/cold-start.spec.ts` 守着这条（用 `helpers.ts` 的 `stopServiceWorker` 真的停掉 worker）。
- `SAVE_CLIP`、`SAVE_SCREENSHOT` 带 `requestId` 和调用方生成的条目 ID：`service-manager.ts` 缓存执行中的 Promise（键含发送者），并发的同一请求共用一次执行；worker 重启之后的重试靠 `saveEntry` 对同一 ID 返回已存的记录（内容不同则 `ENTRY_CONTENT_INVALID`）。`MessageUtils.sendMessage` 只对“没有接收者 / 端口已关闭”这类连接错误重试（50ms、200ms），处理器已经跑过并失败的不重试。
- 协议是字段级的：`UPDATE_ENTRY` 的 `note`、`context` 用 `null` 清除（JSON 会丢掉 `undefined`），`properties` 是 `{ set, unset, newDefinitions }`；高亮是 `ADD_HIGHLIGHT`、`UPDATE_HIGHLIGHT`、`REMOVE_HIGHLIGHT`、`RESTORE_HIGHLIGHT` 四个操作，每个在 store 的一个事务里读-改-写并返回最新条目，重叠高亮的合并只在 `learning-core/store.ts` 里一份。
- 失败一律回稳定错误码，不回原始 message：条目写入沿用 `entry.md §6` 的码，配额不足是 `STORAGE_QUOTA_EXCEEDED`、其余存储错误是 `OPERATION_FAILED`（`services/errors.ts` 的 `storageErrorCode`）；截图链路是 `CaptureError`（`CAPTURE_NOT_VISIBLE`、`CAPTURE_FAILED`、`DOWNLOAD_FAILED`），代取失败是 `IMAGE_FETCH_FAILED`。细节只进日志，页面按码本地化（`utils/ui-text.ts` 的 `failureReason`）。

## 领域接线

- `services/entries` 只做消息到 `learning-core/store` 的适配：保存前 `cleanSourceUrl` 去令牌参数、按注册表附加类型预设，不复制领域规则。属性筛选、排序、分页全部经 `learning-core/query`。
- 查询路径：`QUERY_ENTRIES` 无筛选、无搜索词的首页走 `by-created` 索引游标，只取一页；其余经 `store.indexedQuery`，读内存里的摘要，带搜索词才读检索文本。`QUERY_FACETS` 读摘要，一次返回计数、来源与标签候选、高亮总数，不让页面为此取回整库。`LIST_PROPERTIES` 默认只读注册表，`includeUsage` 才统计使用数。列表响应里的条目正文截到 500 字符，阅读与抽屉用 `GET_ENTRY` 取全文。摘要与检索文本的维护规则见 `learning-core/AGENTS.md`。
- ZIP 导出不在后台：资料库页面用同源 IndexedDB 与 `buildExport` 逐个 Blob 构造 ZIP，把 Blob URL 交给 `chrome.downloads.download`。后台没有导出消息（根 `AGENTS.md` 第 2 条）。
- `services/screenshot`：`CAPTURE_VISIBLE_TAB` 只拍发送者所在窗口且前后各查一次活动状态，不要用 `WINDOW_ID_CURRENT`；`FETCH_IMAGE` 持有 `<all_urls>` 的网络位置，只经 `fetch-policy.ts`（公网 http(s)、不带凭据、只返回不超过 `MAX_IMAGE_BYTES` 的图片、重定向后再查一次）。`DOWNLOAD_IMAGE` 只收 `png`/`jpg`/`webp` 和与扩展名相符的字节；`SAVE_SCREENSHOT` 校验 PNG 签名，宽高以解码结果为准，空字节拒绝。
- `services/system`：偏好即 `settings-schema.ts` 的 layer C（chrome.storage，条目绝不放这里）：逐键按 schema 校验、未知键丢弃、写入串行；“追加停用站点”是原子操作。指标经 `services/metrics/record.ts` 的字典与分桶，属性只能是枚举/布尔/分桶数字，违例丢弃。
- 指标事件在写入成功/失败的路径上就地记录（`capture.saved`、`capture.undone`、`capture.save_failed`、`screenshot.copied/downloaded`、`export.completed`）；读侧事件（`entry.reopened`、`library.queried`）由页面触发。`capture.saved.duration` 是“用户点击到写入成功”：内容脚本在点击时记下 `startedAt` 随消息发出，后台写入成功后计算，按 D-22 的默认（A）用细档（`bucketCaptureDuration`）；`metrics.md` 在 D-22 确认之前仍写通用分桶。

## 验证

- 消息协议或服务注册变化：`npm run compile`、对应 service 单测、相关 E2E。
- 持久化变化：`npx vitest run learning-core` 加对应 service 单测；截图链路跑 `e2e/screenshot-capture.spec.ts`。
- 查询路径：`e2e/library-browse.spec.ts` 里 1 万条真实体量的用例守着热查询 200 ms，以及 worker 重启后每个视图在 2.5 秒内就绪（修复前是 3.4 秒）。
