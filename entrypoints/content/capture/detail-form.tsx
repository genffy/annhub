/**
 * Per-kind detail fields of the capture form (extension PRD §4.4): which
 * fields exist for a kind, which are required by the form, how they assemble
 * into the contract's `detail` block (fragments.md §4), and the kind-specific
 * hint shown BEFORE submitting. The data layer is more permissive than the form
 * (e.g. claim.stance is optional in storage but the form asks for it).
 */
import type { TextFragmentKind } from './capture-context'
import { styles } from './styles'

export interface DetailFormState {
  note: string
  definition: string
  boundaries: string
  examples: string
  counterExamples: string
  stance: '' | 'support' | 'oppose' | 'uncertain'
  evidence: string
  assumptions: string
  steps: string
  prerequisites: string
  failureModes: string
  rationale: string
  alternatives: string
  consequences: string
  status: 'open' | 'testing' | 'answered'
  hypothesis: string
  nextStep: string
  answer: string
  form: 'idea' | 'reflection'
}

export const EMPTY_DETAIL: DetailFormState = {
  note: '',
  definition: '',
  boundaries: '',
  examples: '',
  counterExamples: '',
  stance: '',
  evidence: '',
  assumptions: '',
  steps: '',
  prerequisites: '',
  failureModes: '',
  rationale: '',
  alternatives: '',
  consequences: '',
  status: 'open',
  hypothesis: '',
  nextStep: '',
  answer: '',
  form: 'idea',
}

export const lines = (text: string): string[] =>
  text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

/**
 * Client-side per-kind required-detail gate (extension PRD §4.4/§4.6): the
 * user sees a kind-specific Chinese hint BEFORE submitting, instead of the
 * server's stable error code afterwards.
 */
export function detailInvalidMessage(kind: TextFragmentKind, d: DetailFormState): string {
  switch (kind) {
    case 'claim':
      return d.stance ? '' : '请先选择你的立场（支持 / 反对 / 存疑）'
    case 'procedure':
      return lines(d.steps).length > 0 ? '' : '至少写出一个步骤（每行一条）'
    case 'decision':
      return d.rationale.trim() ? '' : '请写决策理由（背景、约束与取舍）'
    case 'question':
      if (d.status === 'answered') return d.answer.trim() ? '' : '已回答的问题需要写结论'
      return d.hypothesis.trim() || d.nextStep.trim() ? '' : '写当前假设或下一步验证（至少一项）'
    default:
      return ''
  }
}

/** Assembles the per-kind detail block from the form state (fragments.md §4). */
export function buildDetail(kind: TextFragmentKind, d: DetailFormState): unknown {
  switch (kind) {
    case 'excerpt':
      return d.note.trim() ? { note: d.note.trim() } : {}
    case 'concept':
      return {
        ...(d.definition.trim() ? { definition: d.definition.trim() } : {}),
        ...(lines(d.boundaries).length ? { boundaries: lines(d.boundaries) } : {}),
        ...(lines(d.examples).length ? { examples: lines(d.examples) } : {}),
        ...(lines(d.counterExamples).length ? { counterExamples: lines(d.counterExamples) } : {}),
      }
    case 'claim':
      return {
        ...(d.stance ? { stance: d.stance } : {}),
        ...(lines(d.evidence).length ? { evidence: lines(d.evidence) } : {}),
        ...(lines(d.assumptions).length ? { assumptions: lines(d.assumptions) } : {}),
      }
    case 'procedure':
      return {
        steps: lines(d.steps),
        ...(lines(d.prerequisites).length ? { prerequisites: lines(d.prerequisites) } : {}),
        ...(lines(d.failureModes).length ? { failureModes: lines(d.failureModes) } : {}),
      }
    case 'decision':
      return {
        rationale: d.rationale.trim(),
        ...(lines(d.alternatives).length ? { alternatives: lines(d.alternatives) } : {}),
        ...(lines(d.consequences).length ? { consequences: lines(d.consequences) } : {}),
      }
    case 'question':
      return {
        status: d.status,
        ...(d.hypothesis.trim() ? { hypothesis: d.hypothesis.trim() } : {}),
        ...(lines(d.evidence).length ? { evidence: lines(d.evidence) } : {}),
        ...(d.nextStep.trim() ? { nextStep: d.nextStep.trim() } : {}),
        ...(d.status === 'answered' && d.answer.trim() ? { answer: d.answer.trim() } : {}),
      }
    case 'inspiration':
      return { form: d.form }
  }
}

const STANCE_LABELS = { support: '支持', oppose: '反对', uncertain: '存疑' } as const
const STATUS_LABELS = { open: '待验证', testing: '验证中', answered: '已回答' } as const
const FORM_LABELS = { idea: '想法', reflection: '随感' } as const

