import type { CSSProperties, ReactNode } from 'react'
import { ArrowLeft, ArrowUpRight, BookOpen, Lock, MessageSquareText, Plus, Quote, Tags, Trash2, X } from 'lucide-react'
import { Markdown, plainText } from './markdown'
import type { MarkdownLabels } from './markdown'
import { Checkbox, HIGHLIGHT_COLORS, HlDot, Ic, Kbd, PROPERTY_ICON, Pin, ThumbArt, TypeChip, plural } from './parts'
import type { Entry, PropertyDef, PropertyType, PropertyValue, ProductUi } from './types'

export function markdownLabels(ui: ProductUi): MarkdownLabels {
  return { image: ui.types.screenshot, imageUnsaved: ui.reader.imageUnsaved, openOriginal: ui.reader.openOriginal, highlight: name => `${ui.types.highlight}, ${name}` }
}

// ── properties: type icon + name on the left, value on the right (entry.md §5) ───────────────────

function ValueView({ type, value, ui }: { type: PropertyType; value: PropertyValue | undefined; ui: ProductUi }) {
  if (value === undefined || value === '' || (Array.isArray(value) && !value.length)) return null
  if (type === 'list' && Array.isArray(value)) {
    return (
      <>
        {value.map(v => (
          <span key={v} className="ah-vtag">
            {v}
            <Ic icon={X} />
          </span>
        ))}
      </>
    )
  }
  if (type === 'checkbox') return <Checkbox on={value === true} label={value === true ? ui.props.checked : ui.props.unchecked} />
  return <>{String(value)}</>
}

function PropRow({ name, type, children, readOnly, empty }: { name: string; type: PropertyType; children?: ReactNode; readOnly?: boolean; empty?: string }) {
  return (
    <div className={`ah-prow${readOnly ? ' ro' : ''}`}>
      <div className="pk">
        <Ic icon={PROPERTY_ICON[type]} />
        <span className="ah-truncate">{name}</span>
      </div>
      <div className={`pv${children ? '' : ' ph'}`}>{children ?? empty}</div>
      <div className="px">{readOnly ? <Ic icon={Lock} /> : <Ic icon={X} />}</div>
    </div>
  )
}

/** The property panel of an entry: built-in properties first, then the custom ones, then the read-only system fields. */
export function PropertyRows({ entry, registry, ui, system = true }: { entry: Entry; registry: PropertyDef[]; ui: ProductUi; system?: boolean }) {
  const typeOf = (name: string): PropertyType => registry.find(r => r.name === name)?.type ?? 'text'
  const builtin = ['author', 'published', 'description'].filter(n => entry.props[n] !== undefined)
  const custom = registry.filter(r => !r.builtin && entry.props[r.name] !== undefined).map(r => r.name)
  return (
    <>
      <PropRow name="title" type="text">
        {entry.title}
      </PropRow>
      <PropRow name="tags" type="list" empty={ui.props.empty}>
        <ValueView type="list" value={entry.tags} ui={ui} />
        <span className="ah-muted-2">
          <Ic icon={Plus} size={13} />
        </span>
      </PropRow>
      {[...builtin, ...custom].map(name => (
        <PropRow key={name} name={name} type={typeOf(name)} empty={ui.props.empty}>
          <ValueView type={typeOf(name)} value={entry.props[name]} ui={ui} />
        </PropRow>
      ))}
      <div className="ah-prow-add">
        <Ic icon={Plus} />
        {ui.reader.addProperty}
      </div>
      {system ? (
        <>
          <div className="ah-sys-h">{ui.reader.system}</div>
          <PropRow name="source" type="text" readOnly>
            <span className="ah-link ah-truncate">
              {entry.host}
              {entry.path}
            </span>
          </PropRow>
          <PropRow name="created" type="date" readOnly>
            2026-10-05
          </PropRow>
          <PropRow name="type" type="text" readOnly>
            {ui.types[entry.type]}
          </PropRow>
        </>
      ) : null}
    </>
  )
}

// ── detail drawer ────────────────────────────────────────────────────────────────────────────────

