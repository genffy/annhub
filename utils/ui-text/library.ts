import { defineMessages } from './define'

/** Library page (extension.md §5). */
export const library = defineMessages({
  // Library (extension.md §5)
  'library.searchPlaceholder': { zh: '搜索碎片…', en: 'Search Fragments…' },
  'library.onboarding.title': { zh: '高亮 ≠ 碎片', en: 'Highlight ≠ Fragment' },
  'library.onboarding.body': {
    zh: '高亮只标记页面位置；剪藏保存原文备查；碎片要完成「核验 + 应用」，连同来源和语境一起保存。只想留个记号，用高亮或剪藏就够了。',
    en: 'A highlight only marks the page; a clip saves the text for reference; a Fragment completes “verify + apply” and is saved with its source and context. If you only want a marker, a highlight or clip is enough.',
  },
  'library.empty.title': { zh: '选中网页中的一段内容，保存你的第一个知识碎片。', en: 'Select some text on a web page and save your first Fragment.' },
  'library.empty.hint': { zh: '在页面上选中文本后选择「碎片」，或', en: 'Select text on a page and choose “Fragment”, or' },
  'library.noMatch': { zh: '没有匹配的碎片。', en: 'No matching Fragments.' },
  'library.upgrade': { zh: '升级为碎片', en: 'Upgrade to Fragment' },
  'library.convert': { zh: '转为碎片', en: 'Convert to Fragment' },
  'library.convertVisual': { zh: '转为视觉碎片', en: 'Convert to a visual Fragment' },

  // Navigation and header
  'library.nav.fragments': { zh: '碎片库', en: 'Fragment library' },
  'library.nav.screenshots': { zh: '截图集', en: 'Screenshots' },
  'library.nav.settings': { zh: '设置', en: 'Settings' },
  'library.stats.one': { zh: '{count} 条碎片 · 本周新增 {added}', en: '{count} Fragment · {added} new this week' },
  'library.stats.other': { zh: '{count} 条碎片 · 本周新增 {added}', en: '{count} Fragments · {added} new this week' },
  'library.newInspiration': { zh: '+ 新建灵感', en: '+ New inspiration' },
  'library.more': { zh: '更多 ▾', en: 'More ▾' },
  'library.exporting': { zh: '导出中…', en: 'Exporting…' },
  'library.exportZip': { zh: '导出内容（Markdown ZIP）', en: 'Export content (Markdown ZIP)' },
  'library.highlightList': { zh: '高亮列表', en: 'Highlights' },
  'library.clipList': { zh: '剪藏列表', en: 'Clips' },
  'library.back': { zh: '← 碎片库', en: '← Fragment library' },
  'library.highlightCount.one': { zh: '{count} 条高亮', en: '{count} highlight' },
  'library.highlightCount.other': { zh: '{count} 条高亮', en: '{count} highlights' },
  'library.clipCount.one': { zh: '{count} 条剪藏', en: '{count} clip' },
  'library.clipCount.other': { zh: '{count} 条剪藏', en: '{count} clips' },
  'library.gotIt': { zh: '知道了', en: 'Got it' },

  'library.openSample': { zh: '打开示例页面', en: 'Open the sample page' },

  // Filters (search.md)
  'library.filter.kind': { zh: '类型', en: 'Kind' },
  'library.filter.source': { zh: '来源', en: 'Source' },
  'library.filter.tag': { zh: '标签', en: 'Tag' },
  'library.filter.time': { zh: '时间', en: 'Time' },
  'library.time.all': { zh: '全部时间', en: 'All time' },
  'library.time.today': { zh: '今天', en: 'Today' },
  'library.time.7d': { zh: '近 7 天', en: 'Last 7 days' },
  'library.time.30d': { zh: '近 30 天', en: 'Last 30 days' },
  'library.resultCount.one': { zh: '共 {count} 条', en: '{count} result' },
  'library.resultCount.other': { zh: '共 {count} 条', en: '{count} results' },
  'library.clearFilters': { zh: '清除筛选', en: 'Clear filters' },
  'library.newInspirationEmpty': { zh: '新建一条灵感', en: 'New inspiration' },
  'library.loadMore': { zh: '加载更多（{shown}/{total}）', en: 'Load more ({shown}/{total})' },

  // Fragment card (extension PRD §5.3)
  'library.card.backToSource': { zh: '回到原文', en: 'Back to source' },
  'library.card.source': { zh: '原文', en: 'Source' },
  'library.card.guess': { zh: '理解', en: 'Understanding' },
  'library.card.verified': { zh: '核验（{source}，{time}）', en: 'Verified ({source}, {time})' },
  'library.card.noSummary': { zh: '已确认，无摘要', en: 'Confirmed, no summary' },
  'library.card.use': { zh: '应用', en: 'Apply' },
  'library.card.edit': { zh: '编辑', en: 'Edit' },
  'library.confirmDelete': {
    zh: '删除这条碎片？此操作不可撤销。',
    en: 'Delete this Fragment? This cannot be undone.',
  },
  'library.exportPartial': {
    zh: '部分导出：{count} 个图片资产缺失，详见 ZIP 内 README.md。',
    en: 'Partial export: {count} image asset(s) are missing — see README.md inside the ZIP.',
  },
  'library.exportFailed': { zh: '导出失败', en: 'Export failed' },

  // Capture-field editor (extension PRD §5.4)
  'library.editor.title': { zh: '编辑碎片（当前修订 {revision}）', en: 'Edit Fragment (current revision {revision})' },
  'library.editor.content': { zh: '内容', en: 'Content' },
  'library.editor.context': { zh: '上下文（需包含内容）', en: 'Context (must contain the content)' },
  'library.editor.sourceUrl': { zh: '来源 URL', en: 'Source URL' },
  'library.editor.guess': { zh: '理解', en: 'Understanding' },
  'library.editor.use': { zh: '应用', en: 'Apply' },
  'library.editor.summary': { zh: '核验摘要（可选，编辑不影响已确认状态）', en: 'Verification summary (optional; editing keeps the confirmation)' },
  'library.editor.notes': { zh: '核验备注（可选）', en: 'Verification notes (optional)' },
  'library.editor.tags': { zh: '标签（逗号分隔）', en: 'Tags (comma separated)' },
  'library.editor.reverified': { zh: '已重新确认核验（{time}）。', en: 'Verification re-confirmed ({time}).' },
  'library.editor.reverify': { zh: '内容已修改 — 重新确认核验', en: 'Content changed — re-confirm verification' },
  'library.editor.needReverify': {
    zh: '修改了内容、语境、来源或类型，需要重新确认核验。',
    en: 'You changed the content, context, source or kind — verification must be confirmed again.',
  },
  'library.editor.saveFailed': { zh: '保存失败（输入已保留）', en: 'Save failed (your input is kept)' },
  'library.editor.save': { zh: '保存修改', en: 'Save changes' },

  // Highlight and clip lists
  'library.highlights.confirmDelete': { zh: '删除该高亮？', en: 'Delete this highlight?' },
  'library.highlights.empty': { zh: '还没有高亮。在网页选中文本后选择「高亮」。', en: 'No highlights yet. Select text on a page and choose “Highlight”.' },
  'library.clips.empty': { zh: '还没有剪藏。在网页选中文本后选择「剪藏」。', en: 'No clips yet. Select text on a page and choose “Clip”.' },
  'library.note': { zh: '备注：{note}', en: 'Note: {note}' },

  // Screenshot library and the visual Fragment form (docs/v2/screenshot.md; extension PRD §6)
  'shots.confirmDelete': { zh: '删除该截图？若已有碎片引用该图片，图片仍会保留。', en: 'Delete this screenshot? If a Fragment already uses the image, the image is kept.' },
  'shots.empty.title': { zh: '还没有截图采集。', en: 'No screenshots yet.' },
  'shots.empty.before': { zh: '在任意网页按 ', en: 'On any web page press ' },
  'shots.empty.middle': { zh: '（macOS ', en: ' (macOS ' },
  'shots.empty.after': {
    zh: '），拖拽截取区域或单击截取元素；确认入库的截图会出现在这里。',
    en: '), then drag to capture an area or click to capture an element. Screenshots you save appear here.',
  },
  'shots.alt': { zh: '截图', en: 'Screenshot' },
  'shots.missing': { zh: '图片缺失（资产不在本地库中）', en: 'Image missing (the asset is not in the local library)' },
  'shots.local': { zh: '本地', en: 'Local' },
  'visual.contextFrom': { zh: '（来自 {host}）', en: '(from {host})' },
  'visual.contextFromTitle': { zh: '（来自 {host}：{title}）', en: '(from {host}: {title})' },
  'visual.use.repeatsDescription': { zh: '应用不能只复述描述', en: '“Apply” cannot just repeat the description' },
  'visual.duplicate': { zh: '已保存过相同描述的视觉碎片。仍要保存？', en: 'A visual Fragment with the same description was already saved. Save anyway?' },
  'visual.content.label': { zh: '关键细节描述（必填，content）', en: 'Key detail description (required, content)' },
  'visual.content.placeholder': { zh: '这张截图里值得记住的结构、数字或设计细节', en: 'The structure, numbers or design details worth remembering in this screenshot' },
  'visual.context.label': { zh: '页面语境（可选，接在描述后）', en: 'Page context (optional, appended after the description)' },
  'visual.verify.title': { zh: '核验 — 对照原图与页面语境', en: 'Verify — compare with the original image and page context' },
  'visual.verify.note': {
    zh: '已确认核对（原文材料，{time}）。修改描述或语境后需重新确认。',
    en: 'Confirmed (source material, {time}). Editing the description or context requires confirming again.',
  },
  'visual.use.label': { zh: '应用（必填）', en: 'Apply (required)' },
  'visual.use.placeholder': { zh: '准备在哪个任务中使用或检验这张图？', en: 'In which task will you use or check this image?' },
  'visual.save': { zh: '保存视觉碎片', en: 'Save visual Fragment' },
})
