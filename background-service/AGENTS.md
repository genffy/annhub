# Background Service 约定

> 适用于当前 `background-service/` 实现；不是未来 monorepo 的目标划分。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-09。

## 服务边界

- `index.ts` 注册三个服务：`services/entries`（条目/属性/导出的消息门面）、`services/screenshot`（截取、跨域代取、下载、入库）、`services/system`（偏好、本地指标）。`service-manager.ts` 管生命周期与消息分发；`event-handlers/command-handler.ts` 接两条命令（区域截图、区块模式），没有注入式兜底（`scripting` 已移除）。
- 共享 IndexedDB 连接走 `store-instance.ts` 的单例；服务不各自开库。
- 新消息先在 `types/messages.ts` 登记，再同步 handler、调用方和测试。读用户数据、写类消息按 `sender.ts` 校验，不要再复制判断；内容脚本能发哪些消息的目标分级见下方 RV-BG-02。

## 领域接线

- `services/entries` 只做消息到 `learning-core/store` 的适配：保存前 `cleanSourceUrl` 去令牌参数、按注册表附加类型预设，不复制领域规则。属性筛选、排序、分页全部经 `learning-core/query`。
- ZIP 导出在 service worker 里执行：逐 Blob 读资产、`buildExport` 生成、`chrome.downloads.download` 交付。MV3 worker 没有 `URL.createObjectURL`，交付用 dataUrl；构建仍是 Blob 分批。
- `services/screenshot`：`CAPTURE_VISIBLE_TAB` 只拍发送者所在窗口且前后各查一次活动状态，不要用 `WINDOW_ID_CURRENT`；`FETCH_IMAGE` 持有 `<all_urls>` 的网络位置，只经 `fetch-policy.ts`（公网 http(s)、不带凭据、只返回不超过 `MAX_IMAGE_BYTES` 的图片、重定向后再查一次）。R1 下载固定 PNG（格式设置属 R2）。
- `services/system`：偏好即 `settings-schema.ts` 的 layer C（chrome.storage，条目绝不放这里）；指标经 `services/metrics/record.ts` 的字典与分桶，属性只能是枚举/布尔/分桶数字。
- 指标事件在写入成功/失败的路径上就地记录（`capture.saved`、`capture.undone`、`capture.save_failed`、`screenshot.copied/downloaded`、`export.completed`）；读侧事件（`entry.reopened`、`library.queried`）由页面触发。

## 验证

- 消息协议或服务注册变化：`npm run compile`、对应 service 单测、相关 E2E。
- 持久化变化：`npx vitest run learning-core` 加对应 service 单测；截图链路跑 `e2e/screenshot-capture.spec.ts`。

## 已知问题

> 2026-10-09 在真实 Chromium（Playwright 加载构建产物）里对照 `docs/v2` 复核的结果，基线提交 `cfe7c2c`。「实测」是已复现的，「读码」是读代码得出的，先写测试确认。
> 优先级：P0 主流程不可用或数据写错；P1 与契约不符但有绕行；P2 清理与质量。完成标准与处理顺序见 [roadmap.md 第 3、5 节](../docs/v2/roadmap.md)，需要拍板的点见 [validation.md 第 5 节](../docs/v2/validation.md)（每条有默认，不阻塞）。
> 每条先写能复现的失败测试，再修；不要放宽断言、跳过或隔离测试来求绿（根 `AGENTS.md`）。修完在本节删除该条，历史看 git。

