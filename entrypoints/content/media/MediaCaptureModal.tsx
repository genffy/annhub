/**
 * MediaClip capture (R4.2, docs/v2/fragments.md 'media-clip'): grab a time
 * range from the page's <video>/<audio>, write the transcript by hand
 * (LLM optional later), and save a media-clip Fragment with a time locator.
 * Same verification discipline as the text capture modal: explicit 核验
 * confirmation, non-empty 应用 that is not a copy of content/excerpt.
 */
import { useEffect, useMemo, useState } from 'react'
import type { FragmentRecord } from '../../../learning-core/types'
import type { SaveFragmentInput } from '../../../types/messages'
import MessageUtils from '../../../utils/message'
import type { MediaTarget } from './detect'

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

  useEffect(() => {
    MessageUtils.sendMessage({ type: 'RECORD_CAPTURE_METRIC', event: 'modal-opened', step: 'media' }).catch(() => {})
  }, [])

  const rangeValid = startMs !== null && endMs !== null && endMs > startMs
  const content = summary.trim()
  const useInvalid = useMemo(() => {
    const use = useText.trim()
    if (!use) return useText ? '应用不能为空' : ''
    if (content && use === content) return '应用不能只复述摘要'
    return ''
  }, [useText, content])

  const mark = async (which: 'start' | 'end') => {
    if (!target) return
    const ms = await readCurrentTimeMs(target)
    if (which === 'start') setStartMs(ms)
    else setEndMs(ms)
  }

  const requestClose = () => {
    if (saveState === 'saving') return
    if (saved) return onClose()
    const dirty = !!(transcript.trim() || summary.trim() || useText.trim() || startMs !== null)
    if (dirty && !window.confirm('已填写的内容将被放弃。放弃并关闭？')) return
    MessageUtils.sendMessage({ type: 'RECORD_CAPTURE_METRIC', event: 'exited', step: 'media' }).catch(() => {})
    onClose()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        requestClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveState, saved, transcript, summary, useText, startMs])

  const save = async (force = false) => {
    if (saveState === 'saving' || !rangeValid || !content || !verified || useInvalid) return
    setSaveState('saving')
    setSaveError('')
    try {
      const excerpt = `${content}\n（${fmt(startMs!)}–${fmt(endMs!)} 转写节选）${transcript.trim() ? `\n${transcript.trim()}` : ''}${contextNote.trim() ? `\n${contextNote.trim()}` : ''}`
      const input: SaveFragmentInput = {
        kind: 'media-clip',
        content,
        excerpt,
        sourceUrl,
        sourceTitle: sourceTitle || undefined,
        locator: { type: 'time', startMs: startMs!, endMs: endMs! },
        verified: { ...verified },
        use: useText.trim(),
        tags: tags.split(/[,，]/).map(t => t.trim()).filter(Boolean),
        detail: { startMs: startMs!, endMs: endMs! },
      }
      const response = await MessageUtils.sendMessage({ type: 'SAVE_FRAGMENT', input, force })
      if (!response.success) throw new Error(response.error || '保存失败')
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
      setSaveError(error instanceof Error ? error.message : '保存失败')
    }
  }

  if (saved) {
    return (
      <ModalShell>
        <div style={styles.success} data-ann-ui="media-capture-modal">
          ✅ 已保存为「媒体片段」
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell>
      <div style={styles.card} data-ann-ui="media-capture-modal">
        <div style={styles.header}>
          <span style={{ fontWeight: 600 }}>保存媒体片段</span>
          <span style={styles.stepBadge}>media-clip</span>
          <button style={styles.closeBtn} onClick={requestClose} title="关闭 (Esc)">
            ✕
          </button>
        </div>

        {targets.length > 1 && (
          <select style={{ ...styles.select, marginTop: 8 }} value={targetIndex} onChange={e => setTargetIndex(Number(e.target.value))} data-testid="media-target-select">
            {targets.map((t, i) => (
              <option key={t.key} value={i}>
                {t.kind === 'video' ? '视频' : '音频'}
                {t.title ? `：${t.title.slice(0, 40)}` : ` #${i + 1}`}
              </option>
            ))}
          </select>
        )}

        <div style={styles.rangeRow}>
          <button style={styles.rangeBtn} onClick={() => void mark('start')} data-testid="media-mark-start">
            设为起点
          </button>
          <input
            style={styles.timeInput}
            type="number"
            min={0}
            step="0.1"
            placeholder="起(秒)"
            value={startMs !== null ? startMs / 1000 : ''}
            onChange={e => setStartMs(e.target.value === '' ? null : Math.max(0, Number(e.target.value) * 1000))}
            data-testid="media-start-input"
          />
          <span style={styles.muted}>{rangeValid ? `${fmt(startMs!)} → ${fmt(endMs!)}` : target ? `时长 ${target.durationMs > 0 ? fmt(target.durationMs) : '未知'}` : ''}</span>
          <input
            style={styles.timeInput}
            type="number"
            min={0}
            step="0.1"
            placeholder="止(秒)"
            value={endMs !== null ? endMs / 1000 : ''}
            onChange={e => setEndMs(e.target.value === '' ? null : Math.max(0, Number(e.target.value) * 1000))}
            data-testid="media-end-input"
          />
          <button style={styles.rangeBtn} onClick={() => void mark('end')} data-testid="media-mark-end">
            设为终点
          </button>
        </div>

        <label style={styles.label}>要点摘要（必填，即这条碎片的核心内容）</label>
        <textarea style={styles.textarea} rows={2} maxLength={500} value={summary} onChange={e => { setSummary(e.target.value); setVerified(null) }} placeholder="这几十秒讲了什么值得记住的点？" data-testid="media-summary" />

        <label style={styles.label}>转写（手工记录/修正，可选）</label>
        <textarea style={styles.textarea} rows={4} value={transcript} onChange={e => setTranscript(e.target.value)} placeholder="逐句或摘录式转写；后续可修正" data-testid="media-transcript" />

        <label style={styles.label}>页面语境（可选）</label>
        <textarea style={styles.textarea} rows={2} value={contextNote} onChange={e => { setContextNote(e.target.value); setVerified(null) }} placeholder="这 段出现在什么讨论里？" />

        <div style={styles.verifyBlock}>
          <div className="filter-label" style={styles.label}>
            核验 — 回放该时间段并确认转写
          </div>
          {verified ? (
            <div style={styles.verifiedNote}>已确认核对（{verified.source === 'source-material' ? '回放原文' : '手工'}，{new Date(verified.confirmedAt).toLocaleTimeString()}）</div>
          ) : (
            <div style={styles.verifyRow}>
              <button style={styles.verifyBtn} disabled={!rangeValid} onClick={() => target?.replay(startMs ?? 0, endMs ?? undefined)} data-testid="media-replay">
                ▶ 回放区间
              </button>
              <button style={styles.verifyBtn} disabled={!rangeValid} onClick={() => setVerified({ confirmedAt: Date.now(), source: 'source-material' })} data-testid="media-verify">
                已回放确认
              </button>
              <button style={styles.verifyBtn} onClick={() => setVerified({ confirmedAt: Date.now(), source: 'manual' })}>
                手工核对后确认
              </button>
            </div>
          )}
        </div>

        <label style={styles.label}>应用（必填）</label>
        <textarea style={{ ...styles.textarea, borderColor: useInvalid ? '#e5484d' : undefined }} rows={2} value={useText} onChange={e => setUse(e.target.value)} placeholder="准备在什么时候用这段内容？" data-testid="media-use" />
        {useInvalid && <div style={styles.useError}>{useInvalid}</div>}

        <input style={styles.tagInput} placeholder="标签（逗号分隔，可选）" value={tags} onChange={e => setTags(e.target.value)} />

        {duplicateOf && (
          <div style={styles.errorBanner}>
            <span>已保存过相同内容的媒体片段。仍要保存？</span>
            <button style={styles.miniBtn} onClick={() => void save(true)}>
              仍要保存
            </button>
          </div>
        )}
        {saveState === 'error' && <div style={styles.errorBanner}>保存失败：{saveError}。输入已保留，可直接重试。</div>}

        <div style={styles.actions}>
          <button style={styles.ghostBtn} onClick={requestClose} disabled={saveState === 'saving'}>
            取消
          </button>
          <button
            style={{ ...styles.primaryBtn, opacity: rangeValid && content && verified && !useInvalid ? 1 : 0.5 }}
            onClick={() => void save(false)}
            disabled={!rangeValid || !content || !verified || !!useInvalid || saveState === 'saving'}
            data-testid="media-save"
          >
            {saveState === 'saving' ? '保存中…' : '保存到碎片库'}
          </button>
        </div>
      </div>
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
  card: { width: 'min(560px, calc(100vw - 32px))', maxHeight: '82vh', overflowY: 'auto', background: '#fff', borderRadius: '12px', padding: '16px 18px', boxShadow: '0 12px 40px rgba(0,0,0,0.3)', color: '#1a1d24', fontSize: '14px' },
  header: { display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '8px', borderBottom: '1px solid #e8e8ec' },
  stepBadge: { fontSize: '12px', color: '#636977', background: '#f1f1f4', borderRadius: '10px', padding: '2px 8px' },
  closeBtn: { marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '14px', color: '#636977' },
  select: { width: '100%', border: '1px solid #d6d8de', borderRadius: '8px', padding: '6px 8px', fontSize: '13px', background: '#fff' },
  rangeRow: { display: 'flex', alignItems: 'center', gap: '8px', margin: '10px 0', flexWrap: 'wrap' },
  rangeBtn: { border: '1px solid #1a1d24', background: '#fff', color: '#1a1d24', borderRadius: '8px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' },
  timeInput: { width: '72px', border: '1px solid #d6d8de', borderRadius: '8px', padding: '7px 8px', fontSize: '13px' },
  muted: { color: '#8b8d98', fontSize: '13px' },
  label: { fontSize: '12px', color: '#636977', marginTop: '2px' },
  textarea: { width: '100%', boxSizing: 'border-box', border: '1px solid #d6d8de', borderRadius: '8px', padding: '8px 10px', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical' },
  verifyBlock: { background: '#f6f7f9', borderRadius: '8px', padding: '10px', marginTop: '8px' },
  verifyRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  verifyBtn: { border: '1px solid #1a1d24', background: '#fff', color: '#1a1d24', borderRadius: '8px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer' },
  verifiedNote: { background: '#eef7ef', color: '#226a3c', borderRadius: '8px', padding: '8px 10px', fontSize: '13px' },
  useError: { fontSize: '12px', color: '#c6373c' },
  errorBanner: { display: 'flex', alignItems: 'center', gap: '8px', background: '#fdf0f0', color: '#c6373c', borderRadius: '8px', padding: '8px 10px', fontSize: '13px' },
  miniBtn: { border: '1px solid #e5a0a2', background: '#fff', color: '#c6373c', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap' },
  tagInput: { border: '1px solid #d6d8de', borderRadius: '8px', padding: '7px 10px', fontSize: '13px' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '6px' },
  primaryBtn: { background: '#1a1d24', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', cursor: 'pointer' },
  ghostBtn: { background: 'transparent', color: '#3c4048', border: '1px solid #d6d8de', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer' },
  success: { background: 'rgba(40, 167, 69, 0.96)', color: '#fff', borderRadius: '10px', padding: '14px 28px', fontSize: '16px' },
}
