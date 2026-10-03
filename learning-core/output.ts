/**
 * Output workshop domain (L4) — docs/v2/output.md + storage.md §3.2 +
 * desktop.md §6. Runs on the Desktop; mirrored by Swift. Pure functions
 * only: templates, task creation, reverse recommendation from a real task,
 * local presence clues, feedback completeness and the question-draft bridge
 * back into the capture pipeline.
 */
import type { FragmentRecord, WritingTaskRecord, WritingTaskType, OutputSubmission, FragmentUseAssessment } from './types'
import { newId } from './factory'
import { runFragmentQuery } from './query'

/** Task templates (desktop.md §6.2). Users can always edit prompt/constraints. */
export const TASK_TEMPLATES: Record<WritingTaskType, { label: string; prompt: string; constraints: string[];fits: string }> = {
  explanation: {
    label: '解释',
    prompt: '向指定读者解释一个问题：{topic}',
    constraints: ['先给结论', '用一个例子支撑'],
    fits: 'concept、procedure',
  },
  analysis: {
    label: '分析',
    prompt: '比较观点、证据与反例：{topic}',
    constraints: ['呈现至少两种立场', '指出证据的局限'],
    fits: 'claim、concept',
  },
  plan: {
    label: '计划',
    prompt: '把方法转成可执行计划：{topic}',
    constraints: ['步骤可验证', '写出失败条件'],
    fits: 'procedure、decision',
  },
  decision: {
    label: '决策',
    prompt: '基于约束和证据做选择：{topic}',
    constraints: ['列备选与取舍', '定义验证信号'],
    fits: 'claim、decision、question',
  },
  retrospective: {
    label: '复盘',
    prompt: '用过去决定和证据复盘结果：{topic}',
    constraints: ['对照当时的预期', '提炼可复用教训'],
    fits: 'decision、question',
  },
  article: {
    label: '文章',
    prompt: '围绕主题形成完整论述：{topic}',
    constraints: ['有明确论点', '引用至少两个碎片'],
    fits: '任意文本碎片，包括灵感',
  },
}

export interface CreateWritingTaskInput {
  taskType: WritingTaskType
  topic: string
  fragmentIds: string[]
  prompt?: string
  constraints?: string[]
  now?: number
}

export function createWritingTask(input: CreateWritingTaskInput): WritingTaskRecord {
  const now = input.now ?? Date.now()
  const template = TASK_TEMPLATES[input.taskType]
  return {
    id: newId(),
    fragmentIds: input.fragmentIds,
    taskType: input.taskType,
    prompt: (input.prompt ?? template.prompt).split('{topic}').join(input.topic),
    constraints: input.constraints ?? template.constraints,
    draftContent: '',
    submissions: [],
    createdAt: now,
    updatedAt: now,
  }
}

export interface RecommendContext {
  /** Confirmed relations boost co-located fragments (R2.2 -> output selection). */
  relatedTo?: (fragmentId: string) => string[]
  /** Fragments with user-confirmed used=true in past submissions. */
  appliedFragmentIds?: Set<string>
  /** Fragments the user marked used-but-incorrect — they get a bigger boost (R2.3). */
  incorrectFragmentIds?: Set<string>
  now?: number
}

/**
 * Reverse recommendation (desktop.md §6.1 entry 3): the user's real task text
 * is the query; candidates come from the shared search contract, then rank by
 * review need / never-applied / confirmed relations (R2.3).
 */
