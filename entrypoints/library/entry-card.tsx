/**
 * The list view's card (extension.md §2.3): the preview, the property pills, the type chip and the
 * screenshot's download-and-delete row, plus the asset URL hook that reads a picture out of the
 * store. Moved verbatim from App.tsx when the file went over its byte budget.
 */
import { useEffect, useState } from 'react'
import type { EntryRecord, PropertyDefinition } from '../../core/types'
import { EntryStore } from '../../core/store'
import MessageUtils from '../../utils/message'
import { markdownToPlainText } from '../../core/markdown'
import { orderRegistry } from './property-order'
import { TypeChip } from './ui-text'
import { PROPERTY_TYPE_ICONS } from '../../utils/entry-icons'
import { relativeTime } from './ui-text'
import { Check, Download, Highlighter, Scan, Trash2 } from 'lucide-react'
import { entryErrorText, uiText } from './ui-text'

let assetStorePromise: Promise<EntryStore> | null = null

function assetStore(): Promise<EntryStore> {
  assetStorePromise ??= (async () => {
    const store = new EntryStore()
    await store.initialize()
    return store
  })().catch(error => {
    assetStorePromise = null
    throw error
  })
  return assetStorePromise
}

function useAssetUrl(assetId: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!assetId) return
    let active = true
    let objectUrl: string | null = null
    void assetStore()
      .then(store => store.getAsset(assetId))
      .then(asset => {
        if (!active || !asset) return
        objectUrl = URL.createObjectURL(asset.bytes)
        setUrl(objectUrl)
      })
      .catch(() => undefined)
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [assetId])
  return url
}

/** One page of the list (RV-LIB-02: “显示更多” appends the next page). */

/** The search box debounces before it hits the query path (search.md §6). */

/** Calendar dates become [start, end) epoch bounds in the user's local timezone (search.md §3). */

export function propertyPills(entry: EntryRecord, registry: PropertyDefinition[]): { name: string; node: React.ReactNode }[] {
  const pills: { name: string; node: React.ReactNode }[] = []
  for (const def of orderRegistry(registry)) {
    if (def.builtin || pills.length >= CARD_PILL_LIMIT) continue
    const value = entry.properties[def.name]
    const Icon = PROPERTY_TYPE_ICONS[def.type]
    if (def.type === 'checkbox') {
      if (value !== true) continue
      pills.push({
        name: def.name,
        node: (
          <>
            <Icon size={11} aria-hidden />
            <span className="ppill-name">{def.name}</span>
          </>
        ),
      })
      continue
    }
    const shown = Array.isArray(value) ? (value[0] == null ? undefined : String(value[0])) : value == null || value === '' ? undefined : String(value)
    if (shown === undefined) continue
    pills.push({
      name: def.name,
      node: (
        <>
          <Icon size={11} aria-hidden />
          <span className="ppill-name">{def.name}</span>
          <b className="ppill-value">{shown}</b>
        </>
      ),
    })
  }
  return pills
}

/**
 * One entry in the All, Clips and Screenshots grids (extension.md §2.3): on top what it holds — the first lines of a
 * clip, the picture of a screenshot — and below its title, tags, type, source and time. Its name is the title and
 * those details; the clip's words are its description, so a reader hears what the card is before all of what it says.
 * `onChanged` gives a screenshot its own download and delete (the Screenshots view).
 */
