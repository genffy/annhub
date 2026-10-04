import { defineMessages } from './define'

/** Settings page (extension.md §2.2): Desktop connection, sync, capture, LLM and data blocks. */
export const settings = defineMessages({
  'settings.description': { zh: 'Desktop 连接、采集偏好、LLM 与数据管理', en: 'Desktop connection, capture preferences, LLM and data' },
  'settings.secretKept': { zh: '已保存（不会显示），留空则保持不变', en: 'Saved (not shown); leave empty to keep it' },

  // Desktop connection
  'settings.desktop.title': { zh: 'Desktop 连接', en: 'Desktop connection' },
  'settings.desktop.description': {
    zh: '通过本机接口把碎片与图片逐条写入 macOS Desktop（127.0.0.1:8765）',
    en: 'Deliver Fragments and images one by one to macOS Desktop through the local interface (127.0.0.1:8765)',
  },
  'settings.desktop.endpoint': { zh: '接口地址', en: 'Endpoint' },
  'settings.desktop.token': { zh: '配对码（在 Desktop 的「系统」页复制）', en: 'Pairing code (copy it from Desktop’s “System” page)' },
  'settings.desktop.tokenPlaceholder': { zh: '粘贴 Desktop 显示的配对码', en: 'Paste the pairing code Desktop shows' },
  'settings.desktop.autoSync': { zh: '保存后自动逐条交付（失败时保留待发送队列）', en: 'Deliver automatically after saving (failures stay in the pending queue)' },
  'settings.desktop.status': { zh: '状态：', en: 'Status: ' },
  'settings.desktop.pending': { zh: '待发送：{fragments} 条碎片 · {assets} 张图片', en: 'Pending: {fragments} Fragments · {assets} images' },
  'settings.desktop.lastDelivery': { zh: '上次交付：{fragments} 条 / {assets} 图', en: 'Last delivery: {fragments} Fragments / {assets} images' },
  'settings.desktop.lastError': { zh: '最近错误：{error}', en: 'Latest error: {error}' },
  'settings.desktop.save': { zh: '保存配置', en: 'Save settings' },
  'settings.desktop.flush': { zh: '立即交付待发送项', en: 'Deliver pending items now' },
  'settings.desktop.unpair': { zh: '取消配对', en: 'Unpair' },
  'settings.desktop.saved': { zh: '已保存 Desktop 连接配置', en: 'Desktop connection saved' },
  'settings.desktop.unpaired': { zh: '已取消配对，保存的配对码已清除', en: 'Unpaired — the saved pairing code was removed' },
  'settings.desktop.unpairFailed': { zh: '取消配对失败', en: 'Unpairing failed' },
  'settings.desktop.deliveryErrors': { zh: '交付存在错误：{error}', en: 'Delivery had errors: {error}' },
  'settings.desktop.delivered': { zh: '已交付 {fragments} 条碎片、{assets} 张图片', en: 'Delivered {fragments} Fragments and {assets} images' },
  'settings.desktop.deliveryFailed': { zh: '交付失败', en: 'Delivery failed' },

  // Items Desktop refused for good (storage.md §8)
  'settings.rejected.title': { zh: '{count} 项未能交付到 Desktop，已暂停自动重试', en: '{count} item(s) could not be delivered to Desktop; automatic retries are paused' },
  'settings.rejected.asset': { zh: '图片', en: 'Image' },
  'settings.rejected.fragment': { zh: '碎片', en: 'Fragment' },
  'settings.rejected.http': { zh: '（HTTP {status}）', en: ' (HTTP {status})' },
  'settings.rejected.retry': { zh: '重新尝试', en: 'Try again' },
  'settings.rejected.dismiss': { zh: '忽略这些项', en: 'Dismiss these items' },
  'settings.rejected.confirmDismiss': {
    zh: '忽略这些项后，它们不会再交付到 Desktop（本地记录不受影响）。继续？',
    en: 'Once dismissed, these items will no longer be delivered to Desktop (local records are not affected). Continue?',
  },
  'settings.rejected.retried': { zh: '已重新尝试 {count} 项', en: 'Retried {count} item(s)' },
  'settings.rejected.dismissed': { zh: '已忽略 {count} 项', en: 'Dismissed {count} item(s)' },
  'settings.rejected.failed': { zh: '操作失败', en: 'Operation failed' },
  'settings.reason.DESKTOP_DELETED': { zh: '已在 Desktop 删除，不会再带回', en: 'Deleted on Desktop; it will not be brought back' },
  'settings.reason.CONFLICT': { zh: '与 Desktop 已有的记录冲突', en: 'Conflicts with an existing Desktop record' },
  'settings.reason.TOO_LARGE': { zh: '图片超过上限，本地原图已保留', en: 'The image exceeds the size limit; the local original is kept' },
  'settings.reason.INVALID': { zh: '未通过 Desktop 校验', en: 'Did not pass Desktop validation' },
  'settings.reason.REJECTED': { zh: '被 Desktop 拒绝', en: 'Rejected by Desktop' },
  'settings.reason.DESKTOP_ERROR': { zh: 'Desktop 反复报错，已暂停重试', en: 'Desktop keeps failing; retries are paused' },
  'settings.reason.LOCAL_INVALID': { zh: '本地记录无法生成交付请求', en: 'The local record cannot produce a delivery request' },

  // Two-way sync (storage.md §9)
  'settings.sync.title': { zh: '双向同步', en: 'Two-way sync' },
  'settings.sync.description': {
    zh: '扩展会拉取 Desktop 回传的复习结果；无法应用的项目会出现在下面的报告中。',
    en: 'The extension pulls the review results Desktop sends back; anything that cannot be applied appears in the report below.',
  },
  'settings.sync.lastPull': { zh: '上次拉取：{time}', en: 'Last pull: {time}' },
  'settings.sync.never': { zh: '尚未同步', en: 'not synced yet' },
  'settings.sync.lastBatch': { zh: '最近一批：应用 {applied} 条变更，{reports} 条报告', en: 'Latest batch: applied {applied} change(s), {reports} report(s)' },
  'settings.sync.error': { zh: '错误：{error}', en: 'Error: {error}' },
  'settings.sync.start': { zh: '连接 Desktop 并点击上方的「立即交付待发送项」即可开始同步。', en: 'Connect Desktop and click “Deliver pending items now” above to start syncing.' },
  'settings.syncReason.LOCAL_DELETED': { zh: '已在扩展中删除，不会被带回', en: 'Deleted in the extension; it is not brought back' },
  'settings.syncReason.DESKTOP_DELETED': { zh: '已在 Desktop 删除（扩展保留自己的副本）', en: 'Deleted on Desktop (the extension keeps its own copy)' },
  'settings.syncReason.UNKNOWN_FRAGMENT': { zh: '扩展中没有这条碎片', en: 'The extension has no such Fragment' },
  'settings.syncReason.STALE_REVIEW': { zh: '评分时间早于本地最新评分，已保留较新状态', en: 'The rating predates the latest local rating; the newer state was kept' },
  'settings.sync.reports': { zh: '同步报告（最近 {count} 条）', en: 'Sync report (latest {count})' },

  // Capture preferences
  'settings.capture.title': { zh: '采集偏好', en: 'Capture preferences' },
  'settings.capture.description': {
    zh: '深度模式在采集 Modal 增加「理解」步骤（理解 → 核验 → 应用）',
    en: 'Deep mode adds an “Understand” step to the capture window (Understand → Verify → Apply)',
  },
  'settings.capture.deepMode': { zh: '深度模式（全局默认；单次采集内也可切换）', en: 'Deep mode (global default; you can also switch it within one capture)' },
  'settings.capture.deepOn': { zh: '已开启深度模式：采集时先写理解', en: 'Deep mode on: write your understanding first' },
  'settings.capture.deepOff': { zh: '已切换到标准模式：核验 → 应用', en: 'Standard mode on: Verify → Apply' },

  // LLM (optional, D-10 boundary: Provider only)
  'settings.llm.title': { zh: 'LLM 配置（可选）', en: 'LLM settings (optional)' },
  'settings.llm.description': {
    zh: '核验建议等能力的可选加速器；关闭后采集、复习与导出全部可用。密钥只保存在本地。',
    en: 'An optional accelerator for features like verification suggestions; capture, review and export all work without it. The key stays on this device.',
  },
  'settings.llm.baseUrl': { zh: 'Base URL（OpenAI 兼容）', en: 'Base URL (OpenAI compatible)' },
  'settings.llm.model': { zh: '模型', en: 'Model' },
  'settings.llm.saved': { zh: '已保存 LLM 配置', en: 'LLM settings saved' },
  'settings.llm.test': { zh: '测试连接', en: 'Test connection' },
  'settings.llm.ok': { zh: '连接可用', en: 'Connection works' },
  'settings.llm.okModels': { zh: '连接可用（{count} 个模型）', en: 'Connection works ({count} models)' },
  'settings.llm.failed': { zh: '连接失败', en: 'Connection failed' },

  // Data
  'settings.data.title': { zh: '数据管理', en: 'Data' },
  'settings.data.description': {
    zh: '本地数据概况。「导出内容」的唯一入口在碎片库的更多菜单（Markdown + 原图 ZIP，不是数据库备份）。',
    en: 'Overview of local data. The only entry for “Export content” is the More menu of the Fragment library (Markdown + original images in a ZIP — not a database backup).',
  },
  'settings.data.stats.one': { zh: '本地学习核心：{count} 条碎片（本周新增 {added}）', en: 'Local learning core: {count} Fragment ({added} new this week)' },
  'settings.data.stats.other': { zh: '本地学习核心：{count} 条碎片（本周新增 {added}）', en: 'Local learning core: {count} Fragments ({added} new this week)' },
  'settings.orphans.title': { zh: '孤儿图片资产', en: 'Orphaned image assets' },
  'settings.orphans.description': {
    zh: '无任何截图集/碎片引用且无待交付任务的图片；可安全清理以释放空间。',
    en: 'Images that no screenshot or Fragment references and that have no pending delivery; safe to clean up to free space.',
  },
  'settings.orphans.none': { zh: '没有孤儿资产。', en: 'No orphaned assets.' },
  'settings.orphans.summary': { zh: '{count} 个孤儿资产（约 {size}MB）', en: '{count} orphaned asset(s) (about {size} MB)' },
  'settings.orphans.confirm': {
    zh: '清理 {count} 个孤儿图片资产？仅删除无引用且无待交付任务的图片。',
    en: 'Clean up {count} orphaned image asset(s)? Only images with no references and no pending delivery are deleted.',
  },
  'settings.orphans.cleanup': { zh: '清理孤儿资产', en: 'Clean up orphaned assets' },
  'settings.orphans.cleaning': { zh: '清理中…', en: 'Cleaning…' },
  'settings.orphans.cleaned': { zh: '已清理 {count} 个孤儿资产', en: 'Cleaned up {count} orphaned asset(s)' },
  'settings.orphans.failed': { zh: '清理失败', en: 'Cleanup failed' },

  // Capture funnel metrics (roadmap R1.4) — counts only
  'settings.metrics.title': { zh: '采集完成率（本地统计）', en: 'Capture completion (local statistics)' },
  'settings.metrics.description': { zh: '仅记录事件计数，不记录任何正文内容。', en: 'Only event counts are recorded — never any content.' },
  'settings.metrics.opened': { zh: '打开采集 {count}', en: 'Opened {count}' },
  'settings.metrics.reachedVerify': { zh: '到达核验 {count}', en: 'Reached verify {count}' },
  'settings.metrics.reachedApply': { zh: '到达应用 {count}', en: 'Reached apply {count}' },
  'settings.metrics.saved': { zh: '保存成功 {count}', en: 'Saved {count}' },
  'settings.metrics.exitedAt': { zh: '退出阶段：', en: 'Exited at: ' },
  'settings.metrics.separator': { zh: '、', en: ', ' },
  'settings.metrics.safeExit': {
    zh: '放弃时已有输入 {withInput} 次 · 改存高亮 {highlight} · 改存剪藏 {clip}（安全出口使用率 {rate}%）',
    en: 'Discarded with input {withInput}× · saved as highlight {highlight} · saved as clip {clip} (safe-exit rate {rate}%)',
  },
})
