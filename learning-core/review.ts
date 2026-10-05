/**
 * Review-session contract (review.md §4/§5 + desktop.md §5).
 *
 * Review runs on the Desktop; the Extension never implements this. This
 * module is the shared question/hint contract: R1 gives every enabled kind
 * exactly one self-eval question, answers are user-judged (no automatic
 * long-text grading), and hint usage is recorded in ReviewLog.usedHint.
 */
import type { FragmentKind, FragmentRecord } from './types'

/** The two interface languages (D-15); Chinese is the source of the wording (kinds.md §4), English its translation. */
export type ReviewLanguage = 'zh' | 'en'

export interface ReviewQuestionSpec {
  kind: FragmentKind
  /** Default question shown on the card (desktop.md §5.2). */
  question: string
  /** Hint ladder, coarse -> fine; using ANY hint sets usedHint (review.md §4 + desktop.md §5.3). */
  hints: [string, string, string, string]
}

type Wording = Omit<ReviewQuestionSpec, 'kind'>

/**
 * Per-kind question and hint ladder in both languages. The Swift side carries the same text; the
 * checked-in fixture `review-questions.json` is generated from this table and read by the Swift tests.
 */
export const REVIEW_QUESTIONS: Record<FragmentKind, Record<ReviewLanguage, ReviewQuestionSpec>> = Object.fromEntries(
  Object.entries({
    'excerpt': {
      zh: { question: '这段材料的核心观点是什么？为什么值得保留？', hints: ['来源与出处', '前后文语境', '原文本身', '核验确认'] },
      en: {
        question: 'What is the core point of this passage? Why is it worth keeping?',
        hints: ['Source and origin', 'Surrounding context', 'The original text itself', 'Verification status'],
      },
    },
    'concept': {
      zh: { question: '用自己的话解释它，并给出一个适用边界。', hints: ['关键词', '上下文', '定义与示例', '核验摘要'] },
      en: { question: 'Explain it in your own words and give one boundary where it applies.', hints: ['Keywords', 'Context', 'Definition and examples', 'Verification summary'] },
    },
    'claim': {
      zh: { question: '这个主张依赖哪些前提和证据？', hints: ['主题', '证据片段', '原文', '核验确认'] },
      en: { question: 'Which premises and evidence does this claim rest on?', hints: ['Topic', 'Evidence excerpt', 'Original text', 'Verification status'] },
    },
    'procedure': {
      zh: { question: '从目标出发重建关键步骤和失败条件。', hints: ['步骤数', '首步', '完整流程', '核验确认'] },
      en: {
        question: 'Rebuild the key steps and the failure conditions, starting from the goal.',
        hints: ['Number of steps', 'First step', 'The full procedure', 'Verification status'],
      },
    },
    'decision': {
      zh: { question: '当时有哪些约束，为什么没有选其他方案？', hints: ['结论', '约束', '理由', '核验确认'] },
      en: { question: 'What constraints applied then, and why were the other options not chosen?', hints: ['Conclusion', 'Constraints', 'Rationale', 'Verification status'] },
    },
    'question': {
      zh: { question: '当前假设、证据和下一步验证分别是什么？', hints: ['主题', '最近证据', '当前结论', '核验确认'] },
      en: {
        question: 'What are the current hypothesis, the evidence and the next verification?',
        hints: ['Topic', 'Latest evidence', 'Current conclusion', 'Verification status'],
      },
    },
    'visual': {
      zh: { question: '这张图的关键细节、结构或意图是什么？', hints: ['结构关键词', '文字描述', '原图', '核验确认'] },
      en: { question: 'What are the key details, structure or intent of this image?', hints: ['Structure keywords', 'Text description', 'Original image', 'Verification status'] },
    },
    'inspiration': {
      zh: { question: '当时由什么触发这个想法？现在还认可什么？', hints: ['触发背景', '原记录', '后续修订', '核验确认'] },
      en: {
        question: 'What triggered this idea back then? What do you still agree with now?',
        hints: ['Trigger background', 'Original note', 'Later revisions', 'Verification status'],
      },
    },
    'media-clip': {
      zh: { question: '回忆这段媒体材料的要点与时间定位。', hints: ['主题', '要点', '原片段', '核验确认'] },
      en: { question: 'Recall the key points of this media passage and where it sits in time.', hints: ['Topic', 'Key points', 'Original clip', 'Verification status'] },
    },
  } satisfies Record<FragmentKind, Record<ReviewLanguage, Wording>>).map(([kind, languages]) => [
    kind,
    Object.fromEntries(Object.entries(languages).map(([lang, wording]) => [lang, { kind, ...wording }])),
  ]),
) as Record<FragmentKind, Record<ReviewLanguage, ReviewQuestionSpec>>

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
