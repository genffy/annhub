/**
 * Per-kind detail fields of the capture form (extension PRD §4.4): which
 * fields exist for a kind, which are required by the form, how they assemble
 * into the contract's `detail` block (fragments.md §4), and the kind-specific
 * hint shown BEFORE submitting. The data layer is more permissive than the form
 * (e.g. claim.stance is optional in storage but the form asks for it).
 */
import { uiText, type UiLanguage } from '../../../utils/ui-text'
import type { TextFragmentKind } from './capture-context'
import { styles } from './styles'

type DetailField =
  | 'note'
  | 'definition'
  | 'boundaries'
  | 'examples'
  | 'counterExamples'
  | 'stance'
  | 'evidence'
  | 'assumptions'
  | 'steps'
  | 'prerequisites'
  | 'failureModes'
  | 'rationale'
  | 'alternatives'
  | 'consequences'
  | 'status'
  | 'hypothesis'
  | 'nextStep'
  | 'answer'
  | 'form'

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
 * user sees a kind-specific hint BEFORE submitting, instead of the server's
 * stable error code afterwards.
 */
export function detailInvalidMessage(kind: TextFragmentKind, d: DetailFormState, lang?: UiLanguage): string {
  switch (kind) {
    case 'claim':
      return d.stance ? '' : uiText('detail.invalid.claim', {}, lang)
    case 'procedure':
      return lines(d.steps).length > 0 ? '' : uiText('detail.invalid.procedure', {}, lang)
    case 'decision':
      return d.rationale.trim() ? '' : uiText('detail.invalid.decision', {}, lang)
    case 'question':
      if (d.status === 'answered') return d.answer.trim() ? '' : uiText('detail.invalid.questionAnswered', {}, lang)
      return d.hypothesis.trim() || d.nextStep.trim() ? '' : uiText('detail.invalid.question', {}, lang)
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

/** The labelled values the user typed for this kind — fed to the save-as note and “Copy my input”. */
export function detailEntries(kind: TextFragmentKind, d: DetailFormState, lang?: UiLanguage): Array<[string, string]> {
  const fields: Array<[string, string]> = []
  const field = (name: DetailField) => uiText(`detail.field.${name}`, {}, lang)
  const add = (name: DetailField, value: string) => {
    if (value.trim()) fields.push([field(name), value.trim().replace(/\n+/g, uiText('detail.valueSeparator', {}, lang))])
  }
  switch (kind) {
    case 'excerpt':
      add('note', d.note)
      break
    case 'concept':
      add('definition', d.definition)
      add('boundaries', d.boundaries)
      add('examples', d.examples)
      add('counterExamples', d.counterExamples)
      break
    case 'claim':
      if (d.stance) add('stance', uiText(`detail.stance.${d.stance}`, {}, lang))
      add('evidence', d.evidence)
      add('assumptions', d.assumptions)
      break
    case 'procedure':
      add('steps', d.steps)
      add('prerequisites', d.prerequisites)
      add('failureModes', d.failureModes)
      break
    case 'decision':
      add('rationale', d.rationale)
      add('alternatives', d.alternatives)
      add('consequences', d.consequences)
      break
    case 'question':
      // The default status is not “typed” input; keep only a deliberate one.
      if (d.status !== 'open') add('status', uiText(`detail.status.${d.status}`, {}, lang))
      add('hypothesis', d.hypothesis)
      add('evidence', d.evidence)
      add('nextStep', d.nextStep)
      add('answer', d.status === 'answered' ? d.answer : '')
      break
    case 'inspiration':
      if (d.form !== 'idea') add('form', uiText(`detail.form.${d.form}`, {}, lang))
      break
  }
  return fields
}

/** Per-kind detail fields (extension PRD §4.4 required detail). */
export function DetailForm({ kind, detail, onChange }: { kind: TextFragmentKind; detail: DetailFormState; onChange: (next: DetailFormState) => void }) {
  const set = <K extends keyof DetailFormState>(key: K, value: DetailFormState[K]) => onChange({ ...detail, [key]: value })
  const row = (label: string, key: keyof DetailFormState, placeholder?: string) => (
    <>
      <label style={styles.label}>{label}</label>
      <textarea style={styles.textarea} rows={2} value={detail[key] as string} placeholder={placeholder} onChange={e => set(key, e.target.value as never)} />
    </>
  )
  switch (kind) {
    case 'excerpt':
      return <>{row(uiText('detail.label.excerpt.note'), 'note')}</>
    case 'concept':
      return (
        <>
          {row(uiText('detail.label.definition'), 'definition')}
          {row(uiText('detail.label.boundaries'), 'boundaries')}
          {row(uiText('detail.label.examples'), 'examples')}
          {row(uiText('detail.label.counterExamples'), 'counterExamples')}
        </>
      )
    case 'claim':
      return (
        <>
          <label style={styles.label}>{uiText('detail.label.stance')}</label>
          <select style={styles.select} value={detail.stance} onChange={e => set('stance', e.target.value as DetailFormState['stance'])} data-testid="claim-stance">
            <option value="">{uiText('detail.choose')}</option>
            <option value="support">{uiText('detail.stance.support')}</option>
            <option value="oppose">{uiText('detail.stance.oppose')}</option>
            <option value="uncertain">{uiText('detail.stance.uncertain')}</option>
          </select>
          {row(uiText('detail.label.evidence'), 'evidence')}
          {row(uiText('detail.label.assumptions'), 'assumptions')}
        </>
      )
    case 'procedure':
      return (
        <>
          {row(uiText('detail.label.steps'), 'steps', uiText('detail.placeholder.steps'))}
          {row(uiText('detail.label.prerequisites'), 'prerequisites')}
          {row(uiText('detail.label.failureModes'), 'failureModes')}
        </>
      )
    case 'decision':
      return (
        <>
          {row(uiText('detail.label.rationale'), 'rationale', uiText('detail.placeholder.rationale'))}
          {row(uiText('detail.label.alternatives'), 'alternatives')}
          {row(uiText('detail.label.consequences'), 'consequences')}
        </>
      )
    case 'question': {
      const placeholder = uiText(detail.status === 'answered' ? 'detail.placeholder.optional' : 'detail.placeholder.hypothesisOrNext')
      return (
        <>
          <label style={styles.label}>{uiText('detail.field.status')}</label>
          <select style={styles.select} value={detail.status} onChange={e => set('status', e.target.value as DetailFormState['status'])} data-testid="question-status">
            <option value="open">{uiText('detail.status.open')}</option>
            <option value="testing">{uiText('detail.status.testing')}</option>
            <option value="answered">{uiText('detail.status.answered')}</option>
          </select>
          {row(uiText('detail.field.hypothesis'), 'hypothesis', placeholder)}
          {row(uiText('detail.label.evidence'), 'evidence')}
          {row(uiText('detail.field.nextStep'), 'nextStep', placeholder)}
          {detail.status === 'answered' && row(uiText('detail.label.answer'), 'answer')}
        </>
      )
    }
    case 'inspiration':
      return (
        <>
          <label style={styles.label}>{uiText('detail.field.form')}</label>
          <select style={styles.select} value={detail.form} onChange={e => set('form', e.target.value as DetailFormState['form'])} data-testid="inspiration-form">
            <option value="idea">{uiText('detail.form.idea')}</option>
            <option value="reflection">{uiText('detail.form.reflection')}</option>
          </select>
        </>
      )
  }
}
