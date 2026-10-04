/**
 * 碎片库「截图」视图 — 截图集（docs/v2/screenshot.md、storage.md §3.5）。
 * Records come from GET_SCREENSHOTS; image BYTES are read directly from the
 * shared fragment-store asset store (same extension origin — no Blob over
 * messaging). 转为 Fragment opens the visual form: user writes the key-detail
 * description (content), context and use, confirms verification, and the same
 * transaction enqueues the asset delivery task.
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
    if (!window.confirm('删除该截图？若已有碎片引用该图片，图片仍会保留。')) return
    await MessageUtils.sendMessage({ type: 'DELETE_SCREENSHOT', data: { id } })
    setItems(prev => prev?.filter(item => item.id !== id) ?? null)
  }

  if (items === null) {
    return (
      <main className="library-list">
        <p className="library-empty">加载中…</p>
      </main>
    )
  }

  if (items.length === 0) {
    return (
      <main className="library-list">
        <div className="library-empty" data-testid="screenshots-empty">
          <p>还没有截图采集。</p>
          <p>
            在任意网页按 <strong>Ctrl+Shift+S</strong>（macOS <strong>Cmd+Shift+S</strong>），拖拽截取区域或单击截取元素；确认入库的截图会出现在这里。
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
            {item.objectUrl ? <img src={item.objectUrl} alt={item.sourceTitle || '截图'} loading="lazy" /> : <div className="screenshot-missing">图片缺失（资产不在本地库中）</div>}
            <figcaption>
              <div className="screenshot-meta">
                {item.sourceUrl ? <span className="screenshot-source">{safeHost(item.sourceUrl)}</span> : <span className="screenshot-source">本地</span>}
                <time>{new Date(item.capturedAt).toLocaleString()}</time>
              </div>
              <div className="screenshot-actions">
                <button type="button" onClick={() => setConverting(item)} data-testid="screenshot-to-fragment">
                  {uiText('library.convert')}
                </button>
                <button type="button" onClick={() => remove(item.id)} data-testid="screenshot-delete">
                  删除
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

/** visual Fragment conversion form (extension PRD §7). */
function VisualFormModal({ screenshot, onClose, onSaved }: { screenshot: ScreenshotRecord; onClose: () => void; onSaved: () => void }) {
  const [content, setContent] = useState('')
  const [contextText, setContextText] = useState(
    screenshot.sourceTitle ? `（来自 ${safeHost(screenshot.sourceUrl)}：${screenshot.sourceTitle}）` : `（来自 ${safeHost(screenshot.sourceUrl)}）`,
  )
  const [useText, setUse] = useState('')
  const [verified, setVerified] = useState<{ confirmedAt: number; source: 'source-material' | 'manual' } | null>(null)
  const [summary, setSummary] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const useInvalid = (() => {
    const use = useText.trim()
    if (!use) return useText ? '应用不能为空' : ''
    if (use === content.trim()) return '应用不能只复述描述'
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
      if (!response.success) throw new Error(response.error || '保存失败')
      const data = response.data as { fragment?: FragmentRecord; duplicateOf?: FragmentRecord }
      if (!data.fragment && data.duplicateOf) {
        if (!window.confirm('已保存过相同描述的视觉碎片。仍要保存？')) {
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
        if (!retry.success) throw new Error(retry.error || '保存失败')
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败（输入已保留）')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fragment-editor visual-form" data-ann-ui="visual-form">
      <h3>{uiText('library.convertVisual')}</h3>
      <label className="filter-label">关键细节描述（必填，content）</label>
      <textarea
        rows={3}
        maxLength={500}
        value={content}
        onChange={e => {
          setContent(e.target.value)
          setVerified(null)
        }}
        placeholder="这张截图里值得记住的结构、数字或设计细节"
        data-testid="visual-content"
      />
      <label className="filter-label">页面语境（可选，接在描述后）</label>
      <textarea
        rows={2}
        value={contextText}
        onChange={e => {
          setContextText(e.target.value)
          setVerified(null)
        }}
      />
      <label className="filter-label">摘要（可选）</label>
      <textarea rows={2} value={summary} onChange={e => setSummary(e.target.value)} />
      <div>
        <div className="filter-label">核验 — 对照原图与页面语境</div>
        <label className="verify-confirm">
          <input
            type="checkbox"
            checked={!!verified}
            onChange={e => setVerified(e.target.checked ? { confirmedAt: Date.now(), source: 'source-material' } : null)}
            data-testid="visual-verify"
          />
          确认已核对
        </label>
        {verified && <div className="editor-note">已确认核对（原文材料，{new Date(verified.confirmedAt).toLocaleTimeString()}）。修改描述或语境后需重新确认。</div>}
      </div>
      <label className="filter-label">应用（必填）</label>
      <textarea rows={2} value={useText} onChange={e => setUse(e.target.value)} placeholder="准备在哪个任务中使用或检验这张图？" data-testid="visual-use" />
      {useInvalid && <p className="editor-error">{useInvalid}</p>}
      {error && <p className="editor-error">{error}</p>}
      <div className="editor-actions">
        <button onClick={onClose}>取消</button>
        <button className="primary" onClick={save} disabled={saving || !!useInvalid || !verified || !content.trim()} data-testid="visual-save">
          {saving ? '保存中…' : '保存视觉碎片'}
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