export function recommendForTask(taskText: string, fragments: FragmentRecord[], options: { limit?: number } & RecommendContext = {}): Array<{ fragment: FragmentRecord; reason: string }> {
  const now = options.now ?? Date.now()
  const result = runFragmentQuery(fragments, { search: taskText, limit: 200 })
  const scored = result.items.map(fragment => {
    let score = 0
    const reasons: string[] = ['命中任务主题']
    if (fragment.review.nextReviewAt <= now) {
      score += 8
      reasons.push('已到期')
    }
    if (fragment.review.lapses > 0 || fragment.review.state === 'relearning') {
      score += 4
      reasons.push('近期遗忘')
    }
    if (options.incorrectFragmentIds?.has(fragment.id)) {
      score += 4
      reasons.push('此前用错，优先再练')
    } else if (!options.appliedFragmentIds?.has(fragment.id)) {
      score += 2
      reasons.push('从未应用')
    }
    // 近期新增但已完成首次复习 (output.md §2 #3)
    if (fragment.createdAt >= now - 7 * 86_400_000 && fragment.review.repetitions > 0) score += 1
    const related = options.relatedTo?.(fragment.id) ?? []
    if (related.length) {
      score += Math.min(related.length, 3)
      reasons.push(`与已选碎片存在 ${Math.min(related.length, 3)} 条确认关系`)
    }
    return { fragment, score, reasons }
  })
  return scored
    .sort((a, b) => b.score - a.score || b.fragment.createdAt - a.fragment.createdAt || (a.fragment.id < b.fragment.id ? -1 : 1))
    .slice(0, options.limit ?? 8)
    .map(({ fragment, reasons }) => ({ fragment, reason: reasons.join('；') }))
}

/** Appends an immutable submission (storage.md §3.2). Draft stays separate. */
export function appendSubmission(task: WritingTaskRecord, content: string, now = Date.now()): WritingTaskRecord {
  const submission: OutputSubmission = { id: newId(), content, submittedAt: now, assessments: [] }
  return { ...task, submissions: [...task.submissions, submission], draftContent: '', updatedAt: now }
}

/** First local feedback layer: text-presence clues only, never used/correct (output.md). */
export function localPresenceAssessments(task: WritingTaskRecord, fragments: FragmentRecord[]): FragmentUseAssessment[] {
  const last = task.submissions[task.submissions.length - 1]
  if (!last) return []
  return fragments
    .filter(f => task.fragmentIds.includes(f.id))
    .map(f => ({
      fragmentId: f.id,
      source: 'local' as const,
      presence: task.fragmentIds.length === 0 ? false : normalizeHaystack(last.content).includes(normalizeNeedle(f.content)),
      assessedAt: last.submittedAt,
    }))
}

function normalizeHaystack(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}

function normalizeNeedle(content: string): string {
  // Long contents rarely re-appear verbatim; match a distinctive head.
  const head = content.replace(/\s+/g, ' ').trim().toLowerCase()
  return head.length > 40 ? head.slice(0, 40) : head
}

/** Merges user confirmations into the latest submission's assessments. */
export function confirmAssessments(
  task: WritingTaskRecord,
  confirmations: Array<{ fragmentId: string; used?: boolean; correct?: boolean; feedback?: string }>,
  now = Date.now(),
): WritingTaskRecord {
  if (task.submissions.length === 0) return task
  const submissions = task.submissions.slice()
  const last = submissions[submissions.length - 1]!
  const byId = new Map(last.assessments.map(a => [a.fragmentId, a]))
  for (const c of confirmations) {
    if (!task.fragmentIds.includes(c.fragmentId)) continue
    const existing = byId.get(c.fragmentId)
    byId.set(c.fragmentId, {
      fragmentId: c.fragmentId,
      source: 'manual',
      presence: existing?.presence,
      used: c.used,
      correct: c.correct,
      feedback: c.feedback ?? existing?.feedback,
      confirmedByUser: true,
      assessedAt: now,
    })
  }
  submissions[submissions.length - 1] = { ...last, assessments: [...byId.values()] }
  return { ...task, submissions, updatedAt: now }
}

export type FeedbackCompleteness = 'pending' | 'partial' | 'complete'

/** Derived per task — never stored as a second boolean (storage.md §3.2). */
export function feedbackCompleteness(task: WritingTaskRecord): FeedbackCompleteness {
  if (task.submissions.length === 0) return 'pending'
  const last = task.submissions[task.submissions.length - 1]!
  const confirmed = task.fragmentIds.filter(id => last.assessments.some(a => a.fragmentId === id && a.confirmedByUser))
  if (confirmed.length === 0) return 'pending'
  return confirmed.length === task.fragmentIds.length ? 'complete' : 'partial'
}

