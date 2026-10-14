'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { LandingCopy } from '@/lib/copy'
import { BrowserFrame } from '../product/browser'
import ExportFile from '../product/export-file'
import { Drawer, HighlightBar, Reader } from '../product/detail'
import { addHighlight, recolor, removeHighlight, selectionOffsets } from '../product/highlight-ops'
import { AppShell, EntryList, HighlightGroups, PageHead, PropertyTable, ScreenshotGallery, SearchBox } from '../product/library'
import type { LibraryView } from '../product/library'
import { plainText } from '../product/markdown'
import { plural } from '../product/parts'
import { getSample } from '../product/sample'
import type { Entry, HighlightColor } from '../product/types'
import TourControls from './tour-controls'

type Bar = { kind: 'create'; start: number; end: number; left: number; top: number } | { kind: 'edit'; id: string; left: number; top: number }

const ROUTE: Record<LibraryView, string> = { all: 'all', clip: 'clips', highlight: 'highlights', screenshot: 'screenshots', properties: 'properties' }

function matches(entry: Entry, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = [entry.title, plainText(entry.content), entry.note ?? '', entry.host, ...entry.tags, ...entry.highlights.flatMap(h => [h.quote, h.note ?? ''])]
    .join('\n')
    .toLowerCase()
  return haystack.includes(q)
}

/**
 * The library as a working window: the navigation, search, the detail drawer, the reading view with highlights you can
 * create, recolour and delete, read-only properties and a Markdown export preview. State lives in memory only; a reload resets
 * it, and nothing is stored or sent anywhere. Task controls also render in the static loading state.
 */
