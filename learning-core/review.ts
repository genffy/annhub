/**
 * Review-session contract (review.md §4/§5 + desktop.md §5).
 *
 * Review runs on the Desktop; the Extension never implements this. This
 * module is the shared question/hint contract: R1 gives every enabled kind
 * exactly one self-eval question, answers are user-judged (no automatic
 * long-text grading), and hint usage is recorded in ReviewLog.usedHint.
 */
import type { FragmentKind, FragmentRecord } from './types'

export interface ReviewQuestionSpec {
  kind: FragmentKind
  /** Default question shown on the card (desktop.md §5.2). */
  question: string
  /** Hint ladder, coarse -> fine; using ANY hint sets usedHint (review.md §4 + desktop.md §5.3). */
  hints: [string, string, string, string]
}

export const REVIEW_QUESTIONS: Record<FragmentKind, ReviewQuestionSpec> = {
  'excerpt': {
    kind: 'excerpt',
    question: '这段材料的核心观点是什么？为什么值得保留？',
    hints: ['来源与出处', '前后文语境', '原文本身', '核验确认'],
  },
  'concept': {
    kind: 'concept',
    question: '用自己的话解释它，并给出一个适用边界。',
    hints: ['关键词', '上下文', '定义与示例', '核验摘要'],
  },
  'claim': {
    kind: 'claim',
    question: '这个主张依赖哪些前提和证据？',
    hints: ['主题', '证据片段', '原文', '核验确认'],
  },
  'procedure': {
    kind: 'procedure',
    question: '从目标出发重建关键步骤和失败条件。',
    hints: ['步骤数', '首步', '完整流程', '核验确认'],
  },
  'decision': {
    kind: 'decision',
    question: '当时有哪些约束，为什么没有选其他方案？',
    hints: ['结论', '约束', '理由', '核验确认'],
  },
  'question': {
    kind: 'question',
    question: '当前假设、证据和下一步验证分别是什么？',
    hints: ['主题', '最近证据', '当前结论', '核验确认'],
  },
  'visual': {
    kind: 'visual',
    question: '这张图的关键细节、结构或意图是什么？',
    hints: ['结构关键词', '文字描述', '原图', '核验确认'],
  },
  'inspiration': {
    kind: 'inspiration',
    question: '当时由什么触发这个想法？现在还认可什么？',
    hints: ['触发背景', '原记录', '后续修订', '核验确认'],
  },
  'media-clip': {
    kind: 'media-clip',
    question: '回忆这段媒体材料的要点与时间定位。',
    hints: ['主题', '要点', '原片段', '核验确认'],
  },
}

/** Daily suggestion cap defaults (review.md §5). */
export const DAILY_LIMIT_DEFAULT = 20
export const DAILY_LIMIT_MIN = 5
export const DAILY_LIMIT_MAX = 50
/** Single-session cap: min(daily remaining, floor(600s / 45s)) = 13 (review.md §5). */
export const SESSION_SECONDS_PER_CARD = 45
export const SESSION_BUDGET_SECONDS = 600

export function sessionCap(dailyRemaining: number): number {
  return Math.min(dailyRemaining, Math.floor(SESSION_BUDGET_SECONDS / SESSION_SECONDS_PER_CARD))
}

/**
 * Daily queue ordering: nextReviewAt asc, lapses desc, createdAt asc, id asc
 * (review.md §5) — stable across ends and restarts.
 */
export function dailyQueueOrder(a: FragmentRecord, b: FragmentRecord): number {
  return a.review.nextReviewAt - b.review.nextReviewAt || b.review.lapses - a.review.lapses || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

export function buildDailyQueue(fragments: FragmentRecord[], now: number, dailyLimit = DAILY_LIMIT_DEFAULT): FragmentRecord[] {
  return fragments
    .filter(f => f.review.nextReviewAt <= now)
    .sort(dailyQueueOrder)
    .slice(0, dailyLimit)
}

/** Persisted review session (desktop.md §5.4): order + cursor survive restarts. */
export interface ReviewSessionState {
  sessionId: string
  fragmentIds: string[]
  cursor: number
  startedAt: number
  /** Skipped entries with a reason, e.g. fragment deleted mid-session. */
  skipped: Array<{ fragmentId: string; reason: string }>
}