export function Drawer({
  entry,
  registry,
  ui,
  onClose,
  onRead,
  pin,
}: {
  entry: Entry
  registry: PropertyDef[]
  ui: ProductUi
  onClose?: () => void
  onRead?: () => void
  pin?: number
}) {
  const n = entry.highlights.length
  return (
    <aside className="ah-drawer" aria-label={entry.title}>
      {pin ? <Pin n={pin} style={{ top: 10, left: -10 }} /> : null}
      <div className="ah-dh">
        <TypeChip type={entry.type} label={ui.types[entry.type]} />
        <span className="ah-grow" />
        {entry.type === 'clip' ? (
          <button type="button" className="ah-btn ah-btn-sm" onClick={onRead} disabled={!onRead} style={{ cursor: onRead ? 'pointer' : 'default' }}>
            <Ic icon={BookOpen} />
            <span>{ui.reader.read}</span>
          </button>
        ) : null}
        <span className="ah-btn ah-btn-sm">
          <Ic icon={ArrowUpRight} />
          <span>{ui.reader.source}</span>
        </span>
        <span className="ah-btn ah-btn-sm ah-btn-icon ah-btn-ghost" aria-hidden="true">
          <Ic icon={Trash2} />
        </span>
        <button
          type="button"
          className="ah-btn ah-btn-sm ah-btn-icon ah-btn-ghost"
          onClick={onClose}
          aria-label={ui.reader.close}
          disabled={!onClose}
          style={{ cursor: onClose ? 'pointer' : 'default' }}
        >
          <Ic icon={X} />
        </button>
      </div>
      <div className="ah-dtitle">
        <div className="t">{entry.title}</div>
        <div className="ah-muted" style={{ fontSize: 11, marginTop: 3 }}>
          {entry.host}
          {entry.path} · {entry.when}
        </div>
      </div>
      <div className="ah-dbody">
        {entry.type === 'screenshot' ? (
          <div className="ah-dsec">
            <div className="h">{ui.types.screenshot}</div>
            <div className="ah-gt-img" style={{ border: '1px solid var(--line)', borderRadius: 10 }}>
              {entry.image ? <ThumbArt kind={entry.image} /> : null}
            </div>
          </div>
        ) : (
          <div className="ah-dsec">
            <div className="h">
              <Ic icon={Quote} />
              {ui.reader.original}
              <span className="ah-grow" />
              {n ? (
                <span className="ah-muted inline-flex items-center gap-1" style={{ fontSize: 11 }}>
                  <Ic icon={Lock} size={12} />
                  {plural(n, ui.reader.locked, ui.reader.lockedOne)}
                </span>
              ) : null}
            </div>
            <Markdown source={entry.content} highlights={entry.highlights} className="ah-md-sm" labels={markdownLabels(ui)} colorNames={ui.colors} />
          </div>
        )}
        <div className="ah-dsec">
          <div className="h">
            <Ic icon={MessageSquareText} />
            {ui.reader.note}
          </div>
          {entry.note ? (
            <div className="ah-textarea" style={{ fontSize: 13, minHeight: 44 }}>
              {entry.note}
            </div>
          ) : (
            <div className="ah-textarea ah-ph" style={{ fontSize: 13, minHeight: 44 }}>
              {ui.edit.note}
            </div>
          )}
        </div>
        <div className="ah-dsec" style={{ borderBottom: 0 }}>
          <div className="h">
            <Ic icon={Tags} />
            {ui.nav.properties}
          </div>
          <PropertyRows entry={entry} registry={registry} ui={ui} />
        </div>
      </div>
      <div className="ah-dfoot">
        <span>
          {entry.when} · {ui.reader.savedLocal}
        </span>
      </div>
    </aside>
  )
}

// ── reading view ─────────────────────────────────────────────────────────────────────────────────

/** The toolbar that appears over selected text in the reading view: five colour dots, a note, and `H` on the keyboard. */
export function HighlightBar({
  ui,
  hover,
  kbd,
  current,
  onPick,
  onDelete,
  style,
  className = '',
}: {
  ui: ProductUi
  hover?: number
  kbd?: boolean
  /** Colour of the highlight being edited. */
  current?: (typeof HIGHLIGHT_COLORS)[number]
  onPick?: (color: (typeof HIGHLIGHT_COLORS)[number]) => void
  onDelete?: () => void
  style?: CSSProperties
  className?: string
}) {
  return (
    <span className={`ah ah-hbar static ${className}`} style={style} role="toolbar" aria-label={ui.types.highlight}>
      <span className="dots" role="group">
        {HIGHLIGHT_COLORS.map((c, i) =>
          onPick ? (
            <button key={c} type="button" className="ah-dotb" title={ui.colors[c]} aria-label={ui.colors[c]} onMouseDown={e => e.preventDefault()} onClick={() => onPick(c)}>
              <HlDot color={c} on={current === c} />
            </button>
          ) : (
            <span key={c} className={`ah-dotb${hover === i ? ' is-hover' : ''}`} title={ui.colors[c]}>
              <HlDot color={c} />
            </span>
          ),
        )}
      </span>
      <i className="sepd" />
      {onDelete ? (
        <button type="button" className="act" onMouseDown={e => e.preventDefault()} onClick={onDelete} style={{ cursor: 'pointer' }}>
          <Ic icon={Trash2} />
          {ui.reader.delete}
        </button>
      ) : (
        <span className="act">
          <Ic icon={MessageSquareText} />
          {ui.reader.note}
        </span>
      )}
      {kbd ? (
        <>
          <i className="sepd" />
          <span className="act">
            <Kbd>H</Kbd>
          </span>
        </>
      ) : null}
    </span>
  )
}

