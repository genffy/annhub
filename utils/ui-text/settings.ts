import { defineMessages } from './define'

/** Settings page (extension.md §2.2): capture, LLM and data blocks. */
export const settings = defineMessages({
  'settings.description': { zh: '采集偏好、LLM 与数据管理', en: 'Capture preferences, LLM and data' },
  'settings.secretKept': { zh: '已保存（不会显示），留空则保持不变', en: 'Saved (not shown); leave empty to keep it' },

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
    zh: '核验建议等能力的可选加速器；关闭后采集与导出全部可用。密钥只保存在本地。',
    en: 'An optional accelerator for features like verification suggestions; capture and export work without it. The key stays on this device.',
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
  'settings.data.stats.one': { zh: '本地碎片：{count} 条（本周新增 {added}）', en: 'Local: {count} Fragment ({added} new this week)' },
  'settings.data.stats.other': { zh: '本地碎片：{count} 条（本周新增 {added}）', en: 'Local: {count} Fragments ({added} new this week)' },
  'settings.orphans.title': { zh: '孤儿图片资产', en: 'Orphaned image assets' },
  'settings.orphans.description': {
    zh: '无任何截图集或碎片引用的图片；可安全清理以释放空间。',
    en: 'Images that no screenshot or Fragment references; safe to clean up to free space.',
  },
  'settings.orphans.none': { zh: '没有孤儿资产。', en: 'No orphaned assets.' },
  'settings.orphans.summary': { zh: '{count} 个孤儿资产（约 {size}MB）', en: '{count} orphaned asset(s) (about {size} MB)' },
  'settings.orphans.confirm': {
    zh: '清理 {count} 个孤儿图片资产？仅删除没有任何引用的图片。',
    en: 'Clean up {count} orphaned image asset(s)? Only images with no references are deleted.',
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
