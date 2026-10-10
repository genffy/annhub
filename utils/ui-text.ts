/**
 * Interface strings, Chinese and English (extension.md §2.7). The language
 * follows the browser UI language: Chinese-family languages get Chinese,
 * everything else English; there is no manual switch. Saved user content is
 * never translated.
 */

export type UiLanguage = 'zh' | 'en'

/** Chinese-family browser languages read Chinese; everyone else reads English. */
export function uiLanguageFor(browserLanguage: string | undefined): UiLanguage {
  return (browserLanguage ?? '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function currentUiLanguage(): UiLanguage {
  if (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage) {
    try {
      return uiLanguageFor(chrome.i18n.getUILanguage())
    } catch {
      /* fall through to navigator */
    }
  }
  return uiLanguageFor(typeof navigator !== 'undefined' ? navigator.language : undefined)
}

const STRINGS = {
  // selection menu (extension.md §2.1)
  'menu.clip': { zh: '剪藏', en: 'Clip' },
  'menu.clip.hint': { zh: '保存选中的内容，之后在资料库里读和高亮', en: 'Save the selection to read and highlight later' },
  'menu.screenshot': { zh: '截图', en: 'Screenshot' },
  'menu.screenshot.hint': { zh: '框选区域或单击元素 · 保存为图片', en: 'Drag an area or click an element · save as image' },
  // clip toast + quick edit (extension.md §3)
  'toast.clipped': { zh: '已剪藏', en: 'Clipped' },
  'toast.undo': { zh: '撤销', en: 'Undo' },
  'toast.edit': { zh: '编辑', en: 'Edit' },
  'toast.undone': { zh: '已撤销', en: 'Undone' },
  'toast.undoFailed': { zh: '撤销失败，请重试', en: 'Undo failed. Try again.' },
  'toast.saveFailed': { zh: '保存失败', en: 'Save failed' },
  'toast.retry': { zh: '重试', en: 'Retry' },
  'toast.truncated': {
    zh: '内容过长，只保存了前 100,000 个字符，可改选其中一节再剪藏',
    en: 'Content was long; only the first 100,000 characters were saved — clip a section instead',
  },
  'edit.title': { zh: '标题', en: 'Title' },
  'edit.tags': { zh: '标签', en: 'Tags' },
  'edit.note': { zh: '备注', en: 'Note' },
  'edit.more': { zh: '更多属性', en: 'More properties' },
  'edit.done': { zh: '完成', en: 'Done' },
  'edit.error.tagTooLong': { zh: '每个标签最多 {limit} 个字符。', en: 'Each tag is limited to {limit} characters.' },
  'edit.error.tooManyTags': { zh: '最多添加 {limit} 个标签。', en: 'You can add up to {limit} tags.' },
  // block capsule + block mode (capture.md §6.2)
  'block.clip': { zh: '剪藏', en: 'Clip' },
  'block.shot': { zh: '截图', en: 'Shot' },
  'block.up': { zh: '上一级', en: 'Parent' },
  'block.more': { zh: '更多', en: 'More' },
  'block.disableSite': { zh: '在此网站停用', en: 'Disable on this site' },
  'block.disableEntry': { zh: '关闭区块剪藏入口', en: 'Turn off block entry' },
  'block.settings': { zh: '设置…', en: 'Settings…' },
  'block.mode.hint': { zh: '区块模式：Tab 下一块 · ↑↓ 换层级 · Enter 剪藏 · S 截图 · Esc 退出', en: 'Block mode: Tab next · ↑↓ level · Enter clip · S shot · Esc exit' },
  'block.mode.hintClipOnly': { zh: '区块模式：Tab 下一块 · ↑↓ 换层级 · Enter 剪藏 · Esc 退出', en: 'Block mode: Tab next · ↑↓ level · Enter clip · Esc exit' },
  'block.kind.post': { zh: '帖子', en: 'Post' },
  'block.kind.code': { zh: '代码块', en: 'Code block' },
  'block.kind.table': { zh: '表格', en: 'Table' },
  'block.kind.figure': { zh: '图', en: 'Figure' },
  'block.kind.quote': { zh: '引用', en: 'Quote' },
  'block.kind.section': { zh: '一节', en: 'Section' },
  'block.kind.article': { zh: '文章', en: 'Article' },
  // screenshot session (screenshot.md §1)
  'shot.hint': { zh: '拖拽选择区域，单击选择元素 · Esc 取消', en: 'Drag to select an area, click to pick an element · Esc to cancel' },
  'shot.toolbar': { zh: '截图工具栏', en: 'Screenshot toolbar' },
  'shot.anonymize': { zh: '匿名：{state}', en: 'Anonymize: {state}' },
  'shot.watermark': { zh: '水印：{state}', en: 'Watermark: {state}' },
  'shot.ratio.free': { zh: '自由', en: 'Free' },
  'shot.beautify': { zh: '美化', en: 'Beautify' },
  'shot.confirmSelection': { zh: '确认选区 ↵', en: 'Confirm selection ↵' },
  'shot.margin': { zh: '边距', en: 'Margin' },
  'shot.lastFrame': { zh: '上次取景框', en: 'Last frame' },
  'shot.frameNotFound': { zh: '没找到上次的元素', en: 'last element not found' },
  'shot.frameTooBig': { zh: '取景框比窗口大：减小边距或缩小页面缩放', en: 'The frame is bigger than the window: reduce the margin or zoom out' },
  'shot.beautify.reset': { zh: '复原', en: 'Reset' },
  'shot.beautify.background': { zh: '背景', en: 'Background' },
  'shot.beautify.padding': { zh: '内边距', en: 'Padding' },
  'shot.beautify.radius': { zh: '圆角', en: 'Radius' },
  'shot.beautify.shadow': { zh: '阴影', en: 'Shadow' },
  'shot.beautify.ratio': { zh: '输出画布比例', en: 'Output canvas ratio' },
  'shot.beautify.enabled': { zh: '启用美化', en: 'Apply beautify' },
  'shot.beautify.background.none': { zh: '无（透明）', en: 'None (transparent)' },
  'shot.beautify.background.solid-white': { zh: '纯白', en: 'White' },
  'shot.beautify.background.solid-ivory': { zh: '米色', en: 'Ivory' },
  'shot.beautify.background.grad-purple': { zh: '紫色渐变', en: 'Purple gradient' },
  'shot.beautify.background.grad-blue': { zh: '蓝色渐变', en: 'Blue gradient' },
  'shot.beautify.background.grad-green': { zh: '绿色渐变', en: 'Green gradient' },
  'shot.beautify.background.grad-sunset': { zh: '暖橙渐变', en: 'Peach gradient' },
  'shot.beautify.background.grad-slate': { zh: '深灰渐变', en: 'Slate gradient' },
  'shot.on': { zh: '开', en: 'on' },
  'shot.off': { zh: '关', en: 'off' },
  'shot.colors': { zh: '标注颜色', en: 'Annotation colors' },
  'shot.color.red': { zh: '红', en: 'Red' },
  'shot.color.yellow': { zh: '黄', en: 'Yellow' },
  'shot.color.teal': { zh: '青', en: 'Teal' },
  'shot.color.white': { zh: '白', en: 'White' },
  'shot.color.black': { zh: '黑', en: 'Black' },
  'shot.tool.rect': { zh: '矩形', en: 'Rectangle' },
  'shot.tool.ellipse': { zh: '椭圆', en: 'Ellipse' },
  'shot.tool.arrow': { zh: '箭头', en: 'Arrow' },
  'shot.tool.pen': { zh: '画笔', en: 'Pen' },
  'shot.tool.mosaic': { zh: '马赛克', en: 'Mosaic' },
  'shot.tool.text': { zh: '文字', en: 'Text' },
  'shot.tool.undo': { zh: '撤销', en: 'Undo' },
  'shot.tool.copy': { zh: '复制', en: 'Copy' },
  'shot.tool.download': { zh: '下载', en: 'Download' },
  'shot.tool.cancel': { zh: '取消', en: 'Cancel' },
  'shot.tool.confirm': { zh: '确认', en: 'Confirm' },
  'shot.mask': { zh: '马赛克 {index}', en: 'Mosaic {index}' },
  'shot.mask.remove': { zh: '移除马赛克 {index}', en: 'Remove mosaic {index}' },
  'shot.copied': { zh: '已复制', en: 'Copied' },
  'shot.copyInstead': { zh: '此页面不允许复制，请下载', en: 'This page does not allow copying; download instead' },
  'shot.downloaded': { zh: '已下载', en: 'Downloaded' },
  'shot.masks': { zh: '马赛克区域', en: 'Mosaic areas' },
  'shot.failed': { zh: '截图失败', en: 'Screenshot failed' },
  'shot.error.capture': { zh: '无法截取此页面', en: 'Cannot capture this page' },
  'shot.error.notVisible': { zh: '只有当前显示的标签页可以截图', en: 'Only the visible tab can be captured' },
  'shot.error.crop': { zh: '选区无效', en: 'Invalid selection' },
  'shot.error.decode': { zh: '图片解码失败', en: 'Image decoding failed' },
  'shot.error.element': { zh: '元素截图失败', en: 'Element capture failed' },
  'shot.error.saveFailed': { zh: '保存失败，请重试', en: 'Save failed, try again' },
  'error.quota': {
    zh: '存储空间不足，没有保存。请先在资料库里导出内容，再删除不需要的条目。',
    en: 'Storage is full, so nothing was saved. Export your content from the library, then delete entries you no longer need.',
  },
  'error.imageTooLarge': { zh: '图片超过单张大小上限，没有保存。', en: 'The image exceeds the per-image limit and was not saved.' },
  'error.imageInvalid': { zh: '图片数据无效，没有保存。', en: 'The image data is invalid and was not saved.' },
  'error.emptyContent': { zh: '选中的内容里没有可保存的文字。', en: 'There is no text to save in what was selected.' },
  'shot.error.copyFailed': { zh: '复制失败', en: 'Copy failed' },
  'shot.error.downloadFailed': { zh: '下载失败，请重试', en: 'Download failed, try again' },
  'shot.textInput.placeholder': { zh: '输入文字', en: 'Type text' },
  'shot.anonymizePlaceholder': { zh: '已匿名', en: 'Anonymized' },
  'shot.error.emptySelection': { zh: '选区面积为零', en: 'The selection has zero area' },
  'shot.error.edit': { zh: '标注失败', en: 'Annotation failed' },
  // library page (extension.md §2.2-2.3) — R1 subset
  'library.searchPlaceholder': { zh: '搜索条目…', en: 'Search entries…' },
  'library.all': { zh: '全部', en: 'All' },
  'library.clips': { zh: '剪藏', en: 'Clips' },
  'library.screenshots': { zh: '截图', en: 'Screenshots' },
  'library.settings': { zh: '设置', en: 'Settings' },
  'library.navCollapse': { zh: '折叠导航', en: 'Collapse navigation' },
  'library.navExpand': { zh: '展开导航', en: 'Expand navigation' },
  'library.export': { zh: '导出内容', en: 'Export content' },
  'library.exporting': { zh: '正在导出…', en: 'Exporting…' },
  'library.exportDone': { zh: '导出完成', en: 'Export complete' },
  'library.exportPartial': { zh: '部分导出', en: 'Partial export' },
  'library.exportSummary': { zh: '{clips} 条剪藏、{screenshots} 张截图；缺失图片 {missing} 项', en: '{clips} clips, {screenshots} screenshots; {missing} missing images' },
  'library.exportError.limit': {
    zh: '导出失败：内容超过 ZIP 格式的上限，没有生成文件。请先删除一部分条目再导出。',
    en: 'Export failed: the content exceeds the ZIP format limit and no file was made. Delete some entries and try again.',
  },
  'library.exportError.quota': {
    zh: '导出失败：本机可用空间不足，没有生成文件。请释放磁盘空间后重试。',
    en: 'Export failed: not enough free space on this device, and no file was made. Free some disk space and try again.',
  },
  'library.exportError.download': {
    zh: '导出失败：浏览器没有接受下载，没有保存文件。请检查下载设置后重试。',
    en: 'Export failed: the browser did not accept the download, so no file was saved. Check the download settings and try again.',
  },
  'library.exportError.general': { zh: '导出失败，没有生成文件。请稍后重试。', en: 'Export failed and no file was made. Try again in a moment.' },
  'library.context': { zh: '语境', en: 'Context' },
  'library.imagePreview': { zh: '图片预览', en: 'Image preview' },
  'library.error.notFound': { zh: '未找到该条目。', en: 'Entry not found.' },
  'library.empty': { zh: '还没有条目：选中网页文字即可保存', en: 'Nothing yet — select text on a page to save it' },
  'library.noResults': { zh: '没有匹配的结果', en: 'No matching results' },
  'library.clearFilters': { zh: '清除筛选', en: 'Clear filters' },
  'library.filters': { zh: '筛选', en: 'Filters' },
  'library.filter.type': { zh: '类型', en: 'Type' },
  'library.filter.host': { zh: '来源', en: 'Source' },
  'library.filter.color': { zh: '颜色', en: 'Color' },
  'library.color.yellow': { zh: '黄色', en: 'Yellow' },
  'library.color.green': { zh: '绿色', en: 'Green' },
  'library.color.blue': { zh: '蓝色', en: 'Blue' },
  'library.color.pink': { zh: '粉色', en: 'Pink' },
  'library.color.purple': { zh: '紫色', en: 'Purple' },
  'library.filter.tag': { zh: '标签', en: 'Tags' },
  'library.filter.time': { zh: '时间', en: 'Time' },
  'library.filter.timeFrom': { zh: '开始日期', en: 'From' },
  'library.filter.timeTo': { zh: '结束日期', en: 'To' },
  'library.filter.property': { zh: '属性', en: 'Property' },
  'library.filter.operator': { zh: '条件', en: 'Condition' },
  'library.filter.value': { zh: '值', en: 'Value' },
  'library.filter.value2': { zh: '至', en: 'and' },
  'library.op.contains': { zh: '包含', en: 'contains' },
  'library.op.equals': { zh: '等于', en: 'equals' },
  'library.op.has': { zh: '含有某一项', en: 'has item' },
  'library.op.eq': { zh: '等于', en: '=' },
  'library.op.gt': { zh: '大于', en: '>' },
  'library.op.lt': { zh: '小于', en: '<' },
  'library.op.between': { zh: '区间', en: 'between' },
  'library.op.is': { zh: '是', en: 'is' },
  'library.value.yes': { zh: '是', en: 'yes' },
  'library.value.no': { zh: '否', en: 'no' },
  'library.backToSource': { zh: '回到来源', en: 'Back to source' },
  'library.read': { zh: '阅读', en: 'Read' },
  'library.delete': { zh: '删除', en: 'Delete' },
  'library.deleteConfirm': { zh: '删除这条条目？', en: 'Delete this entry?' },
  'library.deleteWithHighlights': { zh: '删除这条剪藏？它带着 {count} 条高亮，会一并删除。', en: 'Delete this clip? Its {count} highlights go with it.' },
  'library.imageMissing': { zh: '图片缺失', en: 'Image missing' },
  'library.highlightsCount': { zh: '{count} 高亮', en: '{count} highlights' },
  'library.highlights': { zh: '高亮', en: 'Highlights' },
  'reading.locked': {
    zh: '有高亮时原文只读：高亮的范围依赖原文。删除全部高亮后恢复可编辑。',
    en: 'The original text is read-only while highlights exist — their ranges depend on it. Delete all highlights to edit again.',
  },
  'reading.empty': { zh: '在正文里选中文字即可创建高亮；键盘上选中后按 H。', en: 'Select text in the article to highlight; press H after a keyboard selection.' },
  'reading.note': { zh: '备注', en: 'Note' },
  'reading.edit': { zh: '编辑高亮', en: 'Edit highlight' },
  'reading.deleted': { zh: '已删除', en: 'Deleted' },
  'reading.locate': { zh: '定位', en: 'Locate' },
  'reading.back': { zh: '返回', en: 'Back' },
  'library.imagePlaceholder': { zh: '图片未保存', en: 'Image not saved' },
  'library.openOriginal': { zh: '打开原图', en: 'Open original' },
  'library.count': { zh: '共 {count} 条', en: '{count} entries' },
  'library.loadMore': { zh: '显示更多（还有 {count} 条）', en: 'Show more ({count} more)' },
  'library.storageUsed': { zh: '已用 {size}', en: '{size} used' },
  'library.originalText': { zh: '原文', en: 'Original text' },
  'library.originalMarkdown': { zh: '原文（Markdown）', en: 'Original text (Markdown)' },
  'library.edit': { zh: '编辑', en: 'Edit' },
  'library.editOriginal': { zh: '编辑原文', en: 'Edit original text' },
  'library.editContext': { zh: '编辑语境', en: 'Edit context' },
  'library.error.contentInvalid': {
    zh: '原文没有保存：原文不能为空，最多 {limit} 个字符；有语境时，语境必须仍然包含原文。',
    en: 'The original text was not saved: it cannot be empty or exceed {limit} characters, and a context must still contain it.',
  },
  'library.error.contextInvalid': {
    zh: '语境没有保存：语境最多 {limit} 个字符，并且必须包含原文。',
    en: 'The context was not saved: it is limited to {limit} characters and must contain the original text.',
  },
  'library.note': { zh: '备注', en: 'Note' },
  'library.properties': { zh: '属性', en: 'Properties' },
  'library.openLibrary': { zh: '在资料库中打开', en: 'Open in library' },
  'library.shortcutHint': { zh: '选中网页文字即可保存 · Cmd/Ctrl+Shift+S 截图', en: 'Select text on a page to save it · Cmd/Ctrl+Shift+S to screenshot' },
  // settings page (extension.md §2.5) — R1 subset
  'settings.title': { zh: '设置', en: 'Settings' },
  'settings.blockEntry': { zh: '区块剪藏入口', en: 'Block clip entry' },
  'settings.blockEntryHint': {
    zh: '指针停在帖子、代码块、一节或文章上时出现「剪藏」胶囊',
    en: 'Shows the clip capsule when the pointer rests on a post, code block, section or article',
  },
  'settings.disabledSites': { zh: '已停用的网站', en: 'Disabled sites' },
  'settings.remove': { zh: '移除', en: 'Remove' },
  'settings.anonymize': { zh: '截图默认匿名', en: 'Anonymize screenshots by default' },
  'settings.anonymizeHint': { zh: '截图开始时自动遮住页面上的身份元素', en: 'Covers identity elements when a screenshot starts' },
  'settings.shortcuts': { zh: '快捷键', en: 'Shortcuts' },
  'settings.screenshot': { zh: '截图输出', en: 'Screenshot output' },
  'settings.downloadFormat': { zh: '下载格式', en: 'Download format' },
  'settings.quality': { zh: '质量', en: 'Quality' },
  'settings.watermark': { zh: '品牌水印（只加在复制与下载上，入库保持原样）', en: 'Brand watermark (copy & download only; the library keeps the original)' },
  'settings.watermarkText': { zh: '水印文字（至多 40 字符）', en: 'Watermark text (≤ 40 characters)' },
  'settings.watermarkImage': { zh: '水印图片（PNG ≤ 512 KB）', en: 'Watermark image (PNG ≤ 512 KB)' },
  'settings.position': { zh: '位置', en: 'Position' },
  'settings.size': { zh: '大小', en: 'Size' },
  'settings.size.small': { zh: '小', en: 'Small' },
  'settings.size.medium': { zh: '中', en: 'Medium' },
  'settings.size.large': { zh: '大', en: 'Large' },
  'settings.opacity': { zh: '透明度', en: 'Opacity' },
  'settings.preview': { zh: '预览', en: 'Preview' },
  'settings.ratioPresets': { zh: '比例预设（选区条上出现哪些）', en: 'Ratio presets (which appear on the selection bar)' },
  'settings.beautify': { zh: '极简美化（默认开关与初始样式）', en: 'Minimal beautify (default on/off and initial style)' },
  'settings.background': { zh: '背景', en: 'Background' },
  'settings.padding': { zh: '内边距', en: 'Padding' },
  'settings.radius': { zh: '圆角', en: 'Radius' },
  'settings.shadow': { zh: '阴影', en: 'Shadow' },
  'settings.shortcutsHint': {
    zh: '截图与区块模式的快捷键可在浏览器的快捷键设置里修改',
    en: 'The screenshot and block-mode keys can be changed in the browser’s shortcut settings',
  },
  'settings.data': { zh: '数据', en: 'Data' },
  'settings.metrics': { zh: '本地指标', en: 'Local metrics' },
  'settings.metricsHint': { zh: '只在本机计算的聚合数字，不上传', en: 'Aggregate numbers computed on this device only' },
  'settings.metricsRefresh': { zh: '刷新指标', en: 'Refresh metrics' },
  'settings.orphanReport': { zh: '检查异常残留资产', en: 'Check leftover assets' },
  'settings.orphanUnreferenced': { zh: '无条目引用的资产', en: 'Unreferenced assets' },
  'settings.orphanMissing': { zh: '图片缺失的条目', en: 'Entries with missing images' },
  'library.guide.clip': {
    zh: '剪藏：选中一段或指一下整块，一次点击存成 Markdown，带着来源。',
    en: 'Clip: select a passage or point at a whole block — one click saves it as Markdown with its source.',
  },
  'library.guide.shot': { zh: '截图：框选或点选，原位标注、遮住身份信息后入库。', en: 'Screenshot: drag or click, annotate in place and mask identities before saving.' },
  'library.guide.hl': { zh: '高亮：在资料库里读剪藏时划重点、写想法。', en: 'Highlight: draw marks and notes while reading a clip in the library.' },
  'library.guide.sample': { zh: '打开示例页面', en: 'Open sample page' },
  'library.guide.dismiss': { zh: '知道了', en: 'Got it' },
  'library.empty.clips': { zh: '还没有剪藏：选中网页文字即可保存。', en: 'No clips yet — select text on a page to save it.' },
  'library.empty.screenshots': { zh: '还没有截图：Ctrl/Cmd+Shift+S 框选即可。', en: 'No screenshots yet — Ctrl/Cmd+Shift+S to drag one.' },
  'library.empty.highlights': { zh: '还没有高亮：打开一条剪藏的阅读视图，选中文字即可。', en: 'No highlights yet — open a clip and select text in the reading view.' },
  // property editing (entry.md §5)
  'property.add': { zh: '添加属性', en: 'Add property' },
  'property.addItem': { zh: '回车添加一项', en: 'Press Enter to add an item' },
  'property.error.name': {
    zh: '属性名无效：不能为空、超过 64 字符、是保留名或 annhub_ 前缀。',
    en: 'Invalid property name: empty, over 64 characters, reserved, or annhub_-prefixed.',
  },
  'property.error.type': { zh: '同名属性已注册为其他类型。', en: 'A property with this name is already registered with another type.' },
  'property.error.value': { zh: '值不符合该属性的类型或上限。', en: 'The value does not match the property type or its limits.' },
  'property.error.textTooLong': {
    zh: '文本最多 {limit} 个字符，当前超出 {excess} 个。',
    en: 'Text is limited to {limit} characters; remove {excess}.',
  },
  'property.error.listItemTooLong': {
    zh: '每项最多 {limit} 个字符，当前超出 {excess} 个。',
    en: 'Each item is limited to {limit} characters; remove {excess}.',
  },
  'property.error.listTooMany': { zh: '列表最多 {limit} 项。', en: 'This list is limited to {limit} items.' },
  'property.error.titleRequired': { zh: '标题不能清空。', en: 'The title cannot be empty.' },
  'property.system.source': { zh: '来源', en: 'Source' },
  'property.system.created': { zh: '创建时间', en: 'Created' },
  'property.system.updated': { zh: '更新时间', en: 'Updated' },
  'settings.error.imageTooLarge': { zh: '水印图片不能超过 512 KB。', en: 'The watermark image must be 512 KB or smaller.' },
  'settings.defaultHighlightColor': { zh: '默认高亮颜色', en: 'Default highlight color' },
  'settings.shortcut.screenshot': { zh: '截图', en: 'Screenshot' },
  'settings.shortcut.block': { zh: '区块模式', en: 'Block mode' },
  'settings.shortcut.unassigned': { zh: '未设置', en: 'Not assigned' },
  'settings.shortcut.manage': { zh: '管理快捷键', en: 'Manage shortcuts' },
  'settings.orphanCleanup': { zh: '清理未引用的资产', en: 'Remove unreferenced assets' },
  'settings.orphanConfirm': { zh: '确定删除 {count} 个未引用的资产？', en: 'Remove {count} unreferenced assets?' },
  'reading.error.noteTooLong': { zh: '高亮备注最多 1000 个字符。', en: 'Highlight notes are limited to 1000 characters.' },
  'property.error.limit': { zh: '条目属性数超过上限（50）。', en: 'This entry already carries the maximum of 50 properties.' },
  'property.error.inUse': { zh: '使用中的属性不能删除。', en: 'A property in use cannot be deleted.' },
  'property.defaultValue': { zh: '默认值', en: 'Default value' },
  'property.usage': { zh: '使用数', en: 'Usage' },
  'property.builtin': { zh: '内置', en: 'built-in' },
  'property.fixed': { zh: '固定', en: 'Fixed' },
  'property.fixedPreset': { zh: '固定附加，不可取消', en: 'Always attached; cannot be turned off' },
  'property.deleteBuiltin': { zh: '内置属性不可删除', en: 'Built-in properties cannot be deleted' },
  'property.deleteInUse': { zh: '使用中，不可删除', en: 'In use, so it cannot be deleted' },
  'property.presets': { zh: '预设', en: 'Presets' },
  'property.deleteUnused': { zh: '删除未使用', en: 'Delete unused' },
  'property.willDelete': { zh: '将删除：{names}', en: 'Will delete: {names}' },
  'property.name': { zh: '名称', en: 'Name' },
  'property.type': { zh: '类型', en: 'Type' },
  'property.type.text': { zh: '文本', en: 'Text' },
  'property.type.list': { zh: '列表', en: 'List' },
  'property.type.number': { zh: '数字', en: 'Number' },
  'property.type.checkbox': { zh: '复选框', en: 'Checkbox' },
  'property.type.date': { zh: '日期', en: 'Date' },
  'property.type.datetime': { zh: '日期时间', en: 'Date & time' },
  // shared
  'common.close': { zh: '关闭', en: 'Close' },
  'common.cancel': { zh: '取消', en: 'Cancel' },
  'common.save': { zh: '保存', en: 'Save' },
  'common.loading': { zh: '加载中…', en: 'Loading…' },
  'time.justNow': { zh: '刚刚', en: 'just now' },
  'time.minutesAgo': { zh: '{count} 分钟前', en: '{count} min ago' },
  'time.hoursAgo': { zh: '{count} 小时前', en: '{count} h ago' },
  'time.daysAgo': { zh: '{count} 天前', en: '{count} d ago' },
} as const

export type UiTextKey = keyof typeof STRINGS

/** The reasons the user can be told, by the stable code the worker answered with (entry.md §6, screenshot.md §5). */
const ERROR_TEXT: Record<string, UiTextKey> = {
  PROPERTY_NAME_INVALID: 'property.error.name',
  PROPERTY_TYPE_MISMATCH: 'property.error.type',
  PROPERTY_VALUE_INVALID: 'property.error.value',
  PROPERTY_LIMIT_EXCEEDED: 'property.error.limit',
  PROPERTY_IN_USE: 'property.error.inUse',
  EMPTY_CONTENT: 'error.emptyContent',
  STORAGE_QUOTA_EXCEEDED: 'error.quota',
  ENTRY_ASSET_TOO_LARGE: 'error.imageTooLarge',
  ENTRY_ASSET_MISSING: 'error.imageInvalid',
  CAPTURE_NOT_VISIBLE: 'shot.error.notVisible',
  CAPTURE_FAILED: 'shot.error.capture',
  DOWNLOAD_FAILED: 'shot.error.downloadFailed',
}

/** Why something failed, in words — or '' for a code that has no reason worth telling (never a raw message). */
export function failureReason(code?: string, lang?: UiLanguage): string {
  const key = ERROR_TEXT[code ?? '']
  return key ? uiText(key, {}, lang) : ''
}

/** A failure to show wherever an edit or save did not go through: the reason if there is one, else "Save failed". */
export function entryErrorText(code?: string, lang?: UiLanguage): string {
  return failureReason(code, lang) || uiText('toast.saveFailed', {}, lang)
}

/** The screenshot flow's own phrasing for a failed save (it keeps the preview and says "try again"). */
export function screenshotSaveErrorText(code: string | undefined): string {
  return failureReason(code) || uiText('shot.error.saveFailed')
}

/** A failed capture, copy or download in the screenshot session. */
export function screenshotFailureText(code: string | undefined, fallback: UiTextKey): string {
  return failureReason(code) || uiText(fallback)
}

export function uiText(key: UiTextKey, params: Record<string, string | number> = {}, lang?: UiLanguage): string {
  const entry = STRINGS[key]
  if (!entry) return key
  const language = lang ?? currentUiLanguage()
  let text: string = entry[language]
  for (const [name, value] of Object.entries(params)) {
    text = text.split(`{${name}}`).join(String(value))
  }
  return text
}

/** Marks the extension page's document language for the UI language in effect. */
export function applyDocumentLanguage(): void {
  document.documentElement.lang = currentUiLanguage() === 'zh' ? 'zh-CN' : 'en'
}