export default function LibraryTour({ copy }: { copy: LandingCopy }) {
  const { ui, tour } = copy
  const sample = useMemo(() => getSample(copy.locale), [copy.locale])
  const registry = sample.registry.map(property => ({
    ...property,
    used: sample.entries.filter(entry => property.name === 'title' || (property.name === 'tags' ? entry.tags.length > 0 : entry.props[property.name] !== undefined)).length,
  }))
  const [entries, setEntries] = useState<Entry[]>(sample.entries)
  const [view, setView] = useState<LibraryView>('all')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [readId, setReadId] = useState<string | null>(null)
  const [tab, setTab] = useState<'highlights' | 'properties'>('highlights')
  const [activeHl, setActiveHl] = useState<string | null>(null)
  const [bar, setBar] = useState<Bar | null>(null)
  const [exportPreview, setExportPreview] = useState(false)
  const tourRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const seq = useRef(0)

  const reading = readId ? entries.find(e => e.id === readId) : undefined
  const opened = openId ? entries.find(e => e.id === openId) : undefined

  const clearBar = useCallback(() => {
    setBar(null)
    setActiveHl(null)
  }, [])

  const navigate = (next: LibraryView) => {
    setExportPreview(false)
    setView(next)
    setReadId(null)
    setOpenId(null)
    clearBar()
  }

  const startReading = (id: string, highlightId?: string) => {
    setOpenId(null)
    setReadId(id)
    setTab('highlights')
    setBar(null)
    setActiveHl(highlightId ?? null)
  }

  const updateHighlights = useCallback((entryId: string, highlights: Entry['highlights']) => setEntries(prev => prev.map(e => (e.id === entryId ? { ...e, highlights } : e))), [])

  /** The current browser selection, if it lies inside the clip's text: its source range and where it is on screen. */
  const readSelection = useCallback(() => {
    const body = bodyRef.current
    const selection = window.getSelection()
    if (!reading || !body || !selection || selection.isCollapsed || !selection.rangeCount) return null
    const range = selection.getRangeAt(0)
    if (!body.contains(range.commonAncestorContainer)) return null
    const offsets = selectionOffsets(range, body, reading.content)
    if (!offsets) return null
    const col = body.parentElement!.getBoundingClientRect()
    const rect = range.getBoundingClientRect()
    return { offsets, left: rect.left + rect.width / 2 - col.left, top: rect.top - col.top - 46 }
  }, [reading])

  /** After the pointer or keyboard has finished a selection in the reading view, offer the colour toolbar. */
  const onSelect = () => {
    const found = readSelection()
    if (!found) return
    setActiveHl(null)
    setBar({ kind: 'create', ...found.offsets, left: found.left, top: found.top })
  }

  /** `H` after a keyboard selection highlights it in the default colour, as in the extension. */
  const highlightWithKeyboard = useCallback(() => {
    const found = readSelection()
    if (!found || !reading) return false
    const result = addHighlight(reading, found.offsets.start, found.offsets.end, 'yellow', `${reading.id}-u${++seq.current}`)
    if (!('highlights' in result)) return false
    updateHighlights(reading.id, result.highlights)
    setActiveHl(result.added.id)
    window.getSelection()?.removeAllRanges()
    setBar(null)
    return true
  }, [reading, readSelection, updateHighlights])

  // After a mouse selection keyboard focus stays on the page, so `H` is listened for on the document, but it only does
  // anything while the selection lies inside the clip's text.
  useEffect(() => {
    if (!reading) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'h' || e.key === 'H') && !e.metaKey && !e.ctrlKey && !e.altKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        if (highlightWithKeyboard()) e.preventDefault()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [reading, highlightWithKeyboard])

  const onHighlightClick = (id: string) => {
    const mark = bodyRef.current?.querySelector<HTMLElement>(`[data-hid="${id}"]`)
    const col = bodyRef.current?.parentElement
    if (!mark || !col) return
    const rect = mark.getBoundingClientRect()
    const colRect = col.getBoundingClientRect()
    window.getSelection()?.removeAllRanges()
    setActiveHl(id)
    setBar({ kind: 'edit', id, left: rect.left + rect.width / 2 - colRect.left, top: rect.top - colRect.top - 46 })
  }

  const pickColor = (color: HighlightColor) => {
    if (!reading || !bar) return
    if (bar.kind === 'edit') {
      updateHighlights(reading.id, recolor(reading, bar.id, color))
    } else {
      const result = addHighlight(reading, bar.start, bar.end, color, `${reading.id}-u${++seq.current}`)
      if ('highlights' in result) {
        updateHighlights(reading.id, result.highlights)
        setActiveHl(result.added.id)
      }
      window.getSelection()?.removeAllRanges()
    }
    setBar(null)
  }

  const deleteActive = () => {
    if (!reading || !bar || bar.kind !== 'edit') return
    updateHighlights(reading.id, removeHighlight(reading, bar.id))
    clearBar()
  }

  const openExport = () => {
    setReadId(null)
    setOpenId(null)
    clearBar()
    setExportPreview(true)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return
    if (bar) clearBar()
    else if (opened) setOpenId(null)
    else if (reading) setReadId(null)
    else if (exportPreview) setExportPreview(false)
  }

  // ── what the right-hand side shows ────────────────────────────────────────────────────────────
  const visible = entries.filter(e => matches(e, query))
  const clips = visible.filter(e => e.type === 'clip')
  const counts = {
    all: entries.length,
    clip: entries.filter(e => e.type === 'clip').length,
    highlight: entries.reduce((n, e) => n + e.highlights.length, 0),
    screenshot: entries.filter(e => e.type === 'screenshot').length,
    props: sample.registry.length,
  }
  const shown =
    view === 'clip'
      ? clips.length
      : view === 'highlight'
        ? visible.reduce((n, e) => n + e.highlights.length, 0)
        : view === 'screenshot'
          ? visible.filter(e => e.type === 'screenshot').length
          : visible.length
  const title = ui.nav[({ all: 'all', clip: 'clips', highlight: 'highlights', screenshot: 'screenshots', properties: 'properties' } as const)[view]]
  const searchBox = <SearchBox ui={ui} query={query} onChange={setQuery} />

  const content = exportPreview ? (
    <>
      <PageHead title={tour.exportTitle} />
      <div className="ah-pbody scroll">
        <p className="mb-5 text-[14px] leading-6 text-fg-3">{tour.exportHint}</p>
        <ExportFile file={sample.exportFile} ui={ui} />
      </div>
    </>
  ) : reading ? (
    <Reader
      entry={reading}
      registry={sample.registry}
      ui={ui}
      tab={tab}
      activeId={activeHl ?? undefined}
      bodyRef={bodyRef}
      onBack={() => {
        setReadId(null)
        clearBar()
      }}
      onTab={setTab}
      onHighlight={onHighlightClick}
      overlay={
        bar ? (
          <HighlightBar
            preview
            ui={ui}
            current={bar.kind === 'edit' ? reading.highlights.find(h => h.id === bar.id)?.color : undefined}
            onPick={pickColor}
            onDelete={bar.kind === 'edit' ? deleteActive : undefined}
            style={{ position: 'absolute', left: bar.left, top: bar.top, transform: 'translateX(-50%)' } as CSSProperties}
          />
        ) : null
      }
    />
  ) : view === 'properties' ? (
    <>
      <PageHead title={title} sub={plural(sample.registry.length, ui.list.count, ui.list.countOne)} />
      <div className="ah-pbody scroll">
        <PropertyTable registry={registry} ui={ui} />
      </div>
    </>
  ) : (
    <>
      <PageHead title={title} sub={plural(shown, ui.list.count, ui.list.countOne)} right={searchBox} />
      <div className={`ah-pbody scroll${view === 'all' || view === 'clip' ? ' cap' : ''}`}>
        {shown === 0 ? (
          <p role="status" className="py-8 text-[14px] leading-6 text-fg-3">
            {tour.empty}
          </p>
        ) : null}
        {view === 'all' ? <EntryList entries={visible} ui={ui} selectedId={openId ?? undefined} onOpen={setOpenId} /> : null}
        {view === 'clip' ? <EntryList entries={clips} ui={ui} selectedId={openId ?? undefined} onOpen={setOpenId} /> : null}
        {view === 'highlight' ? <HighlightGroups entries={visible} ui={ui} onOpen={startReading} /> : null}
        {view === 'screenshot' ? <ScreenshotGallery entries={visible} selectedId={openId ?? undefined} onOpen={setOpenId} /> : null}
      </div>
    </>
  )

  const activeLegend = exportPreview ? 4 : view === 'properties' ? 3 : reading || view === 'highlight' ? 2 : opened ? 1 : 0
  const applyLegend = (i: number) => {
    setReadId(null)
    clearBar()
    setQuery('')
    setExportPreview(i === 4)
    setOpenId(i === 1 ? 'storm' : null)
    setView(i === 2 ? 'highlight' : i === 3 ? 'properties' : 'all')
    tourRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }

  return (
    <div ref={tourRef} className="anchor-target" onKeyDown={onKeyDown}>
      <TourControls copy={copy} active={activeLegend} onSelect={applyLegend} />
      <div
        id="library-demo-window"
        className="tour-window mt-3"
        role="region"
        aria-label={tour.title}
        onMouseDown={e => {
          if (bar && !(e.target as HTMLElement).closest('.ah-hbar, [data-hid]')) clearBar()
        }}
        onMouseUp={reading ? () => window.setTimeout(onSelect, 0) : undefined}
        onKeyUp={reading ? e => e.shiftKey && window.setTimeout(onSelect, 0) : undefined}
      >
        <BrowserFrame
          title={`${exportPreview ? tour.exportTitle : reading ? reading.title : title} · AnnHub`}
          url={exportPreview ? sample.exportFile.name : `chrome-extension://annhub/app.html#/${reading ? `read/${reading.id}` : ROUTE[view]}`}
          className="h-full w-full"
          style={{ height: '100%' }}
        >
          <AppShell
            preview
            exportLabel={tour.exportTitle}
            ui={ui}
            active={reading ? 'clip' : view}
            counts={counts}
            onNavigate={navigate}
            onExport={openExport}
            drawer={
              opened && !reading ? (
                <Drawer
                  entry={opened}
                  registry={sample.registry}
                  ui={ui}
                  onClose={() => setOpenId(null)}
                  onRead={opened.type === 'clip' ? () => startReading(opened.id) : undefined}
                />
              ) : null
            }
          >
            {content}
          </AppShell>
        </BrowserFrame>
      </div>
    </div>
  )
}
