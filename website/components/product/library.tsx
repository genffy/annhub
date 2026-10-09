import type { CSSProperties, ReactNode } from 'react'
import {
  ArrowUpRight,
  Calendar,
  Download,
  Globe,
  Highlighter,
  Keyboard,
  LayoutGrid,
  Library,
  MessageSquareText,
  PanelLeftClose,
  Search,
  Settings,
  SlidersHorizontal,
  SquareCheck,
  Tag,
  Tags,
  Trash2,
  Text as TextLines,
  Hash,
  X,
  Scan,
  Bookmark,
  ChevronDown,
} from 'lucide-react'
import Logo from '../logo'
import { plainText } from './markdown'
import { Checkbox, Ic, Kbd, PROPERTY_ICON, Pin, Tags as TagList, Thumb, ThumbArt, TypeChip, TypeTile, plural } from './parts'
import type { Sample } from './sample'
import type { Entry, EntryType, PropertyDef, ProductUi } from './types'

export type LibraryView = 'all' | 'clip' | 'highlight' | 'screenshot' | 'properties'

// ── the shell: left navigation + right content, the same on every page of the extension ──────────

const NAV: {
  id: LibraryView
  icon: typeof Library
  type?: EntryType | 'highlight'
  key: 'all' | 'clips' | 'highlights' | 'screenshots' | 'properties'
  count: keyof Sample['counts']
}[] = [
  { id: 'all', icon: Library, key: 'all', count: 'all' },
  { id: 'clip', icon: Bookmark, type: 'clip', key: 'clips', count: 'clip' },
  { id: 'highlight', icon: Highlighter, type: 'highlight', key: 'highlights', count: 'highlight' },
  { id: 'screenshot', icon: Scan, type: 'screenshot', key: 'screenshots', count: 'screenshot' },
]

export function AppShell({
  ui,
  active,
  counts,
  rail,
  onNavigate,
  onExport,
  children,
  drawer,
  className = '',
  style,
  pins,
}: {
  ui: ProductUi
  active: LibraryView | 'settings'
  counts: Sample['counts']
  rail?: boolean
  onNavigate?: (view: LibraryView) => void
  onExport?: () => void
  children: ReactNode
  drawer?: ReactNode
  className?: string
  style?: CSSProperties
  pins?: { nav?: number; export?: number }
}) {
  const item = (id: LibraryView | 'settings', icon: typeof Library, label: string, count?: number, type?: EntryType | 'highlight') => {
    const cls = `ah-nav-i${type ? ` ah-t-${type}` : ''}${id === active ? ' on' : ''}`
    const inner = (
      <>
        <Ic icon={icon} />
        <span>{label}</span>
        {count != null ? <span className="n">{count}</span> : null}
      </>
    )
    if (onNavigate && id !== 'settings') {
      return (
        <button key={id} type="button" className={cls} title={label} aria-current={id === active ? 'page' : undefined} onClick={() => onNavigate(id)}>
          {inner}
        </button>
      )
    }
    return (
      <div key={id} className={cls} title={label} aria-current={id === active ? 'page' : undefined}>
        {inner}
      </div>
    )
  }
  return (
    <div className={`ah ah-app${rail ? ' is-rail' : ''} ${className}`} style={style}>
      <div className="ah-app-in">
        <nav className="ah-nav" aria-label={ui.nav.library} style={{ position: 'relative' }}>
          {pins?.nav ? <Pin n={pins.nav} style={{ top: 8, right: 8 }} /> : null}
          <div className="ah-nav-top">
            <div className="ah-nav-brand">
              <Logo className="ah-i" />
              <span>AnnHub</span>
            </div>
            <span className="ah-nav-fold" aria-hidden="true">
              <Ic icon={PanelLeftClose} />
            </span>
          </div>
          <div className="ah-nav-label">{ui.nav.library}</div>
          {NAV.map(n => item(n.id, n.icon, ui.nav[n.key], counts[n.count], n.type))}
          <div className="ah-nav-label">{ui.nav.manage}</div>
          {item('properties', Tags, ui.nav.properties, counts.props)}
          {item('settings', Settings, ui.nav.settings)}
          <div className="ah-nav-foot">
            <div className="ah-meter">
              <div className="ah-meter-row">
                <span>{ui.nav.storage}</span>
                <span className="ah-tnum">126 MB</span>
              </div>
              <div className="ah-progress">
                <i style={{ width: '12%' }} />
              </div>
            </div>
            <div style={{ position: 'relative' }}>
              {pins?.export ? <Pin n={pins.export} style={{ top: -9, right: -6, left: 'auto' }} /> : null}
              {onExport ? (
                <button type="button" className="ah-btn ah-btn-block ah-btn-export" onClick={onExport}>
                  <Ic icon={Download} />
                  <span>{ui.nav.export}</span>
                </button>
              ) : (
                <span className="ah-btn ah-btn-block ah-btn-export">
                  <Ic icon={Download} />
                  <span>{ui.nav.export}</span>
                </span>
              )}
            </div>
            <div className="ah-hint hide-rail">
              <Ic icon={Keyboard} />
              <span>{ui.nav.shortcut}</span>
              <Kbd>⌘</Kbd>
              <Kbd>⇧</Kbd>
              <Kbd>S</Kbd>
            </div>
          </div>
        </nav>
        <div className="ah-main">
          {children}
          {drawer}
        </div>
      </div>
    </div>
  )
}

