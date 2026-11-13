/** The words the popup and the library pages both read (RV-LIB-22): the view names the popup's rail
 *  and the library's navigation share, and the relative-time rows both lists show. One small table,
 *  so neither entry drags the other's whole word list in; every other key lives in its own table. */
export const sharedStrings = {
  'library.all': { zh: '全部', en: 'All' },
  'library.clips': { zh: '剪藏', en: 'Clips' },
  'library.screenshots': { zh: '截图', en: 'Screenshots' },
  'library.highlights': { zh: '高亮', en: 'Highlights' },
  'library.settings': { zh: '设置', en: 'Settings' },
  'time.justNow': { zh: '刚刚', en: 'just now' },
  'time.minutesAgo': { zh: '{count} 分钟前', en: '{count} min ago' },
  'time.hoursAgo': { zh: '{count} 小时前', en: '{count} h ago' },
  'time.daysAgo': { zh: '{count} 天前', en: '{count} d ago' },
  'library.shortcutHint': {
    zh: '选中网页文字即可保存 · {keys} 截图',
    en: 'Select text on a page to save it · {keys} to screenshot',
  },
  // the same hint when the browser has no key bound to the screenshot (extension.md §7.1)
  'library.shortcutHint.unbound': { zh: '选中网页文字即可保存', en: 'Select text on a page to save it' },
}