/** The labelled values the user typed for this kind — fed to the 改存 note and 复制我的输入. */
export function detailEntries(kind: TextFragmentKind, d: DetailFormState): Array<[string, string]> {
  const fields: Array<[string, string]> = []
  const add = (label: string, value: string) => {
    if (value.trim()) fields.push([label, value.trim().replace(/\n+/g, '；')])
  }
  switch (kind) {
    case 'excerpt':
      add('注释', d.note)
      break
    case 'concept':
      add('定义', d.definition)
      add('适用边界', d.boundaries)
      add('示例', d.examples)
      add('反例', d.counterExamples)
      break
    case 'claim':
      if (d.stance) add('立场', STANCE_LABELS[d.stance])
      add('证据', d.evidence)
      add('前提', d.assumptions)
      break
    case 'procedure':
      add('步骤', d.steps)
      add('适用条件', d.prerequisites)
      add('失败模式', d.failureModes)
      break
    case 'decision':
      add('决策理由', d.rationale)
      add('备选项', d.alternatives)
      add('后果', d.consequences)
      break
    case 'question':
      add('状态', STATUS_LABELS[d.status])
      add('当前假设', d.hypothesis)
      add('证据', d.evidence)
      add('下一步验证', d.nextStep)
      add('结论', d.status === 'answered' ? d.answer : '')
      break
    case 'inspiration':
      add('形式', FORM_LABELS[d.form])
      break
  }
  // The default-valued status/form are not “typed” input; keep only deliberate entries.
  return fields.filter(
    ([label, value]) => !(kind === 'question' && label === '状态' && value === STATUS_LABELS.open) && !(kind === 'inspiration' && label === '形式' && value === FORM_LABELS.idea),
  )
}

/** Per-kind detail fields (extension PRD §4.4 必填 detail). */
export function DetailForm({ kind, detail, onChange }: { kind: TextFragmentKind; detail: DetailFormState; onChange: (next: DetailFormState) => void }) {
  const set = <K extends keyof DetailFormState>(key: K, value: DetailFormState[K]) => onChange({ ...detail, [key]: value })
  const row = (label: string, key: keyof DetailFormState, placeholder?: string, required?: boolean) => (
    <>
      <label style={styles.label}>
        {label}
        {required ? '（必填）' : ''}
      </label>
      <textarea style={styles.textarea} rows={2} value={detail[key] as string} placeholder={placeholder} onChange={e => set(key, e.target.value as never)} />
    </>
  )
  switch (kind) {
    case 'excerpt':
      return <>{row('为什么值得保留（注释，可选）', 'note')}</>
    case 'concept':
      return (
        <>
          {row('定义（可选）', 'definition')}
          {row('适用边界（每行一条，可选）', 'boundaries')}
          {row('示例（每行一条，可选）', 'examples')}
          {row('反例（每行一条，可选）', 'counterExamples')}
        </>
      )
    case 'claim':
      return (
        <>
          <label style={styles.label}>你的立场（必填）</label>
          <select style={styles.select} value={detail.stance} onChange={e => set('stance', e.target.value as DetailFormState['stance'])} data-testid="claim-stance">
            <option value="">请选择…</option>
            <option value="support">支持</option>
            <option value="oppose">反对</option>
            <option value="uncertain">存疑</option>
          </select>
          {row('证据（每行一条，可选）', 'evidence')}
          {row('前提（每行一条，可选）', 'assumptions')}
        </>
      )
    case 'procedure':
      return (
        <>
          {row('步骤（每行一条，至少一项）', 'steps', '第一步…', true)}
          {row('适用条件（每行一条，可选）', 'prerequisites')}
          {row('失败模式（每行一条，可选）', 'failureModes')}
        </>
      )
    case 'decision':
      return (
        <>
          {row('决策理由（必填）', 'rationale', '背景、约束与取舍')}
          {row('备选项（每行一条，可选）', 'alternatives')}
          {row('后果（每行一条，可选）', 'consequences')}
        </>
      )
    case 'question':
      return (
        <>
          <label style={styles.label}>状态</label>
          <select style={styles.select} value={detail.status} onChange={e => set('status', e.target.value as DetailFormState['status'])} data-testid="question-status">
            <option value="open">待验证</option>
            <option value="testing">验证中</option>
            <option value="answered">已回答</option>
          </select>
          {row('当前假设', 'hypothesis', detail.status === 'answered' ? '可选' : '假设或下一步至少填一项')}
          {row('证据（每行一条，可选）', 'evidence')}
          {row('下一步验证', 'nextStep', detail.status === 'answered' ? '可选' : '假设或下一步至少填一项')}
          {detail.status === 'answered' && row('结论（已回答时必填）', 'answer')}
        </>
      )
    case 'inspiration':
      return (
        <>
          <label style={styles.label}>形式</label>
          <select style={styles.select} value={detail.form} onChange={e => set('form', e.target.value as DetailFormState['form'])} data-testid="inspiration-form">
            <option value="idea">想法</option>
            <option value="reflection">随感</option>
          </select>
        </>
      )
  }
}
