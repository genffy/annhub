/**
 * CaptureModal — the L2 three-step lock (docs/v2/processing.md §2, extension
 * PRD §4). Deep mode: 理解 -> 核验 -> 应用; standard mode: 核验 -> 应用.
 *
 * Verification is an explicit user confirmation (time + source recorded,
 * summary/notes optional). Editing content / excerpt / source / kind after
 * confirming clears the confirmation. Application is a hard gate: non-empty
 * and not a copy of content/excerpt — no fixed language token thresholds.
 *
 * Failure rules (processing.md §6): save failure keeps every input; exiting
 * with input asks 放弃/继续编辑; going back a step preserves all content.
 * Short-lived form state persists to chrome.storage.session (PRD §9) keyed by
 * tab + source url + draft id.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FragmentRecord, VerifiedResult, VerifiedSource } from '../../../learning-core/types'
import type { SaveFragmentInput } from '../../../types/messages'
import MessageUtils from '../../../utils/message'
import { Logger } from '../../../utils/logger'

/** Funnel counters — events only, never content (roadmap R1.4). */
const recordMetric = (event: 'modal-opened' | 'reached-verify' | 'reached-apply' | 'saved' | 'exited', step?: string) => {
  MessageUtils.sendMessage({ type: 'RECORD_CAPTURE_METRIC', event, step }).catch(() => {})
}
import type { CaptureDraft, TextFragmentKind } from './capture-context'

export interface CaptureModalProps {
  draft: CaptureDraft
  deepMode: boolean
  /** Range clone used when the user checks "同时高亮原文". */
  selectedRange: Range | null
  createHighlight: (range: Range) => Promise<string | null>
  onClose: () => void
  /** True for the no-selection inspiration form (extension PRD §2.2). */
  manualInspiration?: boolean
}

type Step = 'interpret' | 'verify' | 'apply'

const KIND_LABELS: Record<TextFragmentKind, string> = {
  excerpt: '摘录',
  concept: '概念',
  claim: '主张',
  procedure: '方法',
  decision: '决策',
  question: '问题',
  inspiration: '灵感',
}

/** Per-kind prompts (extension PRD §4.4). */
const KIND_PROMPTS: Record<TextFragmentKind, { interpret: string; apply: string; verifyHint: string }> = {
  excerpt: { interpret: '为什么这段话值得保留？', apply: '你准备在哪个任务中引用或使用？', verifyHint: '回看原文和语境' },
  concept: { interpret: '用自己的话解释它', apply: '它可以解释你当前哪个问题？', verifyHint: '对照定义、边界和示例' },
  claim: { interpret: '你目前赞同吗？为什么？', apply: '你会用它支持、质疑或修正什么判断？', verifyHint: '检查证据和反例' },
  procedure: { interpret: '先写出你记得的步骤', apply: '你准备在哪个任务中执行？', verifyHint: '对照完整流程' },
  decision: { interpret: '推断做出该决定的约束', apply: '以后用什么信号验证它？', verifyHint: '核对背景、备选和后果' },
  question: { interpret: '你当前的假设是什么？', apply: '下一步如何验证？', verifyHint: '整理已知证据和未知项' },
  inspiration: { interpret: '这个想法从何而来？', apply: '准备在哪篇文章、哪个问题或下次思考中继续？', verifyHint: '区分观察、推测与反例' },
}

