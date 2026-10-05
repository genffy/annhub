import { defineMessages } from './define'

/** Screenshot overlay, annotation toolbar and the background save errors (extension.md §6; screenshot.md). */
export const screenshot = defineMessages({
  'shot.hint': { zh: '拖拽=区域截图 · 单击=元素截图 · Esc 取消 · ', en: 'Drag = area · Click = element · Esc to cancel · ' },
  'shot.anonymize': { zh: ' 匿名：{state}', en: ' Anonymize: {state}' },
  'shot.on': { zh: '开', en: 'on' },
  'shot.off': { zh: '关', en: 'off' },
  'shot.anonymizePlaceholder': { zh: '匿名', en: 'Anonymous' },
  'shot.textInput.label': { zh: '截图文字', en: 'Screenshot text' },
  'shot.textInput.placeholder': { zh: '输入文字', en: 'Enter text' },

  // Annotation toolbar
  'shot.toolbar': { zh: '截图标注', en: 'Screenshot annotation' },
  'shot.tool.rectangle': { zh: '矩形', en: 'Rectangle' },
  'shot.tool.ellipse': { zh: '椭圆', en: 'Ellipse' },
  'shot.tool.arrow': { zh: '箭头', en: 'Arrow' },
  'shot.tool.pen': { zh: '画笔', en: 'Pen' },
  'shot.tool.mosaic': { zh: '马赛克', en: 'Mosaic' },
  'shot.tool.text': { zh: '文字', en: 'Text' },
  'shot.colors': { zh: '标注颜色', en: 'Annotation color' },
  'shot.color.red': { zh: '红色', en: 'Red' },
  'shot.color.yellow': { zh: '黄色', en: 'Yellow' },
  'shot.color.teal': { zh: '青色', en: 'Teal' },
  'shot.color.white': { zh: '白色', en: 'White' },
  'shot.color.black': { zh: '黑色', en: 'Black' },
  'shot.undo': { zh: '撤销', en: 'Undo' },
  'shot.download': { zh: '下载 PNG', en: 'Download PNG' },
  'shot.cancel': { zh: '取消截图', en: 'Cancel screenshot' },
  'shot.save': { zh: '保存到截图集', en: 'Save to screenshot library' },
  'shot.masks': { zh: '自动建议的马赛克区域', en: 'Suggested mosaic areas' },
  'shot.mask': { zh: '马赛克 {index}', en: 'Mosaic {index}' },
  'shot.mask.remove': { zh: '移除马赛克 {index}', en: 'Remove mosaic {index}' },

  // Notices and errors
  'shot.downloaded': { zh: 'PNG 已下载', en: 'PNG downloaded' },
  'shot.failed': { zh: '截图失败：{message}', en: 'Screenshot failed: {message}' },
  'shot.error.capture': { zh: '截图失败', en: 'Screenshot failed' },
  'shot.error.notVisible': {
    zh: '这个标签页已不在屏幕上，没有截图（切换了标签页？）',
    en: 'This tab is no longer the one on screen, so nothing was captured (did you switch tabs?)',
  },
  'shot.error.crop': { zh: '截图裁剪失败', en: 'Cropping the screenshot failed' },
  'shot.error.element': { zh: '元素截图失败', en: 'Capturing the element failed' },
  'shot.error.decode': { zh: '截图数据解码失败', en: 'Could not decode the screenshot data' },
  'shot.error.emptySelection': { zh: '选区为空或完全在屏幕外', en: 'The selection is empty or entirely off screen' },
  'shot.error.edit': { zh: '无法编辑截图', en: 'Cannot edit the screenshot' },
  'shot.error.saveFailed': { zh: '保存失败', en: 'Save failed' },
  'shot.error.downloadFailed': { zh: '下载失败', en: 'Download failed' },
  'shot.error.action': { zh: '截图操作失败', en: 'The screenshot action failed' },
  'shot.error.noAction': { zh: '未选择截图操作', en: 'No screenshot action selected' },
  'shot.error.noData': { zh: '缺少图片数据', en: 'Image data is missing' },
  'shot.error.tooLarge': { zh: '图片超过 {limit}MB 上限（当前 {size}MB）', en: 'The image exceeds the {limit} MB limit (now {size} MB)' },
  'shot.error.quota': {
    zh: '浏览器存储空间不足：截图未入库，可单独下载或清理旧截图后重试',
    en: 'Browser storage is full: the screenshot was not saved. Download it on its own, or delete old screenshots and retry',
  },
})
