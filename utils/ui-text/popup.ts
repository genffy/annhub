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
  'popup.hint': { zh: '选中网页文字即可保存 / {shortcut} 截图', en: 'Select text on a page to save it / {shortcut} for a screenshot' },
})