interface DetailFormState {
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

const EMPTY_DETAIL: DetailFormState = {
  note: '', definition: '', boundaries: '', examples: '', counterExamples: '',
  stance: '', evidence: '', assumptions: '', steps: '', prerequisites: '', failureModes: '',
  rationale: '', alternatives: '', consequences: '', status: 'open', hypothesis: '', nextStep: '', answer: '',
  form: 'idea',
}

const lines = (text: string): string[] =>
  text.split('\n').map(l => l.trim()).filter(Boolean)

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
function buildDetail(kind: TextFragmentKind, d: DetailFormState): unknown {
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
        stance: d.stance!,
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

interface FormState {
  kind: TextFragmentKind
  content: string
  excerpt: string
  /** inspiration-only: the trigger background appended after content (fragments.md §7). */
  background: string
  sourceUrl: string
  sourceTitle: string
  guess: string
  summary: string
  notes: string
  verified: VerifiedResult | null
  use: string
  tags: string
  highlight: boolean
  detail: DetailFormState
}

const VERIFIED_SOURCE_LABELS: Record<VerifiedSource, string> = {
  'source-material': '原文材料',
  llm: 'LLM',
  manual: '手工核对',
}

/**
 * Draft key = tab id + source URL (PRD §9: 键包含 tab ID、来源 URL 和一次选区的
 * draft ID)。draftId rides inside the payload: keying WITHOUT it is what makes
 * a later capture on the same tab+url able to find and restore the draft.
 */
function draftStorageKey(tabId: number | null, draft: CaptureDraft): string | null {
  if (tabId === null) return null // not resolved yet — persistence waits
  return `capture-draft:${tabId}:${draft.sourceUrl}`
}

export default function CaptureModal({ draft, deepMode, selectedRange, createHighlight, onClose, manualInspiration }: CaptureModalProps) {
  // 深度模式是全局偏好，也可在单次 Modal 中临时切换（PRD §4.2）；切换不丢内容。
  const [deepOverride, setDeepOverride] = useState<boolean | null>(null)
  const effectiveDeep = deepOverride ?? deepMode
  const steps: Step[] = effectiveDeep || manualInspiration ? ['interpret', 'verify', 'apply'] : ['verify', 'apply']
  const [stepIndex, setStepIndex] = useState(0)
  const step = steps[stepIndex]

  const [form, setForm] = useState<FormState>(() => ({
    kind: draft.suggestedKind,
    content: draft.content,
    excerpt: draft.excerpt,
    background: '',
    sourceUrl: draft.sourceUrl,
    sourceTitle: draft.sourceTitle,
    guess: '',
    summary: '',
    notes: '',
    verified: null,
    use: '',
    tags: '',
    highlight: false,
    detail: { ...EMPTY_DETAIL },
  }))
  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(prev => ({ ...prev, [key]: value }))

  const [duplicateOf, setDuplicateOf] = useState<FragmentRecord | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
  const [savedKind, setSavedKind] = useState<TextFragmentKind | null>(null)
  const [restored, setRestored] = useState(false)
  const [tabId, setTabId] = useState<number | null>(null)
  const rangeRef = useRef(selectedRange)
  if (selectedRange) rangeRef.current = selectedRange
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restoreCheckedRef = useRef(false)
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    },
    [],
  )

