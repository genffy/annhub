/**
 * CaptureModal — the L2 three-step lock (docs/v2/processing.md §2, extension
 * PRD §4). Deep mode: understand -> verify -> apply; standard mode: verify -> apply.
 *
 * Verification is an explicit user confirmation (time + source recorded,
 * summary/notes optional). Editing content / excerpt / source / kind or the
 * verification source after confirming clears the confirmation. Application is
 * a hard gate: non-empty and not a copy of content/excerpt — no fixed
 * language token thresholds.
 *
 * Failure rules (processing.md §6, extension.md §9): save failure keeps every
 * input and offers retry / copy my input / save as clip / export; closing with
 * input asks keep editing / save as highlight / save as clip / discard; going back a step preserves all
 * content. Short-lived form state persists to chrome.storage.session (PRD §9)
 * keyed by tab + source url.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FragmentRecord, VerifiedResult, VerifiedSource } from '../../../learning-core/types'
import type { SaveFragmentInput } from '../../../types/messages'
import MessageUtils from '../../../utils/message'
import { Logger } from '../../../utils/logger'
import { kindLabel, TEXT_KINDS } from '../../../utils/kind-labels'
import { uiText } from '../../../utils/ui-text'
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
  /** Range clone used for “Also highlight the source”, “Back to source” and the save-as exits; null for library-origin drafts. */
  selectedRange: Range | null
  createHighlight: (range: Range) => Promise<string | null>
  /** In-page safe exits; absent for library-origin drafts (no page selection to convert). */
  fallbacks?: CaptureFallbacks
  onClose: () => void
  /** True for the no-selection inspiration form (extension PRD §2.2). */
  manualInspiration?: boolean
}

type Step = 'interpret' | 'verify' | 'apply'