export interface TaskStatus {
  completed: boolean
  completeness: FeedbackCompleteness
  submissionCount: number
  draftWords: number
}

export function taskStatus(task: WritingTaskRecord): TaskStatus {
  return {
    completed: task.submissions.length > 0,
    completeness: feedbackCompleteness(task),
    submissionCount: task.submissions.length,
    draftWords: task.draftContent.trim() ? task.draftContent.trim().split(/\s+/).length : 0,
  }
}

/** From feedback, one click creates a question Fragment (R2.1, fragments.md §7). */
export function questionDraftFromFeedback(
  task: WritingTaskRecord,
  fragment: FragmentRecord,
  feedback: string,
  now = Date.now(),
): {
  kind: 'question'
  content: string
  excerpt: string
  sourceUrl: string
  sourceTitle?: string
  processing: { verified: { confirmedAt: number; source: 'manual' } ; use: string }
  detail: { status: 'open'; hypothesis: string }
} {
  const content = `${fragment.content} 的这个疑问还需要验证：${feedback}`.slice(0, 500)
  return {
    kind: 'question',
    content,
    excerpt: `${content}\n来源：输出任务「${TASK_TEMPLATES[task.taskType].label}」（${task.prompt}）中对「${fragment.content}」的反馈。`,
    sourceUrl: `annhub://writing-task/${task.id}`,
    sourceTitle: task.prompt.slice(0, 300),
    processing: {
      verified: { confirmedAt: now, source: 'manual' },
      use: '在下次输出同主题任务前先回答这个问题。',
    },
    detail: { status: 'open', hypothesis: feedback },
  }
}

/** ISO-week start (Monday 00:00) in the local timezone — metrics.md §4. */
export function isoWeekStart(now: number = Date.now()): number {
  const d = new Date(now)
  const weekday = (d.getDay() + 6) % 7 // Monday = 0
  d.setDate(d.getDate() - weekday)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Weekly Applied Fragments (metrics.md §4): deduped fragments with a
 * user-confirmed used=true AND correct=true submission inside the current
 * ISO week. Correct-unknown or correct=false never counts.
 */
export function weeklyAppliedCounts(tasks: WritingTaskRecord[], now = Date.now()): Map<string, number> {
  const weekStart = isoWeekStart(now)
  const counts = new Map<string, number>()
  for (const task of tasks) {
    for (const submission of task.submissions) {
      if (submission.submittedAt < weekStart || submission.submittedAt > now) continue
      for (const assessment of submission.assessments) {
        if (assessment.used && assessment.confirmedByUser && assessment.correct === true) {
          counts.set(assessment.fragmentId, (counts.get(assessment.fragmentId) ?? 0) + 1)
        }
      }
    }
  }
  return counts
}

/** Fragments with user-confirmed used=true — the 已应用 derived state (fragments.md §9). */
export function appliedFragmentIds(tasks: WritingTaskRecord[]): Set<string> {
  const applied = new Set<string>()
  for (const task of tasks) {
    for (const submission of task.submissions) {
      for (const assessment of submission.assessments) {
        if (assessment.used && assessment.confirmedByUser) applied.add(assessment.fragmentId)
      }
    }
  }
  return applied
}

/** Days from capture to first confirmed application (R2.3); null when never applied. */
export function daysToFirstApplication(fragment: FragmentRecord, tasks: WritingTaskRecord[]): number | null {
  let first: number | null = null
  for (const task of tasks) {
    for (const submission of task.submissions) {
      for (const assessment of submission.assessments) {
        if (assessment.fragmentId === fragment.id && assessment.used && assessment.confirmedByUser) {
          if (first === null || submission.submittedAt < first) first = submission.submittedAt
        }
      }
    }
  }
  return first === null ? null : Math.max(0, Math.round((first - fragment.createdAt) / 86_400_000))
}
