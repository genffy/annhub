/**
 * Fragment library “Screenshots” view — the screenshot library (docs/v2/screenshot.md, storage.md §3).
 * Records come from GET_SCREENSHOTS; image BYTES are read directly from the
 * shared fragment-store asset store (same extension origin — no Blob over
 * messaging). Converting to a Fragment opens the visual form: user writes the key-detail
 * description (content), context and use, and confirms verification.
 */
import { useCallback, useEffect, useState } from 'react'
import MessageUtils from '../../utils/message'
import { FragmentStore } from '../../learning-core/fragment-store'
import type { ScreenshotRecord, FragmentRecord } from '../../learning-core/types'
import type { ScreenshotLibraryItem } from '../../types/messages'
import { uiText } from '../../utils/ui-text'

const store = new FragmentStore('fragment-store')

export default function ScreenshotsView({ onSaved }: { onSaved: () => void }) {
  const [items, setItems] = useState<Array<ScreenshotLibraryItem & { objectUrl?: string }> | null>(null)
  const [converting, setConverting] = useState<ScreenshotLibraryItem | null>(null)

  const load = useCallback(async () => {
    const response = await MessageUtils.sendMessage<ScreenshotLibraryItem[]>({ type: 'GET_SCREENSHOTS' })
    const records = response.success && Array.isArray(response.data) ? response.data : []
    await store.initialize()
    const withUrls = await Promise.all(
      records.map(async record => {
        try {
          const asset = await store.getAsset(record.assetId)
          return asset ? { ...record, objectUrl: URL.createObjectURL(asset.bytes) } : { ...record }
        } catch {
          return { ...record }
        }
      }),
    )
    setItems(withUrls)
  }, [])

  useEffect(() => {
    void load()
    return () => {
      // object URLs die with the page; nothing to revoke on unmount list-wide
    }
  }, [load])

  const remove = async (id: string) => {
    if (!window.confirm(uiText('shots.confirmDelete'))) return
    await MessageUtils.sendMessage({ type: 'DELETE_SCREENSHOT', data: { id } })
    setItems(prev => prev?.filter(item => item.id !== id) ?? null)
  }

  if (items === null) {
    return (
      <main className="library-list">
        <p className="library-empty">{uiText('common.loading')}</p>
      </main>
    )
  }

  if (items.length === 0) {
    return (
      <main className="library-list">
        <div className="library-empty" data-testid="screenshots-empty">
          <p>{uiText('shots.empty.title')}</p>
          <p>
            {uiText('shots.empty.before')}
            <strong>Ctrl+Shift+S</strong>
            {uiText('shots.empty.middle')}
            <strong>Cmd+Shift+S</strong>
            {uiText('shots.empty.after')}
          </p>
        </div>
      </main>
    )
  }

  return (
    <>
      <main className="library-list screenshots-list" data-testid="screenshots-list">
        {items.map(item => (
          <figure className="screenshot-card" key={item.id} data-testid="screenshot-card">
            {item.objectUrl ? (
              <img src={item.objectUrl} alt={item.sourceTitle || uiText('shots.alt')} loading="lazy" />
            ) : (
              <div className="screenshot-missing">{uiText('shots.missing')}</div>
            )}
            <figcaption>
              <div className="screenshot-meta">
                {item.sourceUrl ? <span className="screenshot-source">{safeHost(item.sourceUrl)}</span> : <span className="screenshot-source">{uiText('shots.local')}</span>}
                <time>{new Date(item.capturedAt).toLocaleString()}</time>
              </div>
              <div className="screenshot-actions">
                <button type="button" onClick={() => setConverting(item)} data-testid="screenshot-to-fragment">
                  {uiText('library.convert')}
                </button>
                <button type="button" onClick={() => remove(item.id)} data-testid="screenshot-delete">
                  {uiText('common.delete')}
                </button>
              </div>
            </figcaption>
          </figure>
        ))}
      </main>
      {converting && (
        <VisualFormModal
          screenshot={{ ...converting } as ScreenshotRecord}
          onClose={() => setConverting(null)}
          onSaved={() => {
            setConverting(null)
            onSaved()
          }}
        />
      )}
    </>
  )
}