const stepLabel = (step: Step) => uiText(`capture.step.${step}`)

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
  /** The source the next confirmation will record (the source text or a manual check). */
  verifySource: VerifiedSource
  use: string
  tags: string
  highlight: boolean
  detail: DetailFormState
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
  if (error.startsWith('QUOTA_EXCEEDED')) return uiText('capture.error.quota')
  if (error.startsWith('ASSET_MISSING')) return uiText('capture.error.assetMissing')
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
  // Deep mode is a global preference that one capture can override (PRD §4.2); switching keeps the content.
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
      kindLabel: kindLabel(form.kind),
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

  const prompt = (part: 'interpret' | 'apply' | 'verifyHint') => uiText(`capture.prompt.${form.kind}.${part}`)

  // Editing protected fields clears the confirmation (fragments.md §7).
  const editProtected = () => {
    setForm(prev => (prev.verified ? { ...prev, verified: null } : prev))
  }

  const useInvalid = (() => {
    const use = form.use.trim()
    if (!use) return form.use ? uiText('capture.use.empty') : ''
    if (use === form.content.trim()) return uiText('capture.use.repeatsContent')
    if (use === form.excerpt.trim()) return uiText('capture.use.repeatsContext')
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
        Logger.warn(`[CaptureModal] save as ${target} failed:`, error)
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
      if (!ok) setCloseError(uiText(choice === 'highlight' ? 'capture.exit.highlightFailed' : 'capture.exit.clipFailed'))
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
    if (stepIndex > 0) setStepIndex(stepIndex - 1) // going back keeps all content
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

  // ── Back to source: collapse into a bottom bar, scroll to and mark the selection ──
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
      if (!response.success) throw new Error(response.error || uiText('capture.error.saveFailed'))
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
      setSaveError(describeSaveError(error instanceof Error ? error.message : uiText('capture.error.saveFailed')))
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
          <div>{uiText('capture.saved', { kind: kindLabel(savedKind) })}</div>
          {highlightFailed && (
            <div style={{ fontSize: '13px' }} data-testid="highlight-failed">
              {uiText('capture.highlightFailed')}
            </div>
          )}
          <div style={styles.successActions}>
            {highlightFailed && (
              <button style={styles.successLink} onClick={retryHighlight} data-testid="retry-highlight">
                {uiText('capture.retryHighlight')}
              </button>
            )}
            <button
              style={styles.successLink}
              onClick={() => {
                openLibrary()
                onClose()
              }}
            >
              {uiText('capture.viewInLibrary')}
            </button>
            <button style={styles.successPrimary} onClick={onClose}>
              {uiText('capture.keepReading')}
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
          {uiText(fallbackDone === 'highlight' ? 'capture.exit.highlightDone' : 'capture.exit.clipDone')}
        </div>
      </ModalShell>
    )
  }

  if (collapsed) {
    return (
      <ModalShell collapsed>
        <div style={styles.collapsedBar} data-ann-ui="capture-modal" role="region" aria-label={uiText('capture.collapsed.aria')} data-testid="capture-collapsed">
          <span style={{ flex: 1 }}>{uiText('capture.collapsed.text')}</span>
          <button ref={expandRef} style={styles.primaryBtn} onClick={() => setCollapsed(false)} data-testid="capture-expand">
            {uiText('capture.collapsed.expand')}
          </button>
        </div>
      </ModalShell>
    )
  }

  const windowTitle = manualInspiration ? uiText('capture.newInspiration') : form.sourceTitle || draft.sourceHost
  const verifyOpen = step === 'verify'

  return (
    <ModalShell>
      <div
        ref={cardRef}
        style={styles.card}
        data-ann-ui="capture-modal"
        role="dialog"
        aria-modal="true"
        aria-label={uiText('capture.aria.window', { title: windowTitle, kind: kindLabel(form.kind), step: stepLabel(step) })}
        tabIndex={-1}
      >
        {/* header: source title + host + back to source (PRD §4.1) */}
        <div style={styles.header}>
          <span style={styles.title} title={windowTitle}>
            {windowTitle}
          </span>
          <button style={styles.closeBtn} onClick={requestClose} title={uiText('capture.closeButton.title')} aria-label={uiText('common.close')}>
            ✕
          </button>
        </div>
        <div style={styles.sourceLine}>
          {!manualInspiration && <span style={styles.host}>{draft.sourceHost}</span>}
          {!manualInspiration && (rangeAvailable || /^https?:/i.test(form.sourceUrl)) && (
            <button
              style={styles.linkBtn}
              onClick={backToSource}
              data-testid="back-to-source"
              title={uiText(rangeAvailable ? 'capture.backToSource.inPage' : 'capture.backToSource.newTab')}
            >
              {uiText('capture.backToSource')}
            </button>
          )}
          {!manualInspiration && (
            <button
              style={styles.modeToggle}
              onClick={() => setDeepOverride(prev => (prev === null ? !effectiveDeep : !prev))}
              title={uiText('capture.mode.hint')}
              data-testid="deep-mode-toggle"
            >
              {uiText(effectiveDeep ? 'capture.mode.toStandard' : 'capture.mode.toDeep')}
            </button>
          )}
        </div>

        {/* body: editable selection + context (PRD §5.4 corrections allowed) */}
        <label style={styles.label}>{uiText(manualInspiration ? 'capture.label.idea' : 'capture.label.content')}</label>
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
            <label style={styles.label}>{uiText('capture.label.context')}</label>
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
        <div style={styles.kindRow} role="radiogroup" aria-label={uiText('capture.label.kind')}>
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
              {kindLabel(kind)}
            </button>
          ))}
        </div>
        {restored && <div style={styles.restoredNote}>{uiText('capture.restored')}</div>}

        {/* step indicator: understand (deep mode only) > verify > apply */}
        <ol style={{ ...styles.stepper, listStyle: 'none', margin: 0, padding: 0 }} aria-label={uiText('capture.steps.aria')}>
          {steps.map((s, i) => (
            <li key={s} aria-current={s === step ? 'step' : undefined} style={{ fontWeight: s === step ? 700 : 400, color: s === step ? 'var(--ann-text)' : 'var(--ann-muted)' }}>
              {i > 0 && <span aria-hidden="true"> › </span>}
              {s === step ? '● ' : ''}
              {stepLabel(s)}
              {s === 'interpret' ? uiText('capture.step.deepOnly') : ''}
            </li>
          ))}
        </ol>

        {/* ── Step: understand ── */}
        {step === 'interpret' && (
          <div style={styles.stepBody}>
            <label style={styles.label}>{prompt('interpret')}</label>
            <textarea style={styles.textarea} rows={3} value={form.guess} onChange={e => setField('guess', e.target.value)} placeholder={uiText('capture.interpret.placeholder')} />
          </div>
        )}

        {/* ── Step: verify (cannot be skipped, processing.md §2) ── */}
        {verifyOpen && (
          <div style={styles.stepBody}>
            <div style={styles.stepTitle}>{prompt('verifyHint')}</div>
            {manualInspiration ? (
              <div style={styles.excerpt}>
                <div style={styles.compareLabel}>{uiText('capture.verify.background')}</div>
                {form.guess.trim() && <div style={{ marginBottom: '6px' }}>{uiText('capture.verify.yourGuessInline', { guess: form.guess })}</div>}
                <textarea
                  style={styles.inlineTextarea}
                  rows={2}
                  value={form.background}
                  onChange={e => setField('background', e.target.value)}
                  placeholder={uiText('capture.verify.backgroundPlaceholder')}
                />
              </div>
            ) : (
              <div style={form.guess.trim() ? styles.compareGrid : undefined} data-testid="verify-compare">
                {form.guess.trim() && (
                  <div style={styles.excerpt}>
                    <div style={styles.compareLabel}>{uiText('capture.verify.yourGuess')}</div>
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
                  {uiText('capture.verify.addSummary')}
                </button>
              )}
              {!(notesToggled || form.notes) && (
                <button style={styles.optionalBtn} onClick={() => setNotesToggled(true)} data-testid="add-notes">
                  {uiText('capture.verify.addNotes')}
                </button>
              )}
            </div>
            {(summaryToggled || form.summary) && (
              <>
                <label style={styles.label}>{uiText('capture.verify.summary')}</label>
                <textarea
                  style={styles.textarea}
                  rows={2}
                  value={form.summary}
                  onChange={e => setField('summary', e.target.value)}
                  placeholder={uiText('capture.verify.summaryPlaceholder')}
                  data-testid="verify-summary"
                />
              </>
            )}
            {(notesToggled || form.notes) && (
              <>
                <label style={styles.label}>{uiText('capture.verify.notes')}</label>
                <textarea style={styles.textarea} rows={2} value={form.notes} onChange={e => setField('notes', e.target.value)} data-testid="verify-notes" />
              </>
            )}

            <div style={styles.verifyRow}>
              <label style={styles.confirmLabel}>
                <input type="checkbox" checked={!!form.verified} onChange={e => (e.target.checked ? confirmVerified() : setField('verified', null))} data-testid="verify-confirm" />
                {uiText('capture.verify.confirm')}
              </label>
              <span style={styles.muted}>{uiText('capture.verify.source')}</span>
              {!manualInspiration && (
                <label style={styles.radioLabel}>
                  <input type="radio" name="ann-verify-source" checked={form.verifySource === 'source-material'} onChange={() => changeVerifySource('source-material')} />
                  {uiText('capture.verify.source.original')}
                </label>
              )}
              <label style={styles.radioLabel}>
                <input type="radio" name="ann-verify-source" checked={form.verifySource === 'manual'} onChange={() => changeVerifySource('manual')} />
                {uiText('capture.verify.source.manual')}
              </label>
            </div>
            {form.verified && (
              <div style={styles.verifiedNote} role="status">
                {uiText('capture.verified.note', { source: uiText(`capture.verified.${form.verified.source}`), time: new Date(form.verified.confirmedAt).toLocaleTimeString() })}
              </div>
            )}
          </div>
        )}

        {/* ── Step: apply (hard gate) ── */}
        {step === 'apply' && (
          <div style={styles.stepBody}>
            <label style={styles.label}>{prompt('apply')}</label>
            <textarea
              style={{ ...styles.textarea, borderColor: useInvalid ? 'var(--ann-danger)' : undefined }}
              rows={3}
              value={form.use}
              onChange={e => setField('use', e.target.value)}
              placeholder={uiText('capture.apply.placeholder')}
            />
            {useInvalid && <div style={styles.useError}>{useInvalid}</div>}
            {detailInvalid && (
              <div style={styles.useError} data-testid="detail-invalid">
                {detailInvalid}
              </div>
            )}

            <DetailForm kind={form.kind} detail={form.detail} onChange={next => setField('detail', next)} />
            <input style={styles.tagInput} placeholder={uiText('capture.tags.placeholder')} value={form.tags} onChange={e => setField('tags', e.target.value)} />

            {duplicateOf && (
              <div style={styles.errorBanner}>
                <span>{uiText('capture.duplicate', { date: new Date(duplicateOf.createdAt).toLocaleDateString() })}</span>
                <button style={styles.miniBtn} onClick={() => doSave(true)}>
                  {uiText('capture.duplicate.force')}
                </button>
              </div>
            )}
            {saveState === 'error' && (
              <div style={{ ...styles.errorBanner, flexDirection: 'column', alignItems: 'stretch' }} role="alert" data-testid="save-failed">
                <span>{uiText('capture.saveFailed', { error: saveError })}</span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button style={styles.miniBtn} onClick={() => doSave(false)} data-testid="save-retry">
                    {uiText('common.retry')}
                  </button>
                  <button style={styles.miniBtn} onClick={copyInput} data-testid="save-copy-input">
                    {uiText('capture.copyInput')}
                  </button>
                  {canFallback && (
                    <button style={styles.miniBtn} onClick={() => void convertTo('clip')} data-testid="save-as-clip">
                      {uiText('capture.asClip')}
                    </button>
                  )}
                  <button style={styles.miniBtn} onClick={() => openLibrary({ export: '1' })} data-testid="save-export">
                    {uiText('capture.exportContent')}
                  </button>
                </div>
                {copied !== 'idle' && <span role="status">{uiText(copied === 'ok' ? 'capture.copied' : 'capture.copyFailed')}</span>}
              </div>
            )}
          </div>
        )}

        {/* footer: also highlight / cancel / next (PRD §4.1) */}
        <div style={styles.footer}>
          {!manualInspiration && rangeAvailable && (
            <label style={styles.checkRow}>
              <input type="checkbox" checked={form.highlight} onChange={e => setField('highlight', e.target.checked)} data-testid="also-highlight" />
              {uiText('capture.alsoHighlight')}
            </label>
          )}
          <span style={styles.footerSpacer} />
          {stepIndex > 0 && (
            <button style={styles.ghostBtn} onClick={goBack} disabled={saveState === 'saving'} data-testid="modal-back">
              {uiText('capture.back')}
            </button>
          )}
          <button style={styles.ghostBtn} onClick={requestClose} disabled={saveState === 'saving'} data-testid="modal-cancel">
            {uiText('common.cancel')}
          </button>
          {step === 'apply' ? (
            <button
              style={{ ...styles.primaryBtn, opacity: !useInvalid && !detailInvalid && form.verified && saveState !== 'saving' ? 1 : 0.5 }}
              onClick={() => doSave(false)}
              disabled={!!useInvalid || !!detailInvalid || !form.verified || saveState === 'saving'}
              data-testid="save-fragment"
            >
              {uiText(saveState === 'saving' ? 'capture.saving' : 'capture.saveToLibrary')}
            </button>
          ) : (
            <button style={{ ...styles.primaryBtn, opacity: canAdvance ? 1 : 0.5 }} onClick={goNext} disabled={!canAdvance} data-testid="modal-next">
              {uiText('capture.next')}
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
    <div style={styles.contextCard} aria-label={uiText('capture.verify.context')} data-testid="context-card">
      <div style={styles.compareLabel}>{uiText('capture.verify.context')}</div>
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