- **RV-BG-01 · service worker 冷启动：空闲后的第一条消息没人响应**（P0）。契约：extension.md §8 第 2 条（本地写入 95 分位小于 300ms）；metrics.md §6；US-CAP-11。
  - 现象（实测）：真正的消息处理器在 `service-manager.ts` 的 `registerMessageHandlers()` 里注册，要等三个服务全部 `await initialize()`（含打开 IndexedDB）之后；`RuntimeHandler` 的 `PING` 监听是同步注册的，对其他消息返回 `false`。service worker 空闲停止后，唤醒它的那条消息没有监听者，`sendMessage` 得到 `undefined`，`utils/message/index.ts` 的 `MessageUtils.sendMessage` 视为失败并按 1s、2s 退避重试：空闲后第一次搜索约 1.06 秒，第一次保存剪藏约 1.6 秒（三次里两次，另一次 0.28 秒）。`e2e/helpers.ts` 的 `hoverForCapsule` 为此写了“再停留一次”的循环。
  - 要求：MV3 要求监听器在 service worker 脚本顶层同步注册。在 `defineBackground` 的同步段注册 `runtime.onMessage`（以及 `commands`、`installed` 等），处理器内先 `await` 初始化完成再分发，未知类型立即返回错误；删除 `PING` 与 `ServiceWorkerManager` 的重试链（RV-BG-09）；`MessageUtils.sendMessage` 的重试只对“没有接收者”这类错误生效，`SAVE_*` 带 `requestId` 做幂等（后台缓存最近请求的结果），避免响应丢失时重复保存。
  - 测试：在 `e2e/helpers.ts` 加 `stopServiceWorker(context, page)`：`context.newCDPSession(page)`，`ServiceWorker.enable` 后发 `ServiceWorker.stopAllWorkers`（已验证可用）。断言停掉 worker 后第一条 `GET_SETTINGS` 立即成功（远小于 1 秒），第一次剪藏的提示在 300ms 量级内出现；同时删掉 `hoverForCapsule` 的重试循环。

- **RV-BG-02 · 发送者与权限**（P1）。契约：根 `AGENTS.md` 第 2 条；`sender.ts` 的说明（读或改用户数据与配置必须来自扩展页面）。读码，除特别标注外。
  - `DELETE_ENTRY` 写成 `if (!trustedSender)`（对函数引用取反，恒为 false），handler 也没有接 `sender` 参数——校验形同虚设。改成 `trustedSender(sender)`，并加一个参数化测试：遍历所有 handler，用不可信 sender 调用，凡是读写用户数据或配置的消息都必须返回 forbidden。`OPEN_EXTENSION_PAGE` 同样没有发送者校验（低风险）。
  - 现状与说明不符：`trustedSender` 放行任何顶层标签页里的内容脚本，于是页面侧可以读全库、导出 ZIP、改或删属性、改设置。按最小权限分三档。仅扩展页面：`QUERY_*`、`GET_ENTRY`、`GET_ASSET_DATA_URL`、`LIST_PROPERTIES`、`UPSERT_PROPERTY`、`DELETE_PROPERTY`、`DELETE_UNUSED_PROPERTIES`、`EXPORT_ZIP`（若仍在后台）、`ORPHAN_REPORT`、`USAGE_ESTIMATE`、全部高亮操作、`GET_METRICS`。扩展页面与内容脚本：`SAVE_CLIP`、`SAVE_SCREENSHOT`、`DELETE_ENTRY`（内容脚本只能删它自己刚保存的）、`UPDATE_ENTRY`（内容脚本只开放标题、标签、备注）、`GET_SETTINGS`、`RECORD_EVENT`（按字典校验）、`DOWNLOAD_IMAGE`、`CAPTURE_VISIBLE_TAB`、`FETCH_IMAGE`。`SET_SETTINGS` 对内容脚本只开放“追加停用站点”的原子操作。
  - 参数没有校验：`DOWNLOAD_IMAGE` 接受任意 `extension` 与任意 `dataUrl`——白名单 `png`/`jpg`/`webp` 与 `data:image/(png|jpeg|webp);base64,`，并校验解码后的魔数。`SAVE_SCREENSHOT` 的 `dataUrlToBlob` 取任意 mime、元数据写死 `image/png`，空字节也能入库——校验 PNG 签名，宽高以解码结果为准，空字节拒绝（`ENTRY_ASSET_MISSING`）。`SET_SETTINGS`、`UPSERT_PROPERTY`、`UPDATE_ENTRY.patch` 没有运行时校验（见 RV-BG-07、RV-CORE-02）。
  - `FETCH_IMAGE` 的重定向在请求发出之后才检查（`response.redirected`）：公网地址 302 到内网时，GET 已经发出，只是响应被拒绝。`redirect: 'manual'` 在扩展里同样拿不到 `Location`，没有廉价的修法。作为已接受的残余风险（响应已被拒绝，不能读出内容），不必动。
  - 测试：上面的参数化发送者测试；`DOWNLOAD_IMAGE`、`SAVE_SCREENSHOT` 的非法输入各一条。