export function PageHead({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="ah-phead">
      <div className="ah-grow">
        <h3>{title}</h3>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
      {right}
    </div>
  )
}

export function SearchBox({ ui, query, focus, onChange }: { ui: ProductUi; query?: string; focus?: boolean; onChange?: (query: string) => void }) {
  return (
    <div className={`ah-search${focus ? ' is-focus' : ''}`}>
      <Ic icon={Search} />
      {onChange ? (
        <input type="search" value={query ?? ''} onChange={e => onChange(e.target.value)} placeholder={ui.list.search} aria-label={ui.list.search} />
      ) : (
        <span className="ah-truncate">{query || ui.list.search}</span>
      )}
      {query ? null : (
        <>
          {onChange ? null : <span className="ah-grow" />}
          <Kbd>/</Kbd>
        </>
      )}
    </div>
  )
}

/** Type, source, tags, time and property; the filters in force are drawn as filled chips. */
export function FilterBar({ ui, showType = true, active = [], count }: { ui: ProductUi; showType?: boolean; active?: { icon: typeof Tag; label: string }[]; count: number }) {
  const chip = (icon: typeof Tag, label: string) => (
    <span key={label} className="ah-fchip">
      <Ic icon={icon} />
      {label}
      <Ic icon={ChevronDown} />
    </span>
  )
  return (
    <div className="ah-fbar">
      {showType ? chip(LayoutGrid, ui.list.type) : null}
      {chip(Globe, ui.list.source)}
      {chip(Tag, ui.list.tags)}
      {chip(Calendar, ui.list.time)}
      {chip(SlidersHorizontal, ui.list.property)}
      {active.map(a => (
        <span key={a.label} className="ah-fchip on">
          <Ic icon={a.icon} />
          {a.label}
          <Ic icon={X} />
        </span>
      ))}
      <span className="ah-grow" />
      <span className="ah-muted" style={{ fontSize: 12.5 }}>
        {plural(count, ui.list.count, ui.list.countOne)}
      </span>
      {active.length ? (
        <span className="ah-link" style={{ fontSize: 12.5 }}>
          {ui.list.clear}
        </span>
      ) : null}
    </div>
  )
}

/** Custom properties shown as small pills in a row: project, reviewed, priority. */
function PropertyPills({ entry }: { entry: Entry }) {
  const { project, reviewed, priority } = entry.props
  return (
    <>
      {typeof project === 'string' ? (
        <span className="ah-ppill">
          <Ic icon={TextLines} />
          <span>project</span>
          <b>{project}</b>
        </span>
      ) : null}
      {reviewed === true ? (
        <span className="ah-ppill">
          <Ic icon={SquareCheck} />
          <span>reviewed</span>
        </span>
      ) : null}
      {typeof priority === 'number' ? (
        <span className="ah-ppill">
          <Ic icon={Hash} />
          <span>priority</span>
          <b>{priority}</b>
        </span>
      ) : null}
    </>
  )
}

export function EntryRow({ entry, ui, selected, hover, onOpen, pin }: { entry: Entry; ui: ProductUi; selected?: boolean; hover?: boolean; onOpen?: () => void; pin?: number }) {
  const isShot = entry.type === 'screenshot'
  const body = (
    <>
      {pin ? <Pin n={pin} style={{ top: 6, left: 'auto', right: 8 }} /> : null}
      <TypeTile type={entry.type} />
      <div style={{ minWidth: 0 }}>
        <div className={`tx ah-clamp-2${isShot ? ' ah-b' : ''}`}>{isShot ? entry.title : plainText(entry.content)}</div>
        <div className="meta">
          <TypeChip type={entry.type} label={ui.types[entry.type]} small />
          {isShot ? null : <span className="ttl ah-truncate">{entry.title}</span>}
          <span>{entry.host}</span>
          <span>·</span>
          <span>{entry.when}</span>
          <TagList tags={entry.tags} />
          <PropertyPills entry={entry} />
          {entry.highlights.length ? (
            <span className="ah-hlc">
              <Ic icon={Highlighter} size={13} />
              {plural(entry.highlights.length, ui.list.highlightCount, ui.list.highlightCountOne)}
            </span>
          ) : null}
        </div>
      </div>
      <div className="side">
        {entry.image ? <Thumb kind={entry.image} /> : null}
        <span className="acts" aria-hidden="true">
          <span className="ah-acts-btn">
            <Ic icon={ArrowUpRight} />
          </span>
          <span className="ah-acts-btn">
            <Ic icon={Trash2} />
          </span>
        </span>
      </div>
    </>
  )
  const cls = `ah-erow${selected ? ' sel' : ''}${hover ? ' hov' : ''}`
  return onOpen ? (
    <button type="button" className={cls} onClick={onOpen} style={{ position: 'relative' }}>
      {body}
    </button>
  ) : (
    <div className={cls} style={{ position: 'relative' }}>
      {body}
    </div>
  )
}

