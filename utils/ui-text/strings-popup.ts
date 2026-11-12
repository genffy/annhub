/** The recording section of the settings page, recording-time annotation, the toolbar popup and the in-page overlays (extension.md §2.5-2.6, annotate.md §3).
 *  Moved verbatim from ui-text.ts when the string table went over its byte budget. */
export const popupStrings = {
  // the popup's own empty states and the link into the library (RV-LIB-22)
  'library.openLibrary': { zh: '在资料库中打开', en: 'Open in library' },
  'library.empty': { zh: '还没有条目：选中网页文字即可保存', en: 'Nothing yet — select text on a page to save it' },
  'library.empty.highlights': { zh: '还没有高亮：打开一条剪藏的阅读视图，选中文字即可。', en: 'No highlights yet — open a clip and select text in the reading view.' },
  // settings: recording section (extension.md §2.5, annotate.md §2.1)
  // recording-time annotation and cursor highlight (annotate.md §3)
  'popup.recording.keys': {
    zh: '批注单键：P 画笔 · H 荧光笔 · L 直线 · A 箭头 · R 矩形 · O 椭圆 · T 文字 · N 序号 · V 指针 · 1–5 颜色 · [ ] 线宽 · Z 撤销 · E 清空 · Esc 退出批注',
    en: 'Annotation keys: P pen · H highlighter · L line · A arrow · R rectangle · O ellipse · T text · N step · V pointer · 1–5 colour · [ ] width · Z undo · E clear · Esc exit',
  },
  // toolbar popup footer (extension.md §2.6)
  'popup.recent': { zh: '最近 5 条', en: 'Recent 5' },
  'popup.annotate': { zh: '在页面上批注', en: 'Annotate page' },
  'popup.annotate.restricted': { zh: '此类页面不能批注', en: 'This kind of page cannot be annotated' },
  'popup.download': { zh: '下载本页正文', en: 'Download this page' },
  'popup.download.restricted': { zh: '此页面不能下载', en: 'This page cannot be downloaded' },
  'popup.record': { zh: '录制此标签页', en: 'Record tab' },
  'popup.record.restricted': { zh: '此类页面不能录制', en: 'This kind of page cannot be recorded' },
  'popup.recording.withMic': { zh: '带麦克风', en: 'With microphone' },
  'popup.recording.headphones': {
    zh: '带麦克风录制时建议戴耳机：扬声器里的页面声音会被麦克风收进视频',
    en: "Headphones are recommended with the microphone: the speakers' page sound would be picked up",
  },
  'popup.recording.stop': { zh: '停止录制', en: 'Stop recording' },
  // popup states (WS-1): the recording block stacks one line per piece of information, and restricted
  // pages say why above the entries instead of only in their titles
  'popup.recording.status': { zh: '正在录制 · {time}', en: 'Recording · {time}' },
  'popup.restricted.reason': { zh: '此页面不允许批注或录制。', en: 'This page does not allow annotating or recording.' },
  'popup.restricted.foot': { zh: '此页不能保存；去资料库读已存的内容。', en: 'Nothing can be saved here; read what you kept in the library.' },
  'popup.recording.mic.denied': { zh: '麦克风未允许，只录了画面与标签页的声音', en: 'Microphone not allowed — recorded the picture and the tab sound only' },
  'popup.recording.mic.missing': { zh: '没有可用的麦克风，只录了画面与标签页的声音', en: 'No microphone available — recorded the picture and the tab sound only' },
  'popup.recording.failed': { zh: '没有开始录制，请换一个页面或稍后再试', en: 'Recording did not start — try another page or again in a moment' },
  'popup.recording.mic.busy': { zh: '麦克风被占用，只录了画面与标签页的声音', en: 'Microphone busy — recorded the picture and the tab sound only' },
  'popup.recording.downloadFailed': { zh: '视频下载失败，已保留在内存里', en: 'The download failed; the video is kept in memory' },
  'popup.recording.downloadAgain': { zh: '重新下载', en: 'Download again' },
  'popup.recording.discard': { zh: '放弃', en: 'Discard' },
  'popup.recording.limitTime': { zh: '已到 15 分钟，已保存', en: 'Reached 15 minutes — saved' },
  'popup.recording.limitSize': { zh: '已到约 500 MB，已保存', en: 'Reached about 500 MB — saved' },
} as const
