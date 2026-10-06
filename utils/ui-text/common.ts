import { defineMessages } from './define'

/** Wording shared across surfaces: kind names (kinds.md §4) and relative time. */
export const common = defineMessages({
  'kind.concept': { zh: '概念', en: 'Concept' },
  'kind.claim': { zh: '论点', en: 'Claim' },
  'kind.procedure': { zh: '方法', en: 'Procedure' },
  'kind.decision': { zh: '决策', en: 'Decision' },
  'kind.question': { zh: '问题', en: 'Question' },
  'kind.inspiration': { zh: '灵感', en: 'Inspiration' },
  'kind.visual': { zh: '视觉', en: 'Visual' },
  'kind.media-clip': { zh: '媒体片段', en: 'Media clip' },
  'kind.excerpt': { zh: '摘录', en: 'Excerpt' },

  'time.justNow': { zh: '刚刚', en: 'just now' },
  'time.minutesAgo': { zh: '{count} 分钟前', en: '{count} min ago' },
  'time.hoursAgo': { zh: '{count} 小时前', en: '{count} h ago' },
  'time.daysAgo.one': { zh: '{count} 天前', en: '{count} day ago' },
  'time.daysAgo.other': { zh: '{count} 天前', en: '{count} days ago' },

  'common.save': { zh: '保存', en: 'Save' },
  'common.cancel': { zh: '取消', en: 'Cancel' },
  'common.retry': { zh: '重试', en: 'Retry' },
  'common.close': { zh: '关闭', en: 'Close' },
  'common.delete': { zh: '删除', en: 'Delete' },
  'common.loading': { zh: '加载中…', en: 'Loading…' },
  'common.unknownError': { zh: '未知错误', en: 'Unknown error' },
})
