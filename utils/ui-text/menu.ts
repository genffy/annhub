import { defineMessages } from './define'

/** Selection menu and the clip toast (extension.md §2.1, §3.3). */
export const menu = defineMessages({
  // Selection menu (extension.md §2.1)
  'menu.fragment': { zh: '碎片', en: 'Fragment' },
  'menu.highlight': { zh: '高亮', en: 'Highlight' },
  'menu.clip': { zh: '剪藏', en: 'Clip' },
  'menu.screenshot': { zh: '截图', en: 'Screenshot' },
  'menu.mediaClip': { zh: '媒体片段', en: 'Media clip' },
  // Consequence hint shown after hovering / focusing an action: what it does and how long it takes
  'menu.fragment.hint': { zh: '理解并应用 · 约 30–90 秒', en: 'Understand and apply · about 30–90 s' },
  'menu.highlight.hint': { zh: '只在页面留痕，可加备注', en: 'Marks the page, optional note' },
  'menu.clip.hint': { zh: '保存原文和语境，之后查阅', en: 'Saves text and context for later' },
  'menu.screenshot.hint': { zh: '框选区域或单击元素 · 先进入截图集', en: 'Select an area or click an element · goes to the screenshot library first' },
  'menu.mediaClip.hint': { zh: '标记起止时间，手工转写 · 保存为 media-clip', en: 'Mark start and end, transcribe by hand · saved as a media-clip' },
  'menu.notePlaceholder': { zh: '备注...', en: 'Note...' },
  // Continuous highlight capsule (extension PRD §9)
  'capsule.capturing': { zh: '采集中...', en: 'Capturing…' },
  'capsule.exit': { zh: '退出 (Esc)', en: 'Exit (Esc)' },
  // Clip toast (extension.md §3.3)
  'clip.saved': { zh: '已剪藏', en: 'Clipped' },
  'clip.undo': { zh: '撤销', en: 'Undo' },
  'clip.undone': { zh: '已撤销，这条剪藏已删除', en: 'Undone — the clip was deleted' },
  'clip.undoFailed': { zh: '撤销失败，可在碎片库的剪藏列表中删除', en: 'Undo failed — delete it from the clip list in the library' },
  'clip.failed': { zh: '剪藏失败，请重试', en: 'Clip failed, please try again' },
})