export function EntryList({
  entries,
  ui,
  selectedId,
  hoverId,
  onOpen,
  pins = {},
}: {
  entries: Entry[]
  ui: ProductUi
  selectedId?: string
  hoverId?: string
  onOpen?: (id: string) => void
  pins?: Record<string, number>
}) {
  return (
    <div className="ah-list">
      {entries.map(e => (
        <EntryRow key={e.id} entry={e} ui={ui} selected={e.id === selectedId} hover={e.id === hoverId} onOpen={onOpen ? () => onOpen(e.id) : undefined} pin={pins[e.id]} />
      ))}
    </div>
  )
}

/** Highlights view: one group per clip, each line a highlight with its quote and note (extension.md §2.3). */
export function HighlightGroups({ entries, ui, onOpen }: { entries: Entry[]; ui: ProductUi; onOpen?: (entryId: string, highlightId: string) => void }) {
  return (
    <>
      {entries
        .filter(e => e.highlights.length)
        .map(e => (
          <div key={e.id} className="ah-hg">
            <div className="ah-hg-h">
              <span className="ah-favicon" />
              <span className="ttl ah-truncate">{e.title}</span>
              <span className="host ah-truncate">{e.host}</span>
              <span className="ah-grow" />
              <span className="ah-chip">{plural(e.highlights.length, ui.list.highlightCount, ui.list.highlightCountOne)}</span>
              <span className="ah-link inline-flex items-center gap-1" style={{ fontSize: 12 }}>
                {ui.reader.source}
                <Ic icon={ArrowUpRight} size={13} />
              </span>
            </div>
            {e.highlights.map(h => {
              const inner = (
                <>
                  <i className="bar" />
                  <div style={{ minWidth: 0 }}>
                    <div className="tx">{h.quote}</div>
                    {h.note ? (
                      <div className="note">
                        <Ic icon={MessageSquareText} />
                        <span>{h.note}</span>
                      </div>
                    ) : null}
                  </div>
                </>
              )
              const cls = `ah-hr ah-c-${h.color}`
              return onOpen ? (
                <button key={h.id} type="button" className={cls} onClick={() => onOpen(e.id, h.id)}>
                  {inner}
                </button>
              ) : (
                <div key={h.id} className={cls}>
                  {inner}
                </div>
              )
            })}
          </div>
        ))}
    </>
  )
}

export function ScreenshotGallery({ entries, selectedId, onOpen }: { entries: Entry[]; selectedId?: string; onOpen?: (id: string) => void }) {
  return (
    <div className="ah-gal">
      {entries
        .filter(e => e.type === 'screenshot')
        .map(e => {
          const inner = (
            <>
              <div className="ah-gt-img">{e.image ? <ThumbArt kind={e.image} /> : null}</div>
              <div className="ah-gt-b">
                <div className="ah-b ah-clamp-1" style={{ fontSize: 13 }}>
                  {e.title}
                </div>
                <div className="ah-muted" style={{ fontSize: 11 }}>
                  {e.host} · {e.when}
                </div>
                {e.tags.length ? (
                  <div className="flex flex-wrap gap-1" style={{ marginTop: 4 }}>
                    <TagList tags={e.tags} />
                  </div>
                ) : null}
              </div>
            </>
          )
          const cls = `ah-gt${e.id === selectedId ? ' sel' : ''}`
          return onOpen ? (
            <button key={e.id} type="button" className={cls} onClick={() => onOpen(e.id)}>
              {inner}
            </button>
          ) : (
            <div key={e.id} className={cls}>
              {inner}
            </div>
          )
        })}
    </div>
  )
}

/** The property registry: name and type are bound for the whole library; presets decide what a new entry gets. */
export function PropertyTable({ registry, ui }: { registry: PropertyDef[]; ui: ProductUi }) {
  return (
    <div className="ah-ptab">
      <div className="ah-ptab-h">
        <div>{ui.props.name}</div>
        <div>{ui.props.type}</div>
        <div>{ui.props.defaultValue}</div>
        <div style={{ textAlign: 'right' }}>{ui.props.usage}</div>
        <div className="ck">{ui.types.clip}</div>
        <div className="ck">{ui.types.screenshot}</div>
      </div>
      {registry.map(r => (
        <div key={r.name} className="ah-ptab-r">
          <div className="nm">
            <Ic icon={PROPERTY_ICON[r.type]} />
            <span className="ah-truncate">{r.name}</span>
            {r.fixed ? <span className="ah-chip">{ui.props.fixed}</span> : r.builtin ? <span className="ah-chip">{ui.props.builtin}</span> : null}
          </div>
          <div className="ty">{ui.props.types[r.type]}</div>
          <div className="df ah-truncate">{r.defaultValue || '—'}</div>
          <div className="us">{r.used}</div>
          {(['clip', 'screenshot'] as const).map(t => (
            <div key={t} className="ck" style={r.fixed ? { opacity: 0.55 } : undefined}>
              <Checkbox on={r.presets.includes(t)} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