- **RV-BG-03 · 协议语义：清除、字段级补丁、高亮操作**（P0，其他条目的前置）。契约：根 `AGENTS.md` 第 2 条；storage.md §5（创建、修改、删除、合并一条高亮 = 一个事务内更新所属剪藏）。
  - 现象（实测）：`UPDATE_ENTRY` 的 `patch` 里 `undefined` 经 JSON 序列化消失，无法表达“清除备注或语境”；`properties` 是整体替换，调用方必须带完整对象（快速编辑因此抹掉其他属性）；高亮的改色、写备注、删除、撤销删除都是用整个数组替换（陈旧副本会覆盖他处的改动）；`ADD_HIGHLIGHT` 在 handler 里“读条目 → 合并 → 另起事务写回”，两个并发的 `ADD_HIGHLIGHT` 连发 25 次，25 次都丢了一条。
  - 要求：协议改成字段级——`note: string | null`（`null` 表示清除），`context` 同理；`properties` 用 `{ set: {...}, unset: [...] }`；高亮用操作：`addHighlight`（已有）、`updateHighlight(id, { color?, note? })`、`removeHighlight(id)`、`restoreHighlight(highlight)`（供撤销）。每个操作由 store 在**同一个事务内**读-改-写并返回最新条目；合并重叠高亮的逻辑只在 store 里一份（RV-CORE-08）。同步 `types/messages.ts`、handler、所有调用方（资料库、快速编辑气泡）和测试。
  - 测试：消息层单测覆盖清除、字段级补丁、每种高亮操作；并发测试——两个 `ADD_HIGHLIGHT` 同时发 25 次，每次都得到两条。

- **RV-BG-04 · 查询路径：整库读取与聚合**（P0）。契约：search.md §6；roadmap R1（1 万条首屏查询 200ms 内）；US-LIB-01。
  - 现象（实测）：`QUERY_ENTRIES`、`QUERY_HIGHLIGHTS` 每次 `store.listEntries()` 整库读出再全表扫描。浏览器内 3,000 条（13 MB）：不搜索的列表 150–180ms，搜索约 390ms；Node 里 1 万条（55 MB 正文）单次搜索 1.2 秒，158 MB 正文 3.4 秒。现有性能测试每条正文约 100 字符，与真实体量相差两个数量级。
  - 要求：无搜索词时用 `by-created`（以及 `by-type`、`by-host`、`by-tag`）索引加游标只读一页，总数用 `index.count()` 或增量计数；有搜索词时缓存每条的归一化检索文本（按 `id + updatedAt` 失效，放内存或 IndexedDB 的派生字段），查询只做子串匹配，结果仍经 `learning-core/query` 的规则复核（search.md §6）；列表响应里的条目只带摘要字段（正文截断），阅读与抽屉再 `GET_ENTRY`；响应附聚合（facets）：各类型条目数、来源与标签候选、属性使用数、高亮总数，供 RV-LIB-02、RV-LIB-07、RV-LIB-13 使用，替代页面上的多次整库查询。
  - 验收：性能测试改用真实体量夹具（1 万条：70% 约 0.5 KB、20% 约 6 KB、10% 约 40–60 KB），在浏览器内端到端（含 IndexedDB 读取与消息传递）首屏 200ms 内。

- **RV-BG-05 · 导出的构造与交付**（P1）。契约：storage.md §6（逐 Blob 读取，避免一次性 Base64 和把所有文件同时载入内存）；extension.md §6（失败时显示原因和未导出项）。
  - 现象（实测）：`EXPORT_ZIP` 把所有图片字节收进 `zipEntries`，`buildZip` 再整体构造 Blob，最后 `FileReader.readAsDataURL` 变成一个巨大的 base64 data URL 交给 `chrome.downloads`。耗时线性增长：30 MB 2.8 秒，150 MB 16.6 秒，375 MB 92.9 秒，都成功；按此外推 1.2 GB 级会超过 MV3 单任务 5 分钟（外推，未实测）。
  - 读码：`learning-core/zip.ts` 的尺寸与偏移是 32 位、文件数是 16 位，超过 4 GiB 或 65,535 个文件会静默写坏。至少要检测并明确报错（或实现 ZIP64）。
  - 要求：在扩展页面（资料库）里执行导出——同源可直接打开 IndexedDB，页面有 `URL.createObjectURL`，用 Blob URL 交给 `chrome.downloads.download`。`buildExport` 逐个资产以 Blob 作为 ZIP 的 part，CRC 流式计算，不把所有字节同时放进内存；失败时返回原因与未导出项；README 增加“包含与不包含的数据类别”，并随界面语言（RV-CORE-06）。导出移到页面后，`EXPORT_ZIP` 消息、类型、handler、测试和 `background-service/README.md` 里的描述一起删或改（根 `AGENTS.md` 第 2 条）。
  - 测试：大图集夹具（例如 40 张 5 MB）下导出成功，峰值内存不随图片总量线性增长；超过 ZIP 限制时报错而不是写坏。