/** visual Fragment conversion form (extension PRD §6). */
function VisualFormModal({ screenshot, onClose, onSaved }: { screenshot: ScreenshotRecord; onClose: () => void; onSaved: () => void }) {
  const [content, setContent] = useState('')
  const [contextText, setContextText] = useState(
    screenshot.sourceTitle
      ? uiText('visual.contextFromTitle', { host: safeHost(screenshot.sourceUrl), title: screenshot.sourceTitle })
      : uiText('visual.contextFrom', { host: safeHost(screenshot.sourceUrl) }),
  )
  const [useText, setUse] = useState('')
  const [verified, setVerified] = useState<{ confirmedAt: number; source: 'source-material' | 'manual' } | null>(null)
  const [summary, setSummary] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const useInvalid = (() => {
    const use = useText.trim()
    if (!use) return useText ? uiText('capture.use.empty') : ''
    if (use === content.trim()) return uiText('visual.use.repeatsDescription')
    return ''
  })()

  const save = async () => {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const excerpt = `${content.trim()}\n${contextText.trim()}`
      const response = await MessageUtils.sendMessage({
        type: 'SAVE_FRAGMENT',
        input: {
          kind: 'visual',
          content: content.trim(),
          excerpt,
          sourceUrl: screenshot.sourceUrl,
          sourceTitle: screenshot.sourceTitle || undefined,
          locator: { type: 'image', assetId: screenshot.assetId },
          verified: { ...verified!, ...(summary.trim() ? { summary: summary.trim() } : {}) },
          use: useText.trim(),
          tags: [],
          detail: { attachmentIds: [screenshot.assetId] },
        },
      })
      if (!response.success) throw new Error(response.error || uiText('capture.error.saveFailed'))
      const data = response.data as { fragment?: FragmentRecord; duplicateOf?: FragmentRecord }
      if (!data.fragment && data.duplicateOf) {
        if (!window.confirm(uiText('visual.duplicate'))) {
          setSaving(false)
          return
        }
        const retry = await MessageUtils.sendMessage({
          type: 'SAVE_FRAGMENT',
          force: true,
          input: {
            kind: 'visual',
            content: content.trim(),
            excerpt,
            sourceUrl: screenshot.sourceUrl,
            sourceTitle: screenshot.sourceTitle || undefined,
            locator: { type: 'image', assetId: screenshot.assetId },
            verified: { ...verified!, ...(summary.trim() ? { summary: summary.trim() } : {}) },
            use: useText.trim(),
            tags: [],
            detail: { attachmentIds: [screenshot.assetId] },
          },
        })
        if (!retry.success) throw new Error(retry.error || uiText('capture.error.saveFailed'))
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : uiText('library.editor.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fragment-editor visual-form" data-ann-ui="visual-form">
      <h3>{uiText('library.convertVisual')}</h3>
      <label className="filter-label">{uiText('visual.content.label')}</label>
      <textarea
        rows={3}
        maxLength={500}
        value={content}
        onChange={e => {
          setContent(e.target.value)
          setVerified(null)
        }}
        placeholder={uiText('visual.content.placeholder')}
        data-testid="visual-content"
      />
      <label className="filter-label">{uiText('visual.context.label')}</label>
      <textarea
        rows={2}
        value={contextText}
        onChange={e => {
          setContextText(e.target.value)
          setVerified(null)
        }}
      />
      <label className="filter-label">{uiText('capture.verify.summary')}</label>
      <textarea rows={2} value={summary} onChange={e => setSummary(e.target.value)} />
      <div>
        <div className="filter-label">{uiText('visual.verify.title')}</div>
        <label className="verify-confirm">
          <input
            type="checkbox"
            checked={!!verified}
            onChange={e => setVerified(e.target.checked ? { confirmedAt: Date.now(), source: 'source-material' } : null)}
            data-testid="visual-verify"
          />
          {uiText('capture.verify.confirm')}
        </label>
        {verified && <div className="editor-note">{uiText('visual.verify.note', { time: new Date(verified.confirmedAt).toLocaleTimeString() })}</div>}
      </div>
      <label className="filter-label">{uiText('visual.use.label')}</label>
      <textarea rows={2} value={useText} onChange={e => setUse(e.target.value)} placeholder={uiText('visual.use.placeholder')} data-testid="visual-use" />
      {useInvalid && <p className="editor-error">{useInvalid}</p>}
      {error && <p className="editor-error">{error}</p>}
      <div className="editor-actions">
        <button onClick={onClose}>{uiText('common.cancel')}</button>
        <button className="primary" onClick={save} disabled={saving || !!useInvalid || !verified || !content.trim()} data-testid="visual-save">
          {uiText(saving ? 'capture.saving' : 'visual.save')}
        </button>
      </div>
    </div>
  )
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}