export function EntryCard({
  entry,
  registry,
  selected,
  onOpen,
  onChanged,
  selecting,
  checked,
  atCap,
  onToggleSelect,
}: {
  entry: EntryRecord
  registry: PropertyDefinition[]
  selected?: boolean
  onOpen(): void
  onChanged?(): void
  /** Selection mode (download.md §3.2): the card's click toggles selection instead of opening the drawer. */
  selecting?: boolean
  checked?: boolean
  /** The selection is full and this card is not in it: the marker greys out and the card stops taking picks (download.md §3.2). */
  atCap?: boolean
  onToggleSelect?(shift: boolean): void
}) {
  const url = useAssetUrl(entry.type === 'screenshot' ? entry.assetId : undefined)
  const title = String(entry.properties['title'] ?? '')
  const tags = (entry.properties['tags'] as string[] | undefined) ?? []
  const highlights = entry.highlights?.length ?? 0
  const pills = propertyPills(entry, registry)
  const excerpt =
    entry.type === 'clip'
      ? markdownToPlainText(entry.content)
          .replace(/\n{2,}/g, '\n')
          .slice(0, EXCERPT_CHARS)
      : ''
  const id = (part: string) => `card-${part}-${entry.id}`
  const named = [title && id('title'), (tags.length > 0 || pills.length > 0) && id('tags'), id('meta')].filter(Boolean).join(' ')
  return (
    <li
      className={`entry-card${selected ? ' entry-card-selected' : ''}${selecting ? ' entry-card-selecting' : ''}${selecting && checked ? ' entry-card-checked' : ''}${selecting && atCap && !checked ? ' entry-card-off' : ''}`}
      data-type={entry.type}
      data-entry-id={entry.id}
    >
      <button
        type="button"
        className="entry-card-open"
        onClick={event => (selecting ? onToggleSelect?.(event.shiftKey) : onOpen())}
        onKeyDown={event => {
          if (!selecting) return
          // a checkbox takes Space, never Enter; Shift+Space takes the range like Shift+click (download.md §3.2)
          if (event.key === 'Enter') {
            event.preventDefault()
            return
          }
          if (event.key === ' ') {
            event.preventDefault()
            onToggleSelect?.(event.shiftKey)
          }
        }}
        aria-labelledby={named}
        aria-describedby={excerpt ? id('excerpt') : undefined}
        {...(selecting ? { 'role': 'checkbox', 'aria-checked': checked === true, 'aria-disabled': atCap && !checked ? true : undefined } : {})}
      >
        {entry.type === 'clip' ? (
          <span className="entry-card-preview">
            <span className="entry-card-excerpt" id={id('excerpt')}>
              {excerpt}
            </span>
          </span>
        ) : url ? (
          <img
            className="entry-card-preview"
            src={url}
            alt=""
            loading="lazy"
            onLoad={event => {
              // a long capture fills the box from the top instead of shrinking to a sliver (extension.md §2.3)
              const image = event.currentTarget
              image.dataset.tall = image.naturalHeight / image.naturalWidth >= 2 ? 'true' : 'false'
            }}
          />
        ) : (
          <span className="entry-card-preview screenshot-placeholder" aria-hidden>
            <Scan size={28} />
          </span>
        )}
        <span className="entry-card-body">
          {title && (
            <span className="entry-card-title" id={id('title')}>
              {title}
            </span>
          )}
          {(tags.length > 0 || pills.length > 0) && (
            <span className="entry-card-tags" id={id('tags')}>
              {tags.map(tag => (
                <span key={tag} className="tag">
                  #{tag}
                </span>
              ))}
              {pills.map(pill => (
                <span key={pill.name} className="ppill">
                  {pill.node}
                </span>
              ))}
            </span>
          )}
          {/* the card's last line: type, source and time on one row, the highlight count at its end (extension.md §2.3) */}
          <span className="entry-card-meta" id={id('meta')}>
            <TypeChip type={entry.type} />
            <span className="entry-card-source">
              {entry.sourceHost} · {relativeTime(entry.createdAt)}
            </span>
            {highlights > 0 && (
              <span className="entry-card-highlights">
                <Highlighter size={13} aria-hidden />
                {uiText('library.highlightsCount', { count: highlights })}
              </span>
            )}
          </span>
        </span>
      </button>
      {selecting && (
        <span className="entry-card-mark" aria-hidden>
          <Check size={12} />
        </span>
      )}
      {onChanged && entry.type === 'screenshot' && <ScreenshotActions entry={entry} url={url} onChanged={onChanged} />}
    </li>
  )
}

/** A screenshot card's download and delete, shown on hover and focus (extension.md §2.3). */
function ScreenshotActions({ entry, url, onChanged }: { entry: EntryRecord; url: string | null; onChanged(): void }) {
  const download = async () => {
    if (!url) return
    try {
      await chrome.downloads.download({ url, filename: `AnnHub/screenshot-${entry.id}.png`, saveAs: false })
    } catch {
      window.alert(uiText('shot.error.downloadFailed'))
    }
  }
  const remove = async () => {
    if (!window.confirm(uiText('library.deleteConfirm'))) return
    const response = await MessageUtils.sendMessage({ type: 'DELETE_ENTRY', id: entry.id })
    if (response.success) onChanged()
    else window.alert(entryErrorText(response.error))
  }
  return (
    <div className="entry-card-actions">
      <button type="button" disabled={!url} title={uiText('library.downloadImage')} aria-label={uiText('library.downloadImage')} onClick={() => void download()}>
        <Download size={16} />
      </button>
      <button type="button" title={uiText('library.delete')} aria-label={uiText('library.delete')} onClick={() => void remove()}>
        <Trash2 size={16} />
      </button>
    </div>
  )
}

/** The confirm's count is its emphasis: the number lands bold wherever the localized sentence put it (zh and en differ). */

const EXCERPT_CHARS = 480

const CARD_PILL_LIMIT = 2
