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
  // block capsule + block mode (capture.md §6.2)
  'block.clip': { zh: '剪藏', en: 'Clip' },
  'block.shot': { zh: '截图', en: 'Shot' },
  'block.up': { zh: '上一级', en: 'Parent' },
  'block.more': { zh: '更多', en: 'More' },
  'block.disableSite': { zh: '在此网站停用', en: 'Disable on this site' },
  'block.disableEntry': { zh: '关闭区块剪藏入口', en: 'Turn off block entry' },
  'block.settings': { zh: '设置…', en: 'Settings…' },
  'block.mode.hint': { zh: '区块模式：Tab 下一块 · ↑↓ 换层级 · Enter 剪藏 · S 截图 · Esc 退出', en: 'Block mode: Tab next · ↑↓ level · Enter clip · S shot · Esc exit' },
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
  'library.export': { zh: '导出内容', en: 'Export content' },
  'library.exporting': { zh: '正在导出…', en: 'Exporting…' },
  'library.exportDone': { zh: '导出完成', en: 'Export complete' },
  'library.exportPartial': { zh: '部分导出', en: 'Partial export' },
  'library.empty': { zh: '还没有条目：选中网页文字即可保存', en: 'Nothing yet — select text on a page to save it' },
  'library.noResults': { zh: '没有匹配的结果', en: 'No matching results' },
  'library.clearFilters': { zh: '清除筛选', en: 'Clear filters' },
  'library.filter.type': { zh: '类型', en: 'Type' },
  'library.filter.host': { zh: '来源', en: 'Source' },
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
  'library.imagePlaceholder': { zh: '图片未保存', en: 'Image not saved' },
  'library.openOriginal': { zh: '打开原图', en: 'Open original' },
  'library.count': { zh: '共 {count} 条', en: '{count} entries' },
  'library.storageUsed': { zh: '已用 {size}', en: '{size} used' },
  'library.originalText': { zh: '原文', en: 'Original text' },
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
  'settings.shortcutsHint': {
    zh: '截图与区块模式的快捷键可在浏览器的快捷键设置里修改',
    en: 'The screenshot and block-mode keys can be changed in the browser’s shortcut settings',
  },
  'settings.data': { zh: '数据', en: 'Data' },
  'settings.metrics': { zh: '本地指标', en: 'Local metrics' },
  'settings.metricsHint': { zh: '只在本机计算的聚合数字，不上传', en: 'Aggregate numbers computed on this device only' },
  // property editing (entry.md §5)
  'property.add': { zh: '添加属性', en: 'Add property' },
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
