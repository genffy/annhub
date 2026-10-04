/**
 * CaptureModal — the L2 three-step lock (docs/v2/processing.md §2, extension
 * PRD §4). Deep mode: 理解 -> 核验 -> 应用; standard mode: 核验 -> 应用.
 *
 * Verification is an explicit user confirmation (time + source recorded,
 * summary/notes optional). Editing content / excerpt / source / kind or the
 * verification source after confirming clears the confirmation. Application is
 * a hard gate: non-empty and not a copy of content/excerpt — no fixed
 * language token thresholds.
 *
 * Failure rules (processing.md §6, extension.md §9): save failure keeps every
 * input and offers 重试 / 复制我的输入 / 改存为剪藏 / 导出内容; closing with input
 * asks 继续编辑 / 改存为高亮 / 改存为剪藏 / 放弃; going back a step preserves all
 * content. Short-lived form state persists to chrome.storage.session (PRD §9)
 * keyed by tab + source url.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FragmentRecord, VerifiedResult, VerifiedSource } from '../../../learning-core/types'
import type { SaveFragmentInput } from '../../../types/messages'
import MessageUtils from '../../../utils/message'
import { Logger } from '../../../utils/logger'
import { KIND_LABELS, TEXT_KINDS } from '../../../utils/kind-labels'
import { splitExcerpt, type CaptureDraft, type TextFragmentKind } from './capture-context'
import { copyableInput, fallbackNote, hasTypedInput, type RecoverableInput } from './capture-recovery'
import CloseDialog, { type CloseChoice } from './CloseDialog'
import { buildDetail, DetailForm, detailEntries, detailInvalidMessage, EMPTY_DETAIL, type DetailFormState } from './detail-form'
import { styles } from './styles'
import { ThemeStyle } from './theme'
import { useFocusTrap } from './use-focus-trap'

type ExitFallback = 'none' | 'highlight' | 'clip'
type RecordedMetric = 'modal-opened' | 'reached-verify' | 'reached-apply' | 'saved' | 'exited'

/** Funnel counters — events only, never content (roadmap R1.4, metrics.md `capture.*`). */
const recordMetric = (event: RecordedMetric, step?: string, details?: { hadInput: boolean; fallback: ExitFallback }) => {
  MessageUtils.sendMessage({ type: 'RECORD_CAPTURE_METRIC', event, step, ...details }).catch(() => {})
}

export interface CaptureFallbacks {
  /** Saves the selection as a Highlight carrying the user's typed text as its note. */
  highlight: (range: Range, note: string) => Promise<boolean>
  /** Saves the selection as a Clip carrying the user's typed text as its note. */
  clip: (range: Range, note: string) => Promise<boolean>
}

export interface CaptureModalProps {
  draft: CaptureDraft
  deepMode: boolean
  /** Range clone used for "同时高亮原文", 回到原文 and the 改存 exits; null for library-origin drafts. */
  selectedRange: Range | null
  createHighlight: (range: Range) => Promise<string | null>
  /** In-page safe exits; absent for library-origin drafts (no page selection to convert). */
  fallbacks?: CaptureFallbacks
  onClose: () => void
  /** True for the no-selection inspiration form (extension PRD §2.2). */
  manualInspiration?: boolean
}

type Step = 'interpret' | 'verify' | 'apply'

const STEP_LABELS: Record<Step, string> = { interpret: '理解', verify: '核验', apply: '应用' }

