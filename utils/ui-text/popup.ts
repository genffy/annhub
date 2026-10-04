import { defineMessages } from './define'

/** Toolbar popup (extension.md §2.3). */
export const popup = defineMessages({
  'popup.newInspiration': { zh: '新建灵感', en: 'New inspiration' },
  'popup.newInspiration.meta': { zh: '无需选区', en: 'No selection needed' },
  'popup.openLibrary': { zh: '打开碎片库', en: 'Open Fragment library' },
  'popup.openScreenshots': { zh: '打开截图集', en: 'Open screenshots' },
  'popup.libraryCount.one': { zh: '{count} 条', en: '{count} Fragment' },
  'popup.libraryCount.other': { zh: '{count} 条', en: '{count} Fragments' },
  'popup.screenshotCount.one': { zh: '{count} 张', en: '{count} screenshot' },
  'popup.screenshotCount.other': { zh: '{count} 张', en: '{count} screenshots' },
  'popup.unpaired': { zh: 'Desktop：{label}', en: 'Desktop: {label}' },
  'popup.dueReviews.one': { zh: 'Desktop 上有 {count} 条到期复习', en: '{count} review due on Desktop' },
  'popup.dueReviews.other': { zh: 'Desktop 上有 {count} 条到期复习', en: '{count} reviews due on Desktop' },
  'popup.estimate': { zh: '预计 {minutes} 分钟', en: 'about {minutes} min' },
  'popup.dataSource': { zh: '数据来自最近一次回传（{time}）', en: 'from the last sync ({time})' },
  'popup.openDesktop': { zh: '打开 Desktop', en: 'Open Desktop' },
  'popup.hint': { zh: '选中网页文字即可保存 / {shortcut} 截图', en: 'Select text on a page to save it / {shortcut} for a screenshot' },
})
