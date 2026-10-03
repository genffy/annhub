import { describe, expect, it } from 'vitest'
import {
  TASK_TEMPLATES,
  createWritingTask,
  appendSubmission,
  recommendForTask,
  localPresenceAssessments,
  confirmAssessments,
  feedbackCompleteness,
  questionDraftFromFeedback,
  weeklyAppliedCounts,
  isoWeekStart,
  appliedFragmentIds,
  daysToFirstApplication,
} from '../output'
import { makeFragment, NOW } from './helpers'

const fragments = [
  makeFragment({ id: 'f1', content: 'hawkish pivot', tags: ['fed'] }),
  makeFragment({ id: 'f2', content: '量化宽松', tags: ['fed'], createdAt: NOW - 30 * 86_400_000, updatedAt: NOW }),
  makeFragment({ id: 'f3', content: '供应链压力', tags: ['macro'] }),
]

describe('task templates + creation (desktop.md §6.2)', () => {
  it('covers all six task types with prompts and constraints', () => {
    for (const type of ['explanation', 'analysis', 'plan', 'decision', 'retrospective', 'article'] as const) {
      expect(TASK_TEMPLATES[type].prompt, type).toContain('{topic}')
      expect(TASK_TEMPLATES[type].constraints.length).toBeGreaterThan(0)
    }
  })

  it('createWritingTask interpolates the topic and starts empty', () => {
    const task = createWritingTask({ taskType: 'explanation', topic: '利率传导', fragmentIds: ['f1'], now: NOW })
    expect(task.prompt).toContain('利率传导')
    expect(task.draftContent).toBe('')
    expect(task.submissions).toEqual([])
  })
})

describe('submissions + feedback layering (storage.md §3.2)', () => {
  it('appends immutable submissions; drafts reset', () => {
    let task = createWritingTask({ taskType: 'article', topic: 'x', fragmentIds: ['f1', 'f2'], now: NOW })
    task = { ...task, draftContent: '草稿' }
    task = appendSubmission(task, '第一版正文', NOW + 1000)
    task = { ...task, draftContent: '第二版草稿' }
    task = appendSubmission(task, '第二版正文', NOW + 2000)
    expect(task.submissions.map(s => s.content)).toEqual(['第一版正文', '第二版正文'])
    expect(task.draftContent).toBe('')
  })

  it('local presence records clues only — never used/correct', () => {
    let task = createWritingTask({ taskType: 'analysis', topic: 'x', fragmentIds: ['f1', 'f3'], now: NOW })
    task = appendSubmission(task, '文中提到了 hawkish pivot 的转向。', NOW + 100)
    const assessments = localPresenceAssessments(task, fragments)
    const f1 = assessments.find(a => a.fragmentId === 'f1')!
    const f3 = assessments.find(a => a.fragmentId === 'f3')!
    expect(f1.source).toBe('local')
    expect(f1.presence).toBe(true)
    expect(f1.used).toBeUndefined()
    expect(f1.correct).toBeUndefined()
    expect(f3.presence).toBe(false)
  })

  it('feedback completeness derives pending -> partial -> complete', () => {
    let task = createWritingTask({ taskType: 'plan', topic: 'x', fragmentIds: ['f1', 'f2'], now: NOW })
    expect(feedbackCompleteness(task)).toBe('pending')
    task = appendSubmission(task, '正文', NOW + 100)
    expect(feedbackCompleteness(task)).toBe('pending')
    task = confirmAssessments(task, [{ fragmentId: 'f1', used: true, correct: true }], NOW + 200)
    expect(feedbackCompleteness(task)).toBe('partial')
    task = confirmAssessments(task, [{ fragmentId: 'f2', used: false }], NOW + 300)
    expect(feedbackCompleteness(task)).toBe('complete')
  })
})

describe('reverse recommendation (desktop.md §6.1)', () => {
  it('searches by task text and ranks with visible reasons', () => {
    const applied = new Set(['f1'])
    const results = recommendForTask('hawkish 量化宽松', fragments, { appliedFragmentIds: applied, now: NOW })
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]!.reason).toContain('命中任务主题')
    // never-applied f2 outranks already-applied f1 when both hit
    const ids = results.map(r => r.fragment.id)
    if (ids.includes('f1') && ids.includes('f2')) expect(ids.indexOf('f2')).toBeLessThan(ids.indexOf('f1'))
  })
})

describe('question bridge + applied metrics (R2.1/R2.3)', () => {
  it('incorrectly-applied fragments outrank correctly-applied ones (R2.3)', () => {
    const pool = [makeFragment({ id: 'g1', tags: ['fed'] }), makeFragment({ id: 'g2', tags: ['fed'] })]
    const results = recommendForTask('fed', pool, {
      appliedFragmentIds: new Set(['g1', 'g2']),
      incorrectFragmentIds: new Set(['g2']),
      now: NOW,
    })
    const ids = results.map(r => r.fragment.id)
    expect(ids).toEqual(['g2', 'g1'])
    expect(results.find(r => r.fragment.id === 'g2')!.reason).toContain('此前用错')
  })

  it('questionDraftFromFeedback uses the writing-task source', () => {
    let task = createWritingTask({ taskType: 'retrospective', topic: 'x', fragmentIds: ['f1'], now: NOW })
    task = appendSubmission(task, '正文', NOW + 100)
    const draft = questionDraftFromFeedback(task, fragments[0]!, '边界条件没说清', NOW + 200)
    expect(draft.kind).toBe('question')
    expect(draft.sourceUrl).toBe(`annhub://writing-task/${task.id}`)
    expect(draft.detail.status).toBe('open')
    expect(draft.excerpt.startsWith(draft.content)).toBe(true)
  })

  it('weeklyAppliedCounts needs correct=true and the same ISO week; applied ids/days count any used', () => {
    let task = createWritingTask({ taskType: 'article', topic: 'x', fragmentIds: ['f1', 'f2'], now: NOW })
    // Submit seconds after capture: guaranteed to sit in NOW's ISO week.
    task = appendSubmission(task, '正文', NOW + 60_000)
    task = confirmAssessments(task, [
      { fragmentId: 'f1', used: true, correct: true },
      { fragmentId: 'f2', used: false },
    ], NOW + 60_100)
    expect(weeklyAppliedCounts([task], NOW + 60_200).get('f1')).toBe(1)

    // metrics.md §4 排除：correct 未知或 false 即使 used=true 也不计
    let unknown = createWritingTask({ taskType: 'article', topic: 'x', fragmentIds: ['f1'], now: NOW })
    unknown = appendSubmission(unknown, '正文', NOW + 60_000)
    unknown = confirmAssessments(unknown, [{ fragmentId: 'f1', used: true }], NOW + 60_100)
    expect(weeklyAppliedCounts([unknown], NOW + 60_200).size).toBe(0)

    // 跨 ISO 周（提交早于本周周一）不计
    const lastWeek = isoWeekStart(NOW) - 86_400_000
    let stale = createWritingTask({ taskType: 'article', topic: 'x', fragmentIds: ['f1'], now: lastWeek - 60_000 })
    stale = appendSubmission(stale, '正文', lastWeek)
    stale = confirmAssessments(stale, [{ fragmentId: 'f1', used: true, correct: true }], lastWeek + 100)
    expect(weeklyAppliedCounts([stale], NOW).size).toBe(0)

    expect(appliedFragmentIds([task])).toEqual(new Set(['f1']))
    expect(daysToFirstApplication(fragments[0]!, [task])).toBe(0)
    expect(daysToFirstApplication(fragments[2]!, [task])).toBeNull()
  })
})
