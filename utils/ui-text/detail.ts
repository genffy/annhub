import { defineMessages } from './define'

/** Per-kind detail fields of the capture form (extension PRD §4.4; fragments.md §4). */
export const detail = defineMessages({
  // Joins the lines of a multi-line field into one note line
  'detail.valueSeparator': { zh: '；', en: '; ' },

  // Field names, as they appear in the note of a 改存 and in the copied input
  'detail.field.note': { zh: '注释', en: 'Annotation' },
  'detail.field.definition': { zh: '定义', en: 'Definition' },
  'detail.field.boundaries': { zh: '适用边界', en: 'Boundaries' },
  'detail.field.examples': { zh: '示例', en: 'Examples' },
  'detail.field.counterExamples': { zh: '反例', en: 'Counterexamples' },
  'detail.field.stance': { zh: '立场', en: 'Stance' },
  'detail.field.evidence': { zh: '证据', en: 'Evidence' },
  'detail.field.assumptions': { zh: '前提', en: 'Assumptions' },
  'detail.field.steps': { zh: '步骤', en: 'Steps' },
  'detail.field.prerequisites': { zh: '适用条件', en: 'Preconditions' },
  'detail.field.failureModes': { zh: '失败模式', en: 'Failure modes' },
  'detail.field.rationale': { zh: '决策理由', en: 'Rationale' },
  'detail.field.alternatives': { zh: '备选项', en: 'Alternatives' },
  'detail.field.consequences': { zh: '后果', en: 'Consequences' },
  'detail.field.status': { zh: '状态', en: 'Status' },
  'detail.field.hypothesis': { zh: '当前假设', en: 'Current hypothesis' },
  'detail.field.nextStep': { zh: '下一步验证', en: 'Next verification' },
  'detail.field.answer': { zh: '结论', en: 'Conclusion' },
  'detail.field.form': { zh: '形式', en: 'Form' },

  // Option values
  'detail.stance.support': { zh: '支持', en: 'Support' },
  'detail.stance.oppose': { zh: '反对', en: 'Oppose' },
  'detail.stance.uncertain': { zh: '存疑', en: 'Uncertain' },
  'detail.status.open': { zh: '待验证', en: 'To verify' },
  'detail.status.testing': { zh: '验证中', en: 'Testing' },
  'detail.status.answered': { zh: '已回答', en: 'Answered' },
  'detail.form.idea': { zh: '想法', en: 'Idea' },
  'detail.form.reflection': { zh: '随感', en: 'Reflection' },
  'detail.choose': { zh: '请选择…', en: 'Choose…' },

  // Form labels
  'detail.label.excerpt.note': { zh: '为什么值得保留（注释，可选）', en: 'Why it is worth keeping (annotation, optional)' },
  'detail.label.definition': { zh: '定义（可选）', en: 'Definition (optional)' },
  'detail.label.boundaries': { zh: '适用边界（每行一条，可选）', en: 'Boundaries (one per line, optional)' },
  'detail.label.examples': { zh: '示例（每行一条，可选）', en: 'Examples (one per line, optional)' },
  'detail.label.counterExamples': { zh: '反例（每行一条，可选）', en: 'Counterexamples (one per line, optional)' },
  'detail.label.stance': { zh: '你的立场（必填）', en: 'Your stance (required)' },
  'detail.label.evidence': { zh: '证据（每行一条，可选）', en: 'Evidence (one per line, optional)' },
  'detail.label.assumptions': { zh: '前提（每行一条，可选）', en: 'Assumptions (one per line, optional)' },
  'detail.label.steps': { zh: '步骤（每行一条，至少一项）', en: 'Steps (one per line, at least one)' },
  'detail.placeholder.steps': { zh: '第一步…', en: 'Step one…' },
  'detail.label.prerequisites': { zh: '适用条件（每行一条，可选）', en: 'Preconditions (one per line, optional)' },
  'detail.label.failureModes': { zh: '失败模式（每行一条，可选）', en: 'Failure modes (one per line, optional)' },
  'detail.label.rationale': { zh: '决策理由（必填）', en: 'Rationale (required)' },
  'detail.placeholder.rationale': { zh: '背景、约束与取舍', en: 'Background, constraints and trade-offs' },
  'detail.label.alternatives': { zh: '备选项（每行一条，可选）', en: 'Alternatives (one per line, optional)' },
  'detail.label.consequences': { zh: '后果（每行一条，可选）', en: 'Consequences (one per line, optional)' },
  'detail.label.answer': { zh: '结论（已回答时必填）', en: 'Conclusion (required when answered)' },
  'detail.placeholder.optional': { zh: '可选', en: 'Optional' },
  'detail.placeholder.hypothesisOrNext': { zh: '假设或下一步至少填一项', en: 'Fill in at least one of hypothesis or next step' },

  // Required-detail gate, shown before submitting (extension PRD §4.4/§4.6)
  'detail.invalid.claim': { zh: '请先选择你的立场（支持 / 反对 / 存疑）', en: 'Choose your stance first (support / oppose / uncertain)' },
  'detail.invalid.procedure': { zh: '至少写出一个步骤（每行一条）', en: 'Write at least one step (one per line)' },
  'detail.invalid.decision': { zh: '请写决策理由（背景、约束与取舍）', en: 'Write the rationale (background, constraints and trade-offs)' },
  'detail.invalid.questionAnswered': { zh: '已回答的问题需要写结论', en: 'An answered question needs a conclusion' },
  'detail.invalid.question': { zh: '写当前假设或下一步验证（至少一项）', en: 'Write the current hypothesis or the next verification (at least one)' },
})