  // ── session draft persistence (PRD §9): debounced 300ms writes ──────
  useEffect(() => {
    recordMetric('modal-opened', steps[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (step === 'verify') recordMetric('reached-verify')
    if (step === 'apply') recordMetric('reached-apply')
  }, [step])

  // Resolve the tab id once — draft keys need tab identity (PRD §9).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await MessageUtils.sendMessage<{ tabId: number }>({ type: 'GET_TAB_ID' })
        if (!cancelled) setTabId(response.success && response.data ? response.data.tabId : 0)
      } catch {
        if (!cancelled) setTabId(0)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const storageKey = draftStorageKey(tabId, draft)

  // Restore: a previous capture on THIS tab + source left an unsaved draft
  // (navigation/SW restart — explicit abandon clears it, see requestClose).
  useEffect(() => {
    if (!storageKey || restoreCheckedRef.current) return
    restoreCheckedRef.current = true
    const key = storageKey
    void (async () => {
      try {
        const stored = await chrome.storage.session.get(key)
        const prev = stored[key] as FormState | undefined
        if (prev && (prev.use?.trim() || prev.guess?.trim() || prev.content?.trim() || prev.background?.trim())) {
          setForm(prevState => ({ ...prevState, ...prev }))
          setRestored(true)
        }
      } catch {
        /* storage.session unavailable — persistence is best-effort */
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  // Debounced 300ms writes once anything meaningful exists (also after a
  // restore, so later edits keep updating the recoverable draft).
  useEffect(() => {
    if (!storageKey) return
    if (!form.use && !form.guess && !form.content && !form.background) return // nothing to persist yet
    const key = storageKey
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(() => {
      chrome.storage.session.set({ [key]: form }).catch(() => {})
    }, 300)
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    }
  }, [form, storageKey])

  /** Cancels any in-flight debounce AND removes the stored draft — otherwise a
   * pending timer would resurrect the draft right after a save/abandon. */
  const clearDraft = useCallback(() => {
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current)
      draftTimerRef.current = null
    }
    if (storageKey) chrome.storage.session.remove(storageKey).catch(() => {})
  }, [storageKey])

  const dirty = useMemo(
    () =>
      !!(
        form.guess.trim() ||
        form.use.trim() ||
        form.summary.trim() ||
        form.notes.trim() ||
        form.tags.trim() ||
        form.background.trim() ||
        form.highlight ||
        form.content.trim() !== draft.content.trim() ||
        form.excerpt !== draft.excerpt ||
        form.kind !== draft.suggestedKind
      ),
    [form, draft, manualInspiration],
  )

  const prompts = KIND_PROMPTS[form.kind]

  // Editing protected fields clears the confirmation (fragments.md §7).
  const editProtected = () => {
    setForm(prev => (prev.verified ? { ...prev, verified: null } : prev))
  }

  const useInvalid = (() => {
    const use = form.use.trim()
    if (!use) return form.use ? '应用不能为空' : ''
    if (use === form.content.trim()) return '应用不能只复述原文'
    if (use === form.excerpt.trim()) return '应用不能照抄上下文'
    return ''
  })()

  const detailInvalid = manualInspiration ? '' : detailInvalidMessage(form.kind, form.detail)

  // ── close / navigation guards ────────────────────────────────────────
  const requestClose = useCallback(() => {
    if (saveState === 'saving') return
    if (savedKind) {
      onClose()
      return
    }
    if (dirty && !window.confirm('已填写的内容将被放弃。放弃并关闭？')) return
    if (!savedKind) recordMetric('exited', step)
    clearDraft()
    onClose()
  }, [dirty, onClose, saveState, savedKind, clearDraft, step])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        requestClose()
      }
      // Cmd/Ctrl+Enter advances or saves (PRD §10).
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (step === 'apply') void doSave(false)
        else if (canAdvance) goNext()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestClose, step, form])

  const goNext = () => {
    if (stepIndex < steps.length - 1) setStepIndex(stepIndex + 1)
  }
  useEffect(() => {
    if (stepIndex > steps.length - 1) setStepIndex(steps.length - 1)
  }, [stepIndex, steps.length])
  const goBack = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1) // 返回上一步保留全部内容
  }

  const backgroundMissing = manualInspiration && !form.background.trim()
  const canAdvance = step === 'interpret' ? true : step === 'verify' ? !!form.verified && !backgroundMissing : !useInvalid && !detailInvalid

  const confirmVerified = (source: VerifiedSource) => {
    setField('verified', {
      confirmedAt: Date.now(),
      source,
      ...(form.summary.trim() ? { summary: form.summary.trim() } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    })
  }

  // ── save ─────────────────────────────────────────────────────────────
  const buildInput = (): SaveFragmentInput => {
    // Manual inspiration: excerpt starts with the user's own words, then the
    // trigger background (fragments.md §7 — excerpt always contains content).
    const excerpt = manualInspiration
      ? `${form.content.trim()}\n${form.background.trim()}`
      : form.excerpt.trim() || form.content.trim()
    return {
      kind: form.kind,
      content: form.content.trim(),
      excerpt,
      sourceUrl: form.sourceUrl.trim(),
      sourceTitle: form.sourceTitle.trim() || undefined,
      locator: draft.locator,
      guess: form.guess.trim() || undefined,
      verified: form.verified!,
      use: form.use.trim(),
      tags: form.tags.split(/[,，]/).map(t => t.trim()).filter(Boolean),
      detail: buildDetail(form.kind, form.detail),
    }
  }

  const doSave = async (force = false) => {
    if (saveState === 'saving' || useInvalid || detailInvalid || !form.verified) return
    setSaveState('saving')
    setSaveError('')
    try {
      const response = await MessageUtils.sendMessage({ type: 'SAVE_FRAGMENT', input: buildInput(), force })
      if (!response.success) throw new Error(response.error || '保存失败')
      const data = (response.data ?? {}) as { fragment?: FragmentRecord; duplicateOf?: FragmentRecord }
      if (!data.fragment && data.duplicateOf) {
        setDuplicateOf(data.duplicateOf)
        setSaveState('idle')
        return
      }
      // 可选高亮：先保碎片，再补建高亮；失败不回滚 Fragment，仅提示可重试
      if (form.highlight && rangeRef.current) {
        try {
          const highlightId = await createHighlight(rangeRef.current.cloneRange())
          if (!highlightId) Logger.warn('[CaptureModal] Optional highlight returned no id (fragment kept)')
        } catch (err) {
          Logger.warn('[CaptureModal] Optional highlight failed (fragment kept):', err)
          window.setTimeout(() => window.alert('碎片已保存，但创建高亮失败，可在原页面重试。'), 50)
        }
      }
      setDuplicateOf(null)
      setSavedKind(form.kind)
      recordMetric('saved')
      setSaveState('idle')
      clearDraft()
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
      closeTimerRef.current = setTimeout(onClose, 700)
    } catch (error) {
      setSaveState('error')
      setSaveError(error instanceof Error ? error.message : '保存失败')
    }
  }

  // ── success screen (PRD §4.7) ────────────────────────────────────────
  if (savedKind) {
    return (
      <ModalShell>
        <div style={styles.success} data-ann-ui="capture-modal">
          <div>已保存为「{KIND_LABELS[savedKind]}」</div>
          <div style={styles.successActions}>
            <button
              style={styles.successLink}
              onClick={() => {
                window.open(chrome.runtime.getURL('/words.html'), '_blank')
                onClose()
              }}
            >
              在碎片库查看
            </button>
            <button style={styles.successPrimary} onClick={onClose}>
              继续阅读
            </button>
          </div>
        </div>
      </ModalShell>
    )
  }

  const detailForm = (
    <DetailForm kind={form.kind} detail={form.detail} onChange={next => setField('detail', next)} />
  )

  return (
    <ModalShell>
      <div style={styles.card} data-ann-ui="capture-modal">
        {/* header: source + back to origin (PRD §4.1) */}
        <div style={styles.header}>
          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {manualInspiration ? '新建灵感' : `保存为 Fragment`}
          </span>
          {!manualInspiration && (
            <button
              style={styles.modeToggle}
              onClick={() => setDeepOverride(prev => (prev === null ? !effectiveDeep : !prev))}
              title="深度模式是全局偏好，单次可临时切换"
              data-testid="deep-mode-toggle"
            >
              {effectiveDeep ? '→ 标准模式' : '→ 深度模式'}
            </button>
          )}
          <span style={styles.stepBadge}>
            {stepIndex + 1}/{steps.length} · {step === 'interpret' ? '理解' : step === 'verify' ? '核验' : '应用'}
          </span>
          <button style={styles.closeBtn} onClick={requestClose} title="关闭 (Esc)" aria-label="关闭">
            ✕
          </button>
        </div>
        {!manualInspiration && (
          <div style={styles.sourceLine}>
            <span style={styles.host}>{draft.sourceHost}</span>
            <a href={form.sourceUrl} target="_blank" rel="noreferrer" style={styles.sourceLink}>
              回到原文
            </a>
          </div>
        )}

        {/* body: editable selection + context (PRD §5.4 允许修正) */}
        <label style={styles.label}>{manualInspiration ? '你的想法（必填）' : '内容（可修正）'}</label>
        <textarea
          style={styles.textarea}
          rows={2}
          maxLength={500}
          value={form.content}
          onChange={e => {
            setField('content', e.target.value)
            editProtected()
          }}
        />
        {!manualInspiration && (
          <>
            <label style={styles.label}>上下文（可编辑，需包含内容）</label>
            <textarea
              style={{ ...styles.textarea, fontSize: '12px', color: '#3c4048' }}
              rows={3}
              maxLength={2000}
              value={form.excerpt}
              onChange={e => {
                setField('excerpt', e.target.value)
                editProtected()
              }}
            />
          </>
        )}

        {/* kind segmented control — user correction always allowed */}
        <div style={styles.kindRow} role="radiogroup" aria-label="类型">
          {(Object.keys(KIND_LABELS) as TextFragmentKind[]).map(kind => (
            <button
              key={kind}
              style={{ ...styles.kindChip, background: form.kind === kind ? '#1a1d24' : '#f1f1f4', color: form.kind === kind ? '#fff' : '#3c4048' }}
              onClick={() => {
                setField('kind', kind)
                editProtected()
              }}
              data-testid={`kind-${kind}`}
            >
              {KIND_LABELS[kind]}
            </button>
          ))}
        </div>
        {restored && <div style={styles.restoredNote}>已恢复上次未提交的草稿（仅本浏览器会话内）</div>}

        {/* ── Step: 理解 ── */}
        {step === 'interpret' && (
          <div style={styles.stepBody}>
            <div style={styles.stepTitle}>🤔 理解</div>
            <label style={styles.label}>{prompts.interpret}</label>
            <textarea style={styles.textarea} rows={3} value={form.guess} onChange={e => setField('guess', e.target.value)} placeholder="写下当前的解释、判断或问题（可留空）" />
            <div style={styles.actions}>
              <button style={styles.primaryBtn} onClick={goNext}>
                去核验 →
              </button>
            </div>
          </div>
        )}

        {/* ── Step: 核验（不可跳过，processing.md §2） ── */}
        {step === 'verify' && (
          <div style={styles.stepBody}>
            <div style={styles.stepTitle}>✅ 核验 — {prompts.verifyHint}</div>
            {form.guess.trim() && (
              <div style={styles.excerpt}>
                <div style={styles.compareLabel}>你的理解</div>
                {form.guess}
              </div>
            )}
            {manualInspiration ? (
              <div style={styles.excerpt}>
                <div style={styles.compareLabel}>触发背景（区分观察与推测）</div>
                <textarea
                  style={styles.inlineTextarea}
                  rows={2}
                  value={form.background}
                  onChange={e => setField('background', e.target.value)}
                  placeholder="什么触发了这个想法？（必填）"
                />
              </div>
            ) : (
              <div style={styles.excerpt}>
                <div style={styles.compareLabel}>原文语境</div>
                {form.excerpt}
              </div>
            )}
            <label style={styles.label}>摘要（可选）</label>
            <textarea style={styles.textarea} rows={2} value={form.summary} onChange={e => setField('summary', e.target.value)} placeholder="核对后的结论；仅确认原文时可留空" />
            <label style={styles.label}>备注（可选）</label>
            <textarea style={styles.textarea} rows={2} value={form.notes} onChange={e => setField('notes', e.target.value)} />

            {form.verified ? (
              <div style={styles.verifiedNote}>
                已确认核对（{VERIFIED_SOURCE_LABELS[form.verified.source]}，{new Date(form.verified.confirmedAt).toLocaleTimeString()}）。修改内容、语境、来源或类型后需重新确认。
              </div>
            ) : (
              <div style={styles.verifyRow}>
                <span style={styles.muted}>确认方式：</span>
                {!manualInspiration && (
                  <button style={styles.verifyBtn} onClick={() => confirmVerified('source-material')}>
                    已回看原文，确认
                  </button>
                )}
                <button style={styles.verifyBtn} onClick={() => confirmVerified('manual')}>
                  手工核对后确认
                </button>
              </div>
            )}
            <div style={styles.actions}>
              {stepIndex > 0 && (
                <button style={styles.ghostBtn} onClick={goBack}>
                  ← 返回理解
                </button>
              )}
              <button style={{ ...styles.primaryBtn, opacity: form.verified && !backgroundMissing ? 1 : 0.5 }} onClick={goNext} disabled={!form.verified || backgroundMissing}>
                去应用 →
              </button>
            </div>
          </div>
        )}

        {/* ── Step: 应用（硬门槛） ── */}
        {step === 'apply' && (
          <div style={styles.stepBody}>
            <div style={styles.stepTitle}>✍️ 应用</div>
            <label style={styles.label}>{prompts.apply}</label>
            <textarea
              style={{ ...styles.textarea, borderColor: useInvalid ? '#e5484d' : undefined }}
              rows={3}
              value={form.use}
              onChange={e => setField('use', e.target.value)}
              placeholder="写下准备如何使用、验证或迁移（必填）"
            />
            {useInvalid && <div style={styles.useError}>{useInvalid}</div>}
            {detailInvalid && (
              <div style={styles.useError} data-testid="detail-invalid">
                {detailInvalid}
              </div>
            )}

            {detailForm}
            <input style={styles.tagInput} placeholder="标签（逗号分隔，可选）" value={form.tags} onChange={e => setField('tags', e.target.value)} />
            {!manualInspiration && selectedRange && (
              <label style={styles.checkRow}>
                <input type="checkbox" checked={form.highlight} onChange={e => setField('highlight', e.target.checked)} />
                同时高亮原文
              </label>
            )}

            {duplicateOf && (
              <div style={styles.errorBanner}>
                <span>已保存过相同内容（同语境，{new Date(duplicateOf.createdAt).toLocaleDateString()}）。仍要保存为新记录吗？</span>
                <button style={styles.miniBtn} onClick={() => doSave(true)}>
                  仍要保存
                </button>
              </div>
            )}
            {saveState === 'error' && <div style={styles.errorBanner}>保存失败：{saveError}。输入已保留，可直接重试。</div>}

            <div style={styles.actions}>
              <button style={styles.ghostBtn} onClick={goBack} disabled={saveState === 'saving'}>
                ← 返回核验
              </button>
              <button
                style={{ ...styles.primaryBtn, opacity: !useInvalid && !detailInvalid && form.verified && saveState !== 'saving' ? 1 : 0.5 }}
                onClick={() => doSave(false)}
                disabled={!!useInvalid || !!detailInvalid || !form.verified || saveState === 'saving'}
                data-testid="save-fragment"
              >
                {saveState === 'saving' ? '保存中…' : '保存到碎片库'}
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  )
}

/** Per-kind detail fields (extension PRD §4.4 必填 detail). */
function DetailForm({ kind, detail, onChange }: { kind: TextFragmentKind; detail: DetailFormState; onChange: (next: DetailFormState) => void }) {
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

function ModalShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-ann-ui="capture-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000000,
        background: 'rgba(15, 15, 20, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        pointerEvents: 'auto',
      }}
    >
      {children}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    width: 'min(560px, calc(100vw - 32px))',
    maxHeight: '82vh',
    overflowY: 'auto',
    background: '#fff',
    borderRadius: '12px',
    padding: '16px 18px',
    boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
    color: '#1a1d24',
    fontSize: '14px',
  },
  header: { display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '8px', borderBottom: '1px solid #e8e8ec' },
  stepBadge: { fontSize: '12px', color: '#636977', background: '#f1f1f4', borderRadius: '10px', padding: '2px 8px', whiteSpace: 'nowrap' },
  modeToggle: { border: '1px solid #d6d8de', background: '#fff', color: '#3c4048', borderRadius: '10px', padding: '2px 10px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' },
  closeBtn: { marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '14px', color: '#636977' },
  sourceLine: { display: 'flex', alignItems: 'center', gap: '10px', margin: '8px 0 2px' },
  host: { fontSize: '12px', color: '#636977' },
  sourceLink: { fontSize: '12px', color: '#2563eb' },
  kindRow: { display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '10px 0' },
  kindChip: { border: 'none', borderRadius: '999px', padding: '4px 12px', fontSize: '13px', cursor: 'pointer' },
  restoredNote: { fontSize: '12px', color: '#8b8d98', marginBottom: '6px' },
  stepBody: { display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '10px' },
  stepTitle: { fontWeight: 600 },
  excerpt: { background: '#f6f7f9', borderRadius: '8px', padding: '8px 10px', lineHeight: 1.6, color: '#3c4048', wordBreak: 'break-word' },
  textarea: { width: '100%', boxSizing: 'border-box', border: '1px solid #d6d8de', borderRadius: '8px', padding: '8px 10px', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical' },
  inlineTextarea: { width: '100%', boxSizing: 'border-box', border: '1px solid #d6d8de', borderRadius: '6px', padding: '6px 8px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' },
  label: { fontSize: '12px', color: '#636977', marginTop: '2px' },
  compareLabel: { fontSize: '12px', color: '#636977', marginBottom: '4px' },
  muted: { color: '#8b8d98', fontSize: '13px' },
  verifyRow: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  verifyBtn: { border: '1px solid #1a1d24', background: '#fff', color: '#1a1d24', borderRadius: '8px', padding: '7px 14px', fontSize: '13px', cursor: 'pointer' },
  verifiedNote: { background: '#eef7ef', color: '#226a3c', borderRadius: '8px', padding: '8px 10px', fontSize: '13px' },
  useError: { fontSize: '12px', color: '#c6373c' },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: '#fdf0f0',
    color: '#c6373c',
    borderRadius: '8px',
    padding: '8px 10px',
    fontSize: '13px',
    wordBreak: 'break-word',
  },
  miniBtn: { border: '1px solid #e5a0a2', background: '#fff', color: '#c6373c', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap' },
  checkRow: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#3c4048' },
  select: { border: '1px solid #d6d8de', borderRadius: '8px', padding: '6px 8px', fontSize: '13px', background: '#fff' },
  tagInput: { border: '1px solid #d6d8de', borderRadius: '8px', padding: '7px 10px', fontSize: '13px' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '6px' },
  primaryBtn: { background: '#1a1d24', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', cursor: 'pointer' },
  ghostBtn: { background: 'transparent', color: '#3c4048', border: '1px solid #d6d8de', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer' },
  success: { background: 'rgba(40, 167, 69, 0.96)', color: '#fff', borderRadius: '10px', padding: '16px 28px', fontSize: '16px', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' },
  successActions: { display: 'flex', gap: '10px' },
  successLink: { background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.7)', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px' },
  successPrimary: { background: '#fff', color: '#226a3c', border: 'none', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px' },
}