- **RV-BG-06 · 指标记录**（P1）。契约：metrics.md §9；D-22。
  - 各事件的上报缺口分散在调用方：`capture.undone` 从不记录、`capture.saved.duration` 口径（RV-CAP-10）；`screenshot.copied/downloaded` 的水印与美化恒为 `false`、`frame: 'reused'` 从不上报（RV-CAP-09）；`highlight.created` 的 `has_note` 恒为 `false`（RV-LIB-09）；`library.queried`（RV-LIB-13）；`entry.property_edited` 的 `scope`、`property_type` 只有新建定义时才对，编辑已有的自定义属性被记成 `builtin`，类型一律记成 `text`（`property-panel.tsx`）。
  - 并发（实测）：`LocalMetrics.record` 是无锁的读-改-写，10 条并发的 `RECORD_EVENT` 只计上 2 条；`services/metrics/record.ts` 里 `chrome.storage.local.set` 被 `void` 掉，错误被吞。串行化写入（队列或互斥）并等待 `set`。
  - 校验（实测）：`RECORD_EVENT` 接受任意事件名与任意字符串属性，含 URL 的属性被原样存下，违反 metrics.md §9 的禁止项。事件名、属性名与取值按字典校验（枚举、布尔、分桶），违例丢弃；字典与校验放在 `learning-core/metrics.ts`，不只靠 TypeScript 类型。
  - 测试：并发 10 条就计 10 条；非法事件名与含 URL 的属性被丢弃；每个事件的属性与字典逐一对应。

- **RV-BG-07 · 设置的读写**（P1）。契约：extension.md §2.5；storage.md §2。读码。
  - `writeSettings` 是浅合并、没有任何校验、且是读-改-写（两个标签页同时改 `blockDisabledSites` 会互相覆盖）；`readSettings` 不校验存储里的值。按 schema 校验类型与范围（质量 0.5–1、透明度 0.2–1、水印文字 ≤ 40 字符、水印图为 PNG 且 ≤ 512 KB、比例预设取值、站点列表项为主机名），逐键合并，未知键丢弃；“追加或移除停用站点”做成原子操作，不再让内容脚本读整个数组再写回（RV-CAP-08）。
  - 测试：非法 patch 被拒绝且不污染已有值；并发追加两个站点，两个都在。

- **RV-BG-08 · 保存错误的形态**（P1）。契约：entry.md §6（稳定错误码，界面不展示原始异常对象）；storage.md §3（配额不足须报告失败并保留内容）。读码。
  - `entries` 服务的 `failure()` 返回错误码，`screenshot` 服务的 `failure()` 返回原始 `message`（如 `image exceeds the per-image ceiling`、`storage quota would be exceeded`）。统一返回 `{ code }`，页面按码映射成本地化文案。
  - `QuotaError` 与 IndexedDB 的 `QuotaExceededError` 映射为一个稳定错误码（例如 `STORAGE_QUOTA_EXCEEDED`），并在 entry.md §6 的错误码表里登记（契约变化，同步文档）；单图超限用单独的码，不借用 `ENTRY_ASSET_MISSING`。
  - 测试：配额不足、单图超限、校验失败三种情形的响应都带码，页面显示本地化文案。

- **RV-BG-09 · 无人使用的代码**（P2）。随 RV-BG-01 一起删除：`utils/message/service-worker-manager.ts` 的重试与健康检查（`sendMessageWithRetry`、`waitForServiceWorker`、`startHealthCheck`），`MessageUtils` 的 `sendMessageWithServiceWorkerSupport` 与 `checkServiceWorkerStatus`，`RuntimeHandler` 的 `PING` 监听，`BackgroundServiceManager` 里没有调用方的方法；删后同步 `background-service/README.md`。