export function Reader({
  entry,
  registry,
  ui,
  tab = 'highlights',
  activeId,
  selection,
  selectionOverlay,
  overlay,
  onBack,
  onTab,
  onHighlight,
  bodyRef,
  pin,
}: {
  entry: Entry
  registry: PropertyDef[]
  ui: ProductUi
  tab?: 'highlights' | 'properties'
  activeId?: string
  selection?: { start: number; end: number } | null
  selectionOverlay?: ReactNode
  overlay?: ReactNode
  onBack?: () => void
  onTab?: (tab: 'highlights' | 'properties') => void
  onHighlight?: (id: string) => void
  bodyRef?: React.Ref<HTMLDivElement>
  pin?: number
}) {
  const tabBtn = (id: 'highlights' | 'properties', label: string, count?: number) => {
    const cls = `ah-rd-tab${tab === id ? ' on' : ''}`
    const inner = (
      <>
        {label}
        {count != null ? <b>{count}</b> : null}
      </>
    )
    return onTab ? (
      <button key={id} type="button" role="tab" aria-selected={tab === id} className={cls} onClick={() => onTab(id)}>
        {inner}
      </button>
    ) : (
      <span key={id} role="tab" aria-selected={tab === id} className={cls}>
        {inner}
      </span>
    )
  }
  return (
    <div className="ah-rd">
      <div className="ah-rd-main">
        <div className="ah-rd-bar">
          <button type="button" className="ah-btn ah-btn-sm ah-btn-ghost" onClick={onBack} disabled={!onBack} style={{ cursor: onBack ? 'pointer' : 'default' }}>
            <Ic icon={ArrowLeft} />
            <span>{ui.reader.back}</span>
          </button>
          <span className="ah-grow" />
          <span className="ah-btn ah-btn-sm">
            <Ic icon={ArrowUpRight} />
            <span>{ui.reader.source}</span>
          </span>
        </div>
        <div className="ah-rd-col">
          <div className="ah-rd-head">
            <h3>{entry.title}</h3>
            <div className="ah-rd-meta">
              <TypeChip type={entry.type} label={ui.types[entry.type]} small />
              <span>
                {entry.host}
                {entry.path}
              </span>
              <span>·</span>
              <span>{entry.when}</span>
              {entry.tags.map(t => (
                <span key={t} className="ah-tag">
                  #{t}
                </span>
              ))}
            </div>
          </div>
          <div ref={bodyRef}>
            <Markdown
              source={entry.content}
              highlights={entry.highlights}
              activeId={activeId}
              selection={selection}
              selectionOverlay={selectionOverlay}
              className="ah-md-rd"
              labels={markdownLabels(ui)}
              colorNames={ui.colors}
              onHighlight={onHighlight}
            />
          </div>
          {overlay}
        </div>
      </div>
      <aside className="ah-rd-rail" aria-label={`${ui.types.highlight} / ${ui.nav.properties}`} style={{ position: 'relative' }}>
        {pin ? <Pin n={pin} style={{ top: 10, left: 10 }} /> : null}
        <div className="ah-rd-tabs" role="tablist">
          {tabBtn('highlights', ui.nav.highlights, entry.highlights.length)}
          {tabBtn('properties', ui.nav.properties)}
        </div>
        <div className="ah-rd-pane">
          {tab === 'properties' ? (
            <div className="ah-rd-props">
              <PropertyRows entry={entry} registry={registry} ui={ui} />
            </div>
          ) : entry.highlights.length ? (
            entry.highlights.map(h => (
              <div key={h.id} className={`ah-hli ah-c-${h.color}${activeId === h.id ? ' on' : ''}`}>
                <i className="bar" />
                <div>
                  <div className="q">{h.quote}</div>
                  {h.note ? (
                    <div className="n">
                      <Ic icon={MessageSquareText} />
                      <span>{h.note}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center text-[12.5px] text-fg-3">
              <b className="text-[13.5px] text-fg-2">{ui.reader.empty}</b>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

export { plainText }