/** Per-kind prompts (kinds.md §4 采集提问). */
const KIND_PROMPTS: Record<TextFragmentKind, { interpret: string; apply: string; verifyHint: string }> = {
  excerpt: { interpret: '为什么这段话值得保留？', apply: '你准备在哪个任务中引用或使用？', verifyHint: '回看原文和语境' },
  concept: { interpret: '用自己的话解释它', apply: '它可以解释你当前哪个问题？', verifyHint: '对照定义、边界和示例' },
  claim: { interpret: '你目前赞同吗？为什么？', apply: '你会用它支持、质疑或修正什么判断？', verifyHint: '检查证据和反例' },
  procedure: { interpret: '先写出你记得的步骤', apply: '你准备在哪个任务中执行？', verifyHint: '对照完整流程与适用条件' },
  decision: { interpret: '推断做出该决定的约束', apply: '以后用什么信号验证它？', verifyHint: '核对背景、备选项和后果' },
  question: { interpret: '你当前的假设是什么？', apply: '下一步如何验证？', verifyHint: '整理已知证据和未知项' },
  inspiration: { interpret: '这个想法从何而来？', apply: '准备在哪篇文章、哪个问题或下次思考中继续？', verifyHint: '区分观察、推测与反例' },
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
  /** The source the next confirmation will record (原文 or 手工). */
  verifySource: VerifiedSource
  use: string
  tags: string
  highlight: boolean
  detail: DetailFormState
}

const VERIFIED_SOURCE_LABELS: Record<VerifiedSource, string> = {
  'source-material': '原文材料',
  'llm': 'LLM',
  'manual': '手工核对',
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

const isMac = /mac/i.test(typeof navigator === 'undefined' ? '' : (navigator.platform ?? ''))
const SHORTCUT = `${isMac ? 'Cmd' : 'Ctrl'}+Enter`

/** Save-time error codes → what the user can act on (UI never shows a raw exception, fragments.md §7). */
function describeSaveError(error: string): string {
  if (error.startsWith('QUOTA_EXCEEDED')) return '本地存储空间不足'
  if (error.startsWith('ASSET_MISSING')) return '关联的图片已不在本地库'
  return error
}

/** Copies text on any page: the async Clipboard API needs a secure context; plain-http pages use a hidden textarea. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* denied — use the textarea path below */
  }
  const area = document.createElement('textarea')
  area.value = text
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  const ok = document.execCommand('copy')
  area.remove()
  return ok
}

