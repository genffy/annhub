# 发送者三档与消息校验

> 适用范围：`background-service/` 的消息 sender 校验；上级约定见 [../AGENTS.md](../AGENTS.md)。

- 发送者分三档，每个 handler 自己校验（测试：`services/entries/sender.test.ts`，遍历所有 handler）：
  - 只有扩展页面：全部查询（`QUERY_ENTRIES`、`QUERY_HIGHLIGHTS`、`QUERY_FACETS`、`GET_ENTRY`、`GET_ASSET_DATA_URL`）、属性注册表（`LIST_PROPERTIES`、`UPSERT_PROPERTY`、`DELETE_PROPERTY`、`DELETE_UNUSED_PROPERTIES`）、四个高亮操作、`USAGE_ESTIMATE`、`ORPHAN_REPORT`、`GET_METRICS`、`GET_RECORDING_STATE`；
    下载的 `ESTIMATE_DOWNLOAD`（对话框准备态的预计文件数）与 `START_LIBRARY_DOWNLOAD` 也只在扩展页面（download.md §3）；
  - 录制的启停与善后 `START_RECORDING`、`STOP_RECORDING`、`RETRY_RECORDING_DOWNLOAD`、`DISCARD_RECORDING` 还要求发送者没有标签页上下文（录制只从扩展自己的页面发起，annotate.md §2.1），`RECORDING_EVENT` 只来自 offscreen 录制文档，`DOWNLOAD_RUN_EVENT` 只来自 offscreen 的下载运行（两者都要求发送者没有标签页上下文）；
  - 扩展页面与同源内容脚本：`SAVE_CLIP`、`GET_SETTINGS`、`RECORD_EVENT`（按字典校验）、`OPEN_EXTENSION_PAGE`、`RECORDING_STATUS`（annotate.md §3）；
    `SAVE_SCREENSHOT`、`DOWNLOAD_IMAGE`、`CAPTURE_VISIBLE_TAB`、`FETCH_IMAGE`、`START_PAGE_DOWNLOAD`（download.md §2）还要求发送者是顶层框架；
    `REMEMBER_FRAME`、`READ_FRAME` 只认标签页的顶层框架，记忆按发送者的标签页存；
  - 内容脚本只能动它自己刚保存的条目：`DELETE_ENTRY`、`UPDATE_ENTRY`（只开放标题、标签、备注）。依据是 `sender.ts` 的 `rememberCapture` / `isRecentCapture`，记在 `chrome.storage.session`（每个框架最近 20 条、10 分钟），所以 worker 被回收之后，撤销与快速编辑照样成立；不要把它改回只放内存。
    `SET_SETTINGS` 对内容脚本只开放 `appendDisabledSite`，关闭区块入口是单独的 `DISABLE_BLOCK_ENTRY`。
    `CANCEL_DOWNLOAD` 与 `SHOW_DOWNLOAD_FILE` 扩展页面与顶层框架都可用（取消、显示刚落地的文件，download.md §2.5）。

- 下载运行的心跳只来自 offscreen；`../services/download/recovery.ts` 的 session 记录只含任务 ID、通知目标与统计字段，worker 重启时清理旧运行并报告失败，不持久化正文、标题或媒体。
- `EXTRACT_DOWNLOAD_PAGE` 只收顶层标签页的正文快照，转交 `DOWNLOAD_EXTRACT` 给 offscreen；后者只接本扩展无标签页上下文的消息，提取结果不持久化、不联网。
- 资料库下载的 `clientRunId` 随通知和恢复记录传回，页面只处理自己发起的运行，避免其他标签页的结束通知覆盖正在启动的下载。
- Markdown 媒体链接使用 `core/download.ts` 的 `downloadAssetPath` 编码实际落盘文件名，浏览器添加重名序号或用户改名后，空格、括号与片段符号仍指向同一文件。
