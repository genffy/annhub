/**
 * MediaClip capture (R4.2, docs/v2/fragments.md 'media-clip'): grab a time
 * range from the page's <video>/<audio>, write the transcript by hand
 * (LLM optional later), and save a media-clip Fragment with a time locator.
 * Same verification discipline as the text capture modal: explicit
 * verification confirmation, non-empty “Apply” that is not a copy of content/excerpt.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FragmentRecord } from '../../../learning-core/types'
import type { SaveFragmentInput } from '../../../types/messages'
import MessageUtils from '../../../utils/message'
import { uiText } from '../../../utils/ui-text'
import type { MediaTarget } from './detect'
import CloseDialog, { type CloseChoice } from '../capture/CloseDialog'
import { ThemeStyle } from '../capture/theme'
import { useFocusTrap } from '../capture/use-focus-trap'

export interface MediaCaptureModalProps {
  targets: MediaTarget[]
  sourceUrl: string
  sourceTitle: string
  onClose: () => void
}

const fmt = (ms: number): string => {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function MediaCaptureModal({ targets, sourceUrl, sourceTitle, onClose }: MediaCaptureModalProps) {
  const [targetIndex, setTargetIndex] = useState(0)
  const target = targets[targetIndex]

  const [startMs, setStartMs] = useState<number | null>(null)
  const [endMs, setEndMs] = useState<number | null>(null)
  const [transcript, setTranscript] = useState('')
  const [summary, setSummary] = useState('')
  const [contextNote, setContextNote] = useState('')
  const [verified, setVerified] = useState<{ confirmedAt: number; source: 'source-material' | 'manual' } | null>(null)
  const [useText, setUse] = useState('')
  const [tags, setTags] = useState('')
  const [duplicateOf, setDuplicateOf] = useState<FragmentRecord | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  useFocusTrap(cardRef, !saved && !closeDialogOpen)

  useEffect(() => {
    MessageUtils.sendMessage({ type: 'RECORD_CAPTURE_METRIC', event: 'modal-opened', step: 'media' }).catch(() => {})
  }, [])

  const rangeValid = startMs !== null && endMs !== null && endMs > startMs
  const content = summary.trim()
  const useInvalid = useMemo(() => {
    const use = useText.trim()
    if (!use) return useText ? uiText('capture.use.empty') : ''
    if (content && use === content) return uiText('media.use.repeatsSummary')
    return ''
  }, [useText, content])

  const mark = async (which: 'start' | 'end') => {
    if (!target) return
    const ms = await readCurrentTimeMs(target)
    if (which === 'start') setStartMs(ms)
    else setEndMs(ms)
  }

  const dirty = !!(transcript.trim() || summary.trim() || useText.trim() || startMs !== null)

  const exit = () => {
    MessageUtils.sendMessage({ type: 'RECORD_CAPTURE_METRIC', event: 'exited', step: 'media', hadInput: dirty, fallback: 'none' }).catch(() => {})
    onClose()
  }

  // Closing with input asks first (extension.md §4.1); a media range has no page selection to convert, so only keep editing / discard.
  const requestClose = () => {
    if (saveState === 'saving') return
    if (saved) return onClose()
    if (dirty) return setCloseDialogOpen(true)
    exit()
  }

  const onChoose = (choice: CloseChoice) => {
    setCloseDialogOpen(false)
    if (choice === 'discard') exit()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (closeDialogOpen) setCloseDialogOpen(false)
        else requestClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveState, saved, transcript, summary, useText, startMs, closeDialogOpen])

  const save = async (force = false) => {
    if (saveState === 'saving' || !rangeValid || !content || !verified || useInvalid) return
    setSaveState('saving')
    setSaveError('')
    try {
      const excerpt = `${content}\n${uiText('media.excerptMarker', { range: `${fmt(startMs!)}–${fmt(endMs!)}` })}${transcript.trim() ? `\n${transcript.trim()}` : ''}${contextNote.trim() ? `\n${contextNote.trim()}` : ''}`
      const input: SaveFragmentInput = {
        kind: 'media-clip',
        content,
        excerpt,
        sourceUrl,
        sourceTitle: sourceTitle || undefined,
        locator: { type: 'time', startMs: startMs!, endMs: endMs! },
        verified: { ...verified },
        use: useText.trim(),
        tags: tags
          .split(/[,，]/)
          .map(t => t.trim())
          .filter(Boolean),
        detail: { startMs: startMs!, endMs: endMs! },
      }
      const response = await MessageUtils.sendMessage({ type: 'SAVE_FRAGMENT', input, force })
      if (!response.success) throw new Error(response.error || uiText('capture.error.saveFailed'))
      const data = (response.data ?? {}) as { fragment?: FragmentRecord; duplicateOf?: FragmentRecord }
      if (!data.fragment && data.duplicateOf) {
        setDuplicateOf(data.duplicateOf)
        setSaveState('idle')
        return
      }
      MessageUtils.sendMessage({ type: 'RECORD_CAPTURE_METRIC', event: 'saved' }).catch(() => {})
      setSaved(true)
      setSaveState('idle')
      setTimeout(onClose, 700)
    } catch (error) {
      setSaveState('error')
      setSaveError(error instanceof Error ? error.message : uiText('capture.error.saveFailed'))
    }
  }

  if (saved) {
    return (
      <ModalShell>
        <div style={styles.success} data-ann-ui="media-capture-modal">
          {uiText('media.saved')}
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell>
      <div ref={cardRef} style={styles.card} data-ann-ui="media-capture-modal" role="dialog" aria-modal="true" aria-label={uiText('media.title')} tabIndex={-1}>
        <div style={styles.header}>
          <span style={{ fontWeight: 600 }}>{uiText('media.title')}</span>
          <span style={styles.stepBadge}>media-clip</span>
          <button style={styles.closeBtn} onClick={requestClose} title={uiText('capture.closeButton.title')} aria-label={uiText('common.close')}>
            ✕
          </button>
        </div>

        {targets.length > 1 && (
          <select style={{ ...styles.select, marginTop: 8 }} value={targetIndex} onChange={e => setTargetIndex(Number(e.target.value))} data-testid="media-target-select">
            {targets.map((t, i) => (
              <option key={t.key} value={i}>
                {uiText(t.kind === 'video' ? 'media.target.video' : 'media.target.audio')}
                {t.title ? `: ${t.title.slice(0, 40)}` : ` #${i + 1}`}
              </option>
            ))}
          </select>
        )}

        <div style={styles.rangeRow}>
          <button style={styles.rangeBtn} onClick={() => void mark('start')} data-testid="media-mark-start">
            {uiText('media.markStart')}
          </button>
          <input
            style={styles.timeInput}
            type="number"
            min={0}
            step="0.1"
            placeholder={uiText('media.startPlaceholder')}
            value={startMs !== null ? startMs / 1000 : ''}
            onChange={e => setStartMs(e.target.value === '' ? null : Math.max(0, Number(e.target.value) * 1000))}
            data-testid="media-start-input"
          />
          <span style={styles.muted}>
            {rangeValid
              ? `${fmt(startMs!)} → ${fmt(endMs!)}`
              : target
                ? uiText('media.duration', { duration: target.durationMs > 0 ? fmt(target.durationMs) : uiText('media.durationUnknown') })
                : ''}
          </span>
          <input
            style={styles.timeInput}
            type="number"
            min={0}
            step="0.1"
            placeholder={uiText('media.endPlaceholder')}
            value={endMs !== null ? endMs / 1000 : ''}
            onChange={e => setEndMs(e.target.value === '' ? null : Math.max(0, Number(e.target.value) * 1000))}
            data-testid="media-end-input"
          />
          <button style={styles.rangeBtn} onClick={() => void mark('end')} data-testid="media-mark-end">
            {uiText('media.markEnd')}
          </button>
        </div>

        <label style={styles.label}>{uiText('media.summary.label')}</label>
        <textarea
          style={styles.textarea}
          rows={2}
          maxLength={500}
          value={summary}
          onChange={e => {
            setSummary(e.target.value)
            setVerified(null)
          }}
          placeholder={uiText('media.summary.placeholder')}
          data-testid="media-summary"
        />

        <label style={styles.label}>{uiText('media.transcript.label')}</label>
        <textarea
          style={styles.textarea}
          rows={4}
          value={transcript}
          onChange={e => setTranscript(e.target.value)}
          placeholder={uiText('media.transcript.placeholder')}
          data-testid="media-transcript"
        />

        <label style={styles.label}>{uiText('media.context.label')}</label>
        <textarea
          style={styles.textarea}
          rows={2}
          value={contextNote}
          onChange={e => {
            setContextNote(e.target.value)
            setVerified(null)
          }}
          placeholder={uiText('media.context.placeholder')}
        />

        <div style={styles.verifyBlock}>
          <div className="filter-label" style={styles.label}>
            {uiText('media.verify.title')}
          </div>
          {verified ? (
            <div style={styles.verifiedNote}>
              {uiText('media.verify.note', {
                source: uiText(verified.source === 'source-material' ? 'media.verify.sourceReplay' : 'media.verify.sourceManual'),
                time: new Date(verified.confirmedAt).toLocaleTimeString(),
              })}
            </div>
          ) : (
            <div style={styles.verifyRow}>
              <button style={styles.verifyBtn} disabled={!rangeValid} onClick={() => target?.replay(startMs ?? 0, endMs ?? undefined)} data-testid="media-replay">
                {uiText('media.verify.replay')}
              </button>
              <button
                style={styles.verifyBtn}
                disabled={!rangeValid}
                onClick={() => setVerified({ confirmedAt: Date.now(), source: 'source-material' })}
                data-testid="media-verify"
              >
                {uiText('media.verify.replayed')}
              </button>
              <button style={styles.verifyBtn} onClick={() => setVerified({ confirmedAt: Date.now(), source: 'manual' })}>
                {uiText('media.verify.manual')}
              </button>
            </div>
          )}
        </div>

        <label style={styles.label}>{uiText('media.use.label')}</label>
        <textarea
          style={{ ...styles.textarea, borderColor: useInvalid ? '#e5484d' : undefined }}
          rows={2}
          value={useText}
          onChange={e => setUse(e.target.value)}
          placeholder={uiText('media.use.placeholder')}
          data-testid="media-use"
        />
        {useInvalid && <div style={styles.useError}>{useInvalid}</div>}

        <input style={styles.tagInput} placeholder={uiText('capture.tags.placeholder')} value={tags} onChange={e => setTags(e.target.value)} />

        {duplicateOf && (
          <div style={styles.errorBanner}>
            <span>{uiText('media.duplicate')}</span>
            <button style={styles.miniBtn} onClick={() => void save(true)}>
              {uiText('capture.duplicate.force')}
            </button>
          </div>
        )}
        {saveState === 'error' && <div style={styles.errorBanner}>{uiText('media.saveFailed', { error: saveError })}</div>}

        <div style={styles.actions}>
          <button style={styles.ghostBtn} onClick={requestClose} disabled={saveState === 'saving'}>
            {uiText('common.cancel')}
          </button>
          <button
            style={{ ...styles.primaryBtn, opacity: rangeValid && content && verified && !useInvalid ? 1 : 0.5 }}
            onClick={() => void save(false)}
            disabled={!rangeValid || !content || !verified || !!useInvalid || saveState === 'saving'}
            data-testid="media-save"
          >
            {uiText(saveState === 'saving' ? 'capture.saving' : 'capture.saveToLibrary')}
          </button>
        </div>
      </div>
      {closeDialogOpen && <CloseDialog canFallback={false} busy={false} error="" onChoose={onChoose} />}
    </ModalShell>
  )
}

/** Reads currentTime from the live element via the detector's getter. */
async function readCurrentTimeMs(target: MediaTarget): Promise<number> {
  return Math.max(0, Math.round(target.currentTimeMs))
}

function ModalShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-ann-ui="media-capture-overlay"
      data-ann-theme=""
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000000,
        background: 'var(--ann-overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        pointerEvents: 'auto',
      }}
    >
      <ThemeStyle />
      {children}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    width: 'min(560px, calc(100vw - 32px))',
    maxHeight: '82vh',
    overflowY: 'auto',
    background: 'var(--ann-surface)',
    borderRadius: '12px',
    padding: '16px 18px',
    boxShadow: 'var(--ann-shadow)',
    color: 'var(--ann-text)',
    fontSize: '14px',
  },
  header: { display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--ann-border)' },
  stepBadge: { fontSize: '12px', color: 'var(--ann-muted)', background: 'var(--ann-surface-alt)', borderRadius: '10px', padding: '2px 8px' },
  closeBtn: { marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '14px', color: 'var(--ann-muted)' },
  select: {
    width: '100%',
    border: '1px solid var(--ann-border)',
    borderRadius: '8px',
    padding: '6px 8px',
    fontSize: '13px',
    background: 'var(--ann-surface)',
    color: 'var(--ann-text)',
  },
  rangeRow: { display: 'flex', alignItems: 'center', gap: '8px', margin: '10px 0', flexWrap: 'wrap' },
  rangeBtn: {
    border: '1px solid var(--ann-accent)',
    background: 'transparent',
    color: 'var(--ann-accent)',
    borderRadius: '8px',
    padding: '7px 12px',
    fontSize: '13px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  timeInput: {
    width: '72px',
    border: '1px solid var(--ann-border)',
    borderRadius: '8px',
    padding: '7px 8px',
    fontSize: '13px',
    background: 'var(--ann-surface)',
    color: 'var(--ann-text)',
  },
  muted: { color: 'var(--ann-muted)', fontSize: '13px' },
  label: { fontSize: '12px', color: 'var(--ann-muted)', marginTop: '2px' },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid var(--ann-border)',
    borderRadius: '8px',
    padding: '8px 10px',
    fontSize: '14px',
    fontFamily: 'inherit',
    resize: 'vertical',
    background: 'var(--ann-surface)',
    color: 'var(--ann-text)',
  },
  verifyBlock: { background: 'var(--ann-surface-alt)', borderRadius: '8px', padding: '10px', marginTop: '8px' },
  verifyRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  verifyBtn: {
    border: '1px solid var(--ann-accent)',
    background: 'transparent',
    color: 'var(--ann-accent)',
    borderRadius: '8px',
    padding: '6px 12px',
    fontSize: '13px',
    cursor: 'pointer',
  },
  verifiedNote: { background: 'var(--ann-success-bg)', color: 'var(--ann-success)', borderRadius: '8px', padding: '8px 10px', fontSize: '13px' },
  useError: { fontSize: '12px', color: 'var(--ann-danger)' },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'var(--ann-danger-bg)',
    color: 'var(--ann-danger)',
    borderRadius: '8px',
    padding: '8px 10px',
    fontSize: '13px',
  },
  miniBtn: {
    border: '1px solid var(--ann-danger)',
    background: 'transparent',
    color: 'var(--ann-danger)',
    borderRadius: '6px',
    padding: '3px 8px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  tagInput: { border: '1px solid var(--ann-border)', borderRadius: '8px', padding: '7px 10px', fontSize: '13px', background: 'var(--ann-surface)', color: 'var(--ann-text)' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '6px' },
  primaryBtn: {
    background: 'var(--ann-accent)',
    color: 'var(--ann-accent-contrast)',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 16px',
    fontSize: '14px',
    cursor: 'pointer',
  },
  ghostBtn: {
    background: 'transparent',
    color: 'var(--ann-text)',
    border: '1px solid var(--ann-border)',
    borderRadius: '8px',
    padding: '8px 14px',
    fontSize: '13px',
    cursor: 'pointer',
  },
  success: { background: 'var(--ann-success-bg)', color: 'var(--ann-success)', borderRadius: '10px', padding: '14px 28px', fontSize: '16px', boxShadow: 'var(--ann-shadow)' },
}