export default function CaptureModal({ draft, deepMode, selectedRange, createHighlight, fallbacks, onClose, manualInspiration }: CaptureModalProps) {
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
    verifySource: manualInspiration ? 'manual' : 'source-material',
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
  const [highlightFailed, setHighlightFailed] = useState(false)
  const [fallbackDone, setFallbackDone] = useState<ExitFallback | null>(null)
  const [restored, setRestored] = useState(false)
  const [tabId, setTabId] = useState<number | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [closeBusy, setCloseBusy] = useState(false)
  const [closeError, setCloseError] = useState('')
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle')
  const [summaryToggled, setSummaryToggled] = useState(false)
  const [notesToggled, setNotesToggled] = useState(false)

  const rangeRef = useRef(selectedRange)
  if (selectedRange) rangeRef.current = selectedRange
  const cardRef = useRef<HTMLDivElement>(null)
  const expandRef = useRef<HTMLButtonElement>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restoreCheckedRef = useRef(false)
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const canFallback = !!(fallbacks && rangeRef.current && !manualInspiration)

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    },
    [],
  )

  // ── funnel metrics ───────────────────────────────────────────────────
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
  // (navigation/SW restart — explicit abandon clears it, see onChoose).
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

  const recoverable: RecoverableInput = useMemo(
    () => ({
      kindLabel: KIND_LABELS[form.kind],
      content: form.content,
      excerpt: manualInspiration ? form.background : form.excerpt,
      sourceUrl: form.sourceUrl,
      sourceTitle: form.sourceTitle,
      guess: form.guess,
      summary: form.summary,
      notes: form.notes,
      use: form.use,
      tags: form.tags,
      details: detailEntries(form.kind, form.detail),
    }),
    [form, manualInspiration],
  )

  const dirty = useMemo(
    () =>
      hasTypedInput(recoverable) ||
      !!form.background.trim() ||
      form.highlight ||
      form.content.trim() !== draft.content.trim() ||
      form.excerpt !== draft.excerpt ||
      form.kind !== draft.suggestedKind,
    [recoverable, form, draft],
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
  const finishExit = useCallback(
    (fallback: ExitFallback) => {
      recordMetric('exited', step, { hadInput: dirty, fallback })
      clearDraft()
    },
    [clearDraft, dirty, step],
  )

  const requestClose = useCallback(() => {
    if (saveState === 'saving') return
    if (savedKind || fallbackDone) {
      onClose()
      return
    }
    if (dirty) {
      setCloseError('')
      setCloseDialogOpen(true)
      return
    }
    finishExit('none')
    onClose()
  }, [dirty, onClose, saveState, savedKind, fallbackDone, finishExit])

  /** Converts the abandoned/failed capture into a Highlight or Clip that keeps the typed text as its note. */
  const convertTo = useCallback(
    async (target: 'highlight' | 'clip'): Promise<boolean> => {
      const range = rangeRef.current
      if (!fallbacks || !range) return false
      const note = fallbackNote(recoverable)
      try {
        const saved = target === 'highlight' ? await fallbacks.highlight(range.cloneRange(), note) : await fallbacks.clip(range.cloneRange(), note)
        if (!saved) return false
      } catch (error) {
        Logger.warn(`[CaptureModal] 改存为${target} failed:`, error)
        return false
      }
      finishExit(target)
      setCloseDialogOpen(false)
      setFallbackDone(target)
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
      closeTimerRef.current = setTimeout(onClose, 1200)
      return true
    },
    [fallbacks, recoverable, finishExit, onClose],
  )

  const onChoose = useCallback(
    async (choice: CloseChoice) => {
      if (choice === 'continue') {
        setCloseDialogOpen(false)
        return
      }
      if (choice === 'discard') {
        finishExit('none')
        setCloseDialogOpen(false)
        onClose()
        return
      }
      setCloseBusy(true)
      setCloseError('')
      const ok = await convertTo(choice)
      setCloseBusy(false)
      if (!ok) setCloseError(`改存为${choice === 'highlight' ? '高亮' : '剪藏'}失败，输入仍然保留，可继续编辑或重试。`)
    },
    [convertTo, finishExit, onClose],
  )

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (closeDialogOpen) setCloseDialogOpen(false)
        else requestClose()
        return
      }
      // Cmd/Ctrl+Enter advances or saves once the current step passes validation (PRD §10).
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !closeDialogOpen && !collapsed) {
        e.preventDefault()
        if (step === 'apply') void doSave(false)
        else if (canAdvance) goNext()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestClose, closeDialogOpen, collapsed, step, form])

  // ── 回到原文: collapse into a bottom bar, scroll to and mark the selection ──
  const rangeAvailable = !!rangeRef.current
  const backToSource = () => {
    if (rangeRef.current) setCollapsed(true)
    else if (/^https?:/i.test(form.sourceUrl)) window.open(form.sourceUrl, '_blank', 'noopener')
  }

  useEffect(() => {
    if (!collapsed) return
    const range = rangeRef.current
    if (!range) return
    const node = range.startContainer
    const anchor = node instanceof Element ? node : node.parentElement
    anchor?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    // CSS Custom Highlight API: marks the selection without touching the page DOM.
    const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
    const HighlightCtor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight
    if (registry && HighlightCtor) registry.set('ann-capture-selection', new HighlightCtor(range))
    expandRef.current?.focus()
    return () => {
      registry?.delete('ann-capture-selection')
    }
  }, [collapsed])

  useFocusTrap(cardRef, !collapsed && !closeDialogOpen && !savedKind && !fallbackDone)

  const confirmVerified = () => {
    setField('verified', {
      confirmedAt: Date.now(),
      source: form.verifySource,
      ...(form.summary.trim() ? { summary: form.summary.trim() } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    })
  }

  const changeVerifySource = (source: VerifiedSource) => {
    // Changing the verification source invalidates the confirmation (fragments.md §7).
    setForm(prev => ({ ...prev, verifySource: source, verified: null }))
  }

  // ── save ─────────────────────────────────────────────────────────────
  const buildInput = (): SaveFragmentInput => {
    // Manual inspiration: excerpt starts with the user's own words, then the
    // trigger background (fragments.md §7 — excerpt always contains content).
    const excerpt = manualInspiration ? `${form.content.trim()}\n${form.background.trim()}` : form.excerpt.trim() || form.content.trim()
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
      tags: form.tags
        .split(/[,，]/)
        .map(t => t.trim())
        .filter(Boolean),
      detail: buildDetail(form.kind, form.detail),
    }
  }

  /** Creates the optional highlight AFTER the fragment is saved; failure never rolls the fragment back. */
  const createOptionalHighlight = async (): Promise<boolean> => {
    if (!rangeRef.current) return true
    try {
      const highlightId = await createHighlight(rangeRef.current.cloneRange())
      return !!highlightId
    } catch (err) {
      Logger.warn('[CaptureModal] Optional highlight failed (fragment kept):', err)
      return false
    }
  }

  const doSave = async (force = false) => {
    if (saveState === 'saving' || useInvalid || detailInvalid || !form.verified) return
    setSaveState('saving')
    setSaveError('')
    setCopied('idle')
    try {
      const response = await MessageUtils.sendMessage({ type: 'SAVE_FRAGMENT', input: buildInput(), force })
      if (!response.success) throw new Error(response.error || '保存失败')
      const data = (response.data ?? {}) as { fragment?: FragmentRecord; duplicateOf?: FragmentRecord }
      if (!data.fragment && data.duplicateOf) {
        setDuplicateOf(data.duplicateOf)
        setSaveState('idle')
        return
      }
      const highlightOk = form.highlight && rangeRef.current ? await createOptionalHighlight() : true
      setDuplicateOf(null)
      setSavedKind(form.kind)
      setHighlightFailed(!highlightOk)
      recordMetric('saved')
      setSaveState('idle')
      clearDraft()
      // A failed highlight keeps the window open with a retry; otherwise ~700ms success state.
      if (highlightOk) {
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
        closeTimerRef.current = setTimeout(onClose, 700)
      }
    } catch (error) {
      setSaveState('error')
      setSaveError(describeSaveError(error instanceof Error ? error.message : '保存失败'))
    }
  }

  const retryHighlight = async () => {
    if (await createOptionalHighlight()) {
      setHighlightFailed(false)
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
      closeTimerRef.current = setTimeout(onClose, 700)
    }
  }

  const copyInput = async () => {
    setCopied((await copyText(copyableInput(recoverable))) ? 'ok' : 'failed')
  }

  const openLibrary = (params?: { export?: '1' }) => {
    void MessageUtils.sendMessage({ type: 'OPEN_EXTENSION_PAGE', page: 'library', params })
  }

  // ── success / fallback screens (PRD §4.7) ────────────────────────────
  if (savedKind) {
    return (
      <ModalShell>
        <div style={styles.success} data-ann-ui="capture-modal" role="status">
          <div>已保存为「{KIND_LABELS[savedKind]}」</div>
          {highlightFailed && (
            <div style={{ fontSize: '13px' }} data-testid="highlight-failed">
              碎片已保存，但创建高亮失败。
            </div>
          )}
          <div style={styles.successActions}>
            {highlightFailed && (
              <button style={styles.successLink} onClick={retryHighlight} data-testid="retry-highlight">
                重试高亮
              </button>
            )}
            <button
              style={styles.successLink}
              onClick={() => {
                openLibrary()
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

  if (fallbackDone) {
    return (
      <ModalShell>
        <div style={styles.success} data-ann-ui="capture-modal" role="status" data-testid="fallback-done">
          已改存为{fallbackDone === 'highlight' ? '高亮' : '剪藏'} · 不进入复习，输入已作为备注保留
        </div>
      </ModalShell>
    )
  }

  if (collapsed) {
    return (
      <ModalShell collapsed>
        <div style={styles.collapsedBar} data-ann-ui="capture-modal" role="region" aria-label="采集窗口已收起" data-testid="capture-collapsed">
          <span style={{ flex: 1 }}>已回到原文 · 已填写的内容都保留着</span>
          <button ref={expandRef} style={styles.primaryBtn} onClick={() => setCollapsed(false)} data-testid="capture-expand">
            展开
          </button>
        </div>
      </ModalShell>
    )
  }

  const windowTitle = manualInspiration ? '新建灵感' : form.sourceTitle || draft.sourceHost
  const verifyOpen = step === 'verify'

  return (
    <ModalShell>
      <div
        ref={cardRef}
        style={styles.card}
        data-ann-ui="capture-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${windowTitle}，${KIND_LABELS[form.kind]}，当前步骤：${STEP_LABELS[step]}`}
        tabIndex={-1}
      >
        {/* header: source title + host + 回到原文 (PRD §4.1) */}
        <div style={styles.header}>
          <span style={styles.title} title={windowTitle}>
            {windowTitle}
          </span>
          <button style={styles.closeBtn} onClick={requestClose} title="关闭 (Esc)" aria-label="关闭">
            ✕
          </button>
        </div>
        <div style={styles.sourceLine}>
          {!manualInspiration && <span style={styles.host}>{draft.sourceHost}</span>}
          {!manualInspiration && (rangeAvailable || /^https?:/i.test(form.sourceUrl)) && (
            <button style={styles.linkBtn} onClick={backToSource} data-testid="back-to-source" title={rangeAvailable ? '收起窗口并回到页面中的选区' : '在新标签页打开来源'}>
              回到原文
            </button>
          )}
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
        </div>

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
              style={{ ...styles.textarea, fontSize: '12px' }}
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
          {TEXT_KINDS.map(kind => (
            <button
              key={kind}
              role="radio"
              aria-checked={form.kind === kind}
              style={{
                ...styles.kindChip,
                background: form.kind === kind ? 'var(--ann-accent)' : 'var(--ann-surface-alt)',
                color: form.kind === kind ? 'var(--ann-accent-contrast)' : 'var(--ann-text)',
              }}
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

        {/* step indicator: 理解（仅深度模式）> 核验 > 应用 */}
        <ol style={{ ...styles.stepper, listStyle: 'none', margin: 0, padding: 0 }} aria-label="步骤">
          {steps.map((s, i) => (
            <li key={s} aria-current={s === step ? 'step' : undefined} style={{ fontWeight: s === step ? 700 : 400, color: s === step ? 'var(--ann-text)' : 'var(--ann-muted)' }}>
              {i > 0 && <span aria-hidden="true"> › </span>}
              {s === step ? '● ' : ''}
              {STEP_LABELS[s]}
              {s === 'interpret' ? '（深度模式）' : ''}
            </li>
          ))}
        </ol>

        {/* ── Step: 理解 ── */}
        {step === 'interpret' && (
          <div style={styles.stepBody}>
            <label style={styles.label}>{prompts.interpret}</label>
            <textarea style={styles.textarea} rows={3} value={form.guess} onChange={e => setField('guess', e.target.value)} placeholder="写下当前的解释、判断或问题（可留空）" />
          </div>
        )}

        {/* ── Step: 核验（不可跳过，processing.md §2） ── */}
        {verifyOpen && (
          <div style={styles.stepBody}>
            <div style={styles.stepTitle}>{prompts.verifyHint}</div>
            {manualInspiration ? (
              <div style={styles.excerpt}>
                <div style={styles.compareLabel}>触发背景（区分观察与推测）</div>
                {form.guess.trim() && <div style={{ marginBottom: '6px' }}>你的理解：{form.guess}</div>}
                <textarea
                  style={styles.inlineTextarea}
                  rows={2}
                  value={form.background}
                  onChange={e => setField('background', e.target.value)}
                  placeholder="什么触发了这个想法？（必填）"
                />
              </div>
            ) : (
              <div style={form.guess.trim() ? styles.compareGrid : undefined} data-testid="verify-compare">
                {form.guess.trim() && (
                  <div style={styles.excerpt}>
                    <div style={styles.compareLabel}>你的理解</div>
                    {form.guess}
                  </div>
                )}
                <ContextCard excerpt={form.excerpt} content={form.content} />
              </div>
            )}

            {/* summary / notes are optional and folded by default — fewer fields at capture time (H-01) */}
            <div style={styles.optionalRow}>
              {!(summaryToggled || form.summary) && (
                <button style={styles.optionalBtn} onClick={() => setSummaryToggled(true)} data-testid="add-summary">
                  ＋ 摘要（可选）
                </button>
              )}
              {!(notesToggled || form.notes) && (
                <button style={styles.optionalBtn} onClick={() => setNotesToggled(true)} data-testid="add-notes">
                  ＋ 备注（可选）
                </button>
              )}
            </div>
            {(summaryToggled || form.summary) && (
              <>
                <label style={styles.label}>摘要（可选）</label>
                <textarea
                  style={styles.textarea}
                  rows={2}
                  value={form.summary}
                  onChange={e => setField('summary', e.target.value)}
                  placeholder="核对后的结论；仅确认原文时可留空"
                  data-testid="verify-summary"
                />
              </>
            )}
            {(notesToggled || form.notes) && (
              <>
                <label style={styles.label}>备注（可选）</label>
                <textarea style={styles.textarea} rows={2} value={form.notes} onChange={e => setField('notes', e.target.value)} data-testid="verify-notes" />
              </>
            )}

            <div style={styles.verifyRow}>
              <label style={styles.confirmLabel}>
                <input type="checkbox" checked={!!form.verified} onChange={e => (e.target.checked ? confirmVerified() : setField('verified', null))} data-testid="verify-confirm" />
                确认已核对
              </label>
              <span style={styles.muted}>核验来源：</span>
              {!manualInspiration && (
                <label style={styles.radioLabel}>
                  <input type="radio" name="ann-verify-source" checked={form.verifySource === 'source-material'} onChange={() => changeVerifySource('source-material')} />
                  原文
                </label>
              )}
              <label style={styles.radioLabel}>
                <input type="radio" name="ann-verify-source" checked={form.verifySource === 'manual'} onChange={() => changeVerifySource('manual')} />
                手工
              </label>
            </div>
            {form.verified && (
              <div style={styles.verifiedNote} role="status">
                已确认核对（{VERIFIED_SOURCE_LABELS[form.verified.source]}，{new Date(form.verified.confirmedAt).toLocaleTimeString()}
                ）。修改内容、语境、来源、类型或核验来源后需重新确认。
              </div>
            )}
          </div>
        )}

        {/* ── Step: 应用（硬门槛） ── */}
        {step === 'apply' && (
          <div style={styles.stepBody}>
            <label style={styles.label}>{prompts.apply}</label>
            <textarea
              style={{ ...styles.textarea, borderColor: useInvalid ? 'var(--ann-danger)' : undefined }}
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

            <DetailForm kind={form.kind} detail={form.detail} onChange={next => setField('detail', next)} />
            <input style={styles.tagInput} placeholder="标签（逗号分隔，可选）" value={form.tags} onChange={e => setField('tags', e.target.value)} />

            {duplicateOf && (
              <div style={styles.errorBanner}>
                <span>已保存过相同内容（同语境，{new Date(duplicateOf.createdAt).toLocaleDateString()}）。仍要保存为新记录吗？</span>
                <button style={styles.miniBtn} onClick={() => doSave(true)}>
                  仍要保存
                </button>
              </div>
            )}
            {saveState === 'error' && (
              <div style={{ ...styles.errorBanner, flexDirection: 'column', alignItems: 'stretch' }} role="alert" data-testid="save-failed">
                <span>保存失败：{saveError}。输入已保留，窗口不会关闭。</span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button style={styles.miniBtn} onClick={() => doSave(false)} data-testid="save-retry">
                    重试
                  </button>
                  <button style={styles.miniBtn} onClick={copyInput} data-testid="save-copy-input">
                    复制我的输入
                  </button>
                  {canFallback && (
                    <button style={styles.miniBtn} onClick={() => void convertTo('clip')} data-testid="save-as-clip">
                      改存为剪藏
                    </button>
                  )}
                  <button style={styles.miniBtn} onClick={() => openLibrary({ export: '1' })} data-testid="save-export">
                    导出内容
                  </button>
                </div>
                {copied !== 'idle' && <span role="status">{copied === 'ok' ? '已复制到剪贴板。' : '复制失败，请手动选中文字复制。'}</span>}
              </div>
            )}
          </div>
        )}

        {/* footer: 同时高亮原文 / 取消 / 下一步 (PRD §4.1) */}
        <div style={styles.footer}>
          {!manualInspiration && rangeAvailable && (
            <label style={styles.checkRow}>
              <input type="checkbox" checked={form.highlight} onChange={e => setField('highlight', e.target.checked)} data-testid="also-highlight" />
              同时高亮原文
            </label>
          )}
          <span style={styles.footerSpacer} />
          {stepIndex > 0 && (
            <button style={styles.ghostBtn} onClick={goBack} disabled={saveState === 'saving'} data-testid="modal-back">
              返回
            </button>
          )}
          <button style={styles.ghostBtn} onClick={requestClose} disabled={saveState === 'saving'} data-testid="modal-cancel">
            取消
          </button>
          {step === 'apply' ? (
            <button
              style={{ ...styles.primaryBtn, opacity: !useInvalid && !detailInvalid && form.verified && saveState !== 'saving' ? 1 : 0.5 }}
              onClick={() => doSave(false)}
              disabled={!!useInvalid || !!detailInvalid || !form.verified || saveState === 'saving'}
              data-testid="save-fragment"
            >
              {saveState === 'saving' ? '保存中…' : '保存到碎片库'}
            </button>
          ) : (
            <button style={{ ...styles.primaryBtn, opacity: canAdvance ? 1 : 0.5 }} onClick={goNext} disabled={!canAdvance} data-testid="modal-next">
              下一步
            </button>
          )}
          <span style={styles.muted} aria-hidden="true">
            {SHORTCUT}
          </span>
        </div>
      </div>

      {closeDialogOpen && <CloseDialog canFallback={canFallback} busy={closeBusy} error={closeError} onChoose={onChoose} />}
    </ModalShell>
  )
}

/** Source-context card of the verification step: the selection is marked, the surrounding sentences fade. */
function ContextCard({ excerpt, content }: { excerpt: string; content: string }) {
  const parts = splitExcerpt(excerpt, content)
  return (
    <div style={styles.contextCard} aria-label="来源语境" data-testid="context-card">
      <div style={styles.compareLabel}>来源语境</div>
      {parts ? (
        <>
          <span style={styles.contextFaded}>{parts.before}</span>
          <mark style={styles.contextMark}>{parts.match}</mark>
          <span style={styles.contextFaded}>{parts.after}</span>
        </>
      ) : (
        excerpt
      )}
    </div>
  )
}

function ModalShell({ children, collapsed }: { children: React.ReactNode; collapsed?: boolean }) {
  return (
    <div data-ann-ui="capture-modal-overlay" data-ann-theme="" style={collapsed ? { display: 'contents' } : styles.overlay}>
      <ThemeStyle />
      {children}
    </div>
  )
}
