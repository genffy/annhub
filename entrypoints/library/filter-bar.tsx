/**
 * The list views' search-neighbour filter bar (extension.md §2.3, search.md §3): one self-drawn button
 * per dimension opens a popover; the chosen values stay beside the buttons as removable chips. The
 * semantics are the route's, not the bar's — same dimension OR, across dimensions AND, every change
 * writes the URL through `onChange` (a `Partial<FilterState>`), so nothing here owns filter state.
 *
 * Keyboard model (extension.md §7.2): every trigger and chip stays in the Tab order; a popover takes
 * the focus on open (its search box when it has one, else its first option), ↑ ↓ walk the options,
 * Enter / Space pick, Esc closes only the popover and hands the focus back to whatever opened it, and
 * Tabbing past the popover simply closes it.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Bookmark, Calendar, Check, ChevronDown, Droplet, Globe, LayoutGrid, Scan, SlidersHorizontal, Tag, X, type LucideIcon } from 'lucide-react'
import type { HighlightColor, PropertyDefinition, PropertyType } from '../../core/types'
import { PROPERTY_TYPE_ICONS } from '../../utils/entry-icons'
import { uiText, type UiTextKey } from '../../utils/ui-text'
import { EMPTY_FILTERS, hasActiveFilter, type FilterState, type PropertyFilter, type View } from './route'

/** The five highlight colors a highlights view can filter by (search.md §5). */
const HIGHLIGHT_FILTER_COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink', 'purple']

/** Operators per property type (search.md §3). */
const OPERATORS: Record<PropertyType, { op: PropertyFilter['op']; key: string }[]> = {
  text: [
    { op: 'contains', key: 'library.op.contains' },
    { op: 'equals', key: 'library.op.equals' },
  ],
  list: [{ op: 'has', key: 'library.op.has' }],
  number: [
    { op: 'eq', key: 'library.op.eq' },
    { op: 'gt', key: 'library.op.gt' },
    { op: 'lt', key: 'library.op.lt' },
    { op: 'between', key: 'library.op.between' },
  ],
  checkbox: [{ op: 'is', key: 'library.op.is' }],
  date: [{ op: 'between', key: 'library.op.between' }],
  datetime: [{ op: 'between', key: 'library.op.between' }],
}

const TYPE_NAME_KEYS: Record<PropertyType, UiTextKey> = {
  text: 'property.type.text',
  list: 'property.type.list',
  number: 'property.type.number',
  checkbox: 'property.type.checkbox',
  date: 'property.type.date',
  datetime: 'property.type.datetime',
}

/** What one chosen condition says about itself on its chip. */
function conditionLabel(condition: PropertyFilter, registry: PropertyDefinition[]): string {
  const def = registry.find(item => item.name === condition.prop)
  const opKey = def ? (OPERATORS[def.type].find(entry => entry.op === condition.op)?.key ?? '') : ''
  const op = opKey ? uiText(opKey as 'library.op.contains') : ''
  let value = condition.val
  if (def?.type === 'checkbox') value = condition.val === 'yes' ? uiText('library.value.yes') : uiText('library.value.no')
  if (condition.op === 'between' && condition.val2) value = `${condition.val} ${uiText('library.filter.value2')} ${condition.val2}`
  if (!value) return `${condition.prop}${op ? ` ${op}` : ''}`
  return uiText('library.filter.chip.condition', { prop: condition.prop, op, value })
}

/** What the time range says about itself on its chip. */
function timeLabel(filters: FilterState): string {
  if (filters.from && filters.to) return uiText('library.filter.chip.timeBetween', { from: filters.from, to: filters.to })
  if (filters.from) return uiText('library.filter.chip.timeAfter', { date: filters.from })
  return uiText('library.filter.chip.timeBefore', { date: filters.to })
}

/**
 * One dimension's trigger button and the popover it opens. The popover is a fixed layer, so no scrolling
 * ancestor clips it; when it closes leaving the focus nowhere (Esc, a pick), the focus goes back to
 * whatever opened it — the trigger button or a chip.
 */
function FilterMenu({
  id,
  openId,
  onOpen,
  onClose,
  icon: Icon,
  label,
  focusKey,
  children,
}: {
  id: string
  openId: string | null
  onOpen(id: string): void
  onClose(): void
  icon: LucideIcon
  label: string
  /** Changes when the open popover swaps its content (the property picker becoming an editor): the focus follows in. */
  focusKey?: string
  children: React.ReactNode
}) {
  const open = openId === id
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)

  // Positions the popover imperatively: the layer renders hidden for its first frame (no position yet),
  // and placing it without a second render keeps that first frame from stealing the focus-in — a focus()
  // on a still-hidden control silently does nothing, and the keyboard stayed on the trigger.
  const place = useCallback(() => {
    const box = triggerRef.current?.getBoundingClientRect()
    const pop = popRef.current
    if (!box || !pop) return
    const width = pop.offsetWidth || 360
    pop.style.left = `${Math.min(Math.max(8, box.left), Math.max(8, window.innerWidth - width - 8))}px`
    pop.style.top = `${box.bottom + 6}px`
    pop.dataset.placed = 'true'
  }, [])

  useLayoutEffect(() => {
    if (open) {
      if (!wasOpen.current) openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      wasOpen.current = true
      place()
      popRef.current?.querySelector<HTMLElement>('input, select, [role="option"], button')?.focus()
    } else if (wasOpen.current) {
      wasOpen.current = false
      // a close that leaves the focus nowhere (the option that held it is gone) gives it back to the opener
      if (!document.activeElement || document.activeElement === document.body) (openerRef.current?.isConnected ? openerRef.current : triggerRef.current)?.focus()
    }
  }, [open, place, focusKey])

  useEffect(() => {
    if (!open) return
    const pop = popRef.current
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (pop?.contains(target) || triggerRef.current?.contains(target)) return
      onClose()
    }
    const onFocusOut = () => {
      // Decide once the dust settles: a re-render can swap the content under the focus (the property
      // picker becoming an editor), which first drops the focus and then puts it back inside. Only a
      // focus that ends up outside — where Tab sent it, or nowhere — is a leave.
      window.setTimeout(() => {
        const active = document.activeElement
        if (!popRef.current) return
        if (active && (popRef.current.contains(active) || triggerRef.current?.contains(active))) return
        onClose()
      }, 0)
    }
    const onPlaceAgain = () => place()
    document.addEventListener('pointerdown', onPointerDown)
    pop?.addEventListener('focusout', onFocusOut)
    window.addEventListener('resize', onPlaceAgain)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      pop?.removeEventListener('focusout', onFocusOut)
      window.removeEventListener('resize', onPlaceAgain)
    }
  }, [open, onClose, place])

  return (
    <>
      <button ref={triggerRef} type="button" className="filter-button" aria-haspopup="dialog" aria-expanded={open || undefined} onClick={() => (open ? onClose() : onOpen(id))}>
        <Icon size={13} aria-hidden />
        <span>{label}</span>
        <ChevronDown size={13} aria-hidden />
      </button>
      {open && (
        <div
          ref={popRef}
          className="filter-pop"
          role="dialog"
          aria-label={label}
          onKeyDown={event => {
            if (event.key === 'Escape' && !event.nativeEvent.isComposing && event.keyCode !== 229) {
              // only this innermost layer closes, not whatever sits under it
              event.stopPropagation()
              onClose()
            }
          }}
        >
          {children}
        </div>
      )}
    </>
  )
}

/** The popover's option rows: a listbox the arrows walk, Enter / Space pick, the pointer clicks. */
function OptionList({
  label,
  options,
  selected,
  multiple,
  onToggle,
}: {
  label: string
  options: { value: string; label: string; icon?: LucideIcon; dot?: HighlightColor; aside?: string }[]
  selected: Set<string>
  multiple?: boolean
  onToggle(value: string): void
}) {
  const listRef = useRef<HTMLUListElement>(null)
  const focusFirst = options.findIndex(option => selected.has(option.value))
  return (
    <ul
      ref={listRef}
      className="filter-pop-list"
      role="listbox"
      aria-label={label}
      aria-multiselectable={multiple || undefined}
      onKeyDown={event => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter' && event.key !== ' ') return
        const items = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])]
        const index = items.indexOf(document.activeElement as HTMLElement)
        if (event.key === 'Enter' || event.key === ' ') {
          if (index >= 0) {
            event.preventDefault()
            items[index]?.click()
          }
          return
        }
        event.preventDefault()
        items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
      }}
    >
      {options.map((option, index) => {
        const Icon = option.icon
        const chosen = selected.has(option.value)
        return (
          <li
            key={option.value}
            role="option"
            aria-selected={chosen}
            tabIndex={index === (focusFirst >= 0 ? focusFirst : 0) ? 0 : -1}
            className="filter-pop-option"
            onClick={() => onToggle(option.value)}
          >
            {Icon ? <Icon size={15} aria-hidden /> : option.dot ? <i className={`hl-dot hl-dot-${option.dot}`} aria-hidden /> : null}
            <span className="filter-pop-option-label">{option.label}</span>
            {option.aside && <span className="filter-pop-option-aside">{option.aside}</span>}
            {chosen && <Check size={14} aria-hidden />}
          </li>
        )
      })}
    </ul>
  )
}

/** A searchable multi-select dimension (sources, tags): the box filters, the list toggles values. */
function SearchableOptions({
  dimensionLabel,
  candidates,
  selected,
  onToggle,
}: {
  dimensionLabel: string
  candidates: string[]
  selected: Set<string>
  onToggle(value: string): void
}) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const options = candidates.filter(candidate => !needle || candidate.toLowerCase().includes(needle)).map(candidate => ({ value: candidate, label: candidate }))
  return (
    <>
      <input
        className="filter-pop-search"
        type="search"
        value={query}
        placeholder={uiText('library.filter.searchCandidates', { name: dimensionLabel })}
        aria-label={uiText('library.filter.searchCandidates', { name: dimensionLabel })}
        onChange={event => setQuery(event.target.value)}
      />
      {options.length > 0 ? (
        <OptionList label={dimensionLabel} options={options} selected={selected} multiple onToggle={onToggle} />
      ) : (
        <p className="filter-pop-empty">{uiText('library.filter.noMatches', { name: dimensionLabel })}</p>
      )}
    </>
  )
}

/** The date-range popover: two labelled inputs, each applying as it changes (search.md §3). */
function TimePopover({ filters, onChange }: { filters: FilterState; onChange(patch: Partial<FilterState>): void }) {
  return (
    <div className="filter-pop-time">
      <label>
        <span>{uiText('library.filter.timeFrom')}</span>
        <input type="date" value={filters.from} onChange={event => onChange({ from: event.target.value })} />
      </label>
      <label>
        <span>{uiText('library.filter.timeTo')}</span>
        <input type="date" value={filters.to} onChange={event => onChange({ to: event.target.value })} />
      </label>
    </div>
  )
}

/**
 * The property popover: pick a property from the registry first, then the operator the type allows and
 * the value(s) (search.md §3). Picking switches the popover to editing that condition; every edit
 * patches the route at once, exactly as the inline controls did.
 */
function PropertyPopover({
  registry,
  condition,
  onPick,
  onPatch,
}: {
  registry: PropertyDefinition[]
  condition: PropertyFilter | null
  onPick(name: string): void
  onPatch(patch: Partial<PropertyFilter>): void
}) {
  const [query, setQuery] = useState('')
  const def = condition ? registry.find(item => item.name === condition.prop) : undefined
  if (condition && def) {
    const operators = OPERATORS[def.type]
    const inputType = def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : def.type === 'datetime' ? 'datetime-local' : 'text'
    const Icon = PROPERTY_TYPE_ICONS[def.type]
    return (
      <div className="filter-pop-prop">
        <div className="filter-pop-prop-head">
          <Icon size={15} aria-hidden />
          <span className="filter-pop-prop-name">{def.name}</span>
          <span className="filter-pop-prop-type">{uiText(TYPE_NAME_KEYS[def.type])}</span>
        </div>
        <div className="filter-pop-prop-row">
          {operators.length > 1 && (
            <select
              className="filter-pop-control"
              value={condition.op}
              aria-label={uiText('library.filter.operator')}
              onChange={event => onPatch({ op: event.target.value, val: '', val2: '' })}
            >
              {operators.map(({ op, key }) => (
                <option key={op} value={op}>
                  {uiText(key as 'library.op.contains')}
                </option>
              ))}
            </select>
          )}
          {def.type === 'checkbox' ? (
            <select className="filter-pop-control" value={condition.val} aria-label={uiText('library.filter.value')} onChange={event => onPatch({ val: event.target.value })}>
              <option value="">{uiText('library.filter.value')}: —</option>
              <option value="yes">{uiText('library.value.yes')}</option>
              <option value="no">{uiText('library.value.no')}</option>
            </select>
          ) : (
            <input
              className="filter-pop-control"
              type={inputType}
              value={condition.val}
              aria-label={uiText('library.filter.value')}
              onChange={event => onPatch({ val: event.target.value })}
            />
          )}
          {def.type !== 'checkbox' && condition.op === 'between' && (
            <input
              className="filter-pop-control"
              type={inputType}
              value={condition.val2}
              aria-label={uiText('library.filter.value2')}
              onChange={event => onPatch({ val2: event.target.value })}
            />
          )}
        </div>
        <p className="filter-pop-hint">{uiText('library.filter.opHint')}</p>
      </div>
    )
  }
  const needle = query.trim().toLowerCase()
  const options = registry
    .filter(item => !needle || item.name.toLowerCase().includes(needle))
    .map(item => ({ value: item.name, label: item.name, icon: PROPERTY_TYPE_ICONS[item.type], aside: uiText(TYPE_NAME_KEYS[item.type]) }))
  return (
    <>
      <input
        className="filter-pop-search"
        type="search"
        value={query}
        placeholder={uiText('library.filter.searchCandidates', { name: uiText('library.filter.property') })}
        aria-label={uiText('library.filter.searchCandidates', { name: uiText('library.filter.property') })}
        onChange={event => setQuery(event.target.value)}
      />
      {options.length > 0 ? (
        <OptionList label={uiText('library.filter.property')} options={options} selected={new Set()} onToggle={value => onPick(value)} />
      ) : (
        <p className="filter-pop-empty">{uiText('library.filter.noMatches', { name: uiText('library.filter.property') })}</p>
      )}
    </>
  )
}

/** One chosen value beside the buttons: its body reopens the dimension's popover, its × removes it. */
function FilterChip({ icon, dot, label, onOpen, onRemove }: { icon?: LucideIcon; dot?: HighlightColor; label: string; onOpen(): void; onRemove(): void }) {
  const Icon = icon
  return (
    <span className="filter-chip-on">
      <button type="button" className="filter-chip-open" aria-haspopup="dialog" onClick={onOpen} title={label}>
        {Icon ? <Icon size={13} aria-hidden /> : dot ? <i className={`hl-dot hl-dot-${dot}`} aria-hidden /> : null}
        <span className="filter-chip-label">{label}</span>
      </button>
      <button type="button" className="filter-chip-x" aria-label={uiText('library.filter.remove', { name: label })} onClick={onRemove}>
        <X size={12} aria-hidden />
      </button>
    </span>
  )
}

export function FilterBar({
  view,
  filters,
  hosts,
  tags,
  registry,
  countLabel,
  onChange,
}: {
  view: View
  filters: FilterState
  hosts: string[]
  tags: string[]
  registry: PropertyDefinition[]
  countLabel: string
  onChange(patch: Partial<FilterState>): void
}) {
  /** The open popover's dimension, plus — for the property popover — which condition it edits (`null` picks a new property). */
  const [openId, setOpenId] = useState<string | null>(null)
  const [conditionIndex, setConditionIndex] = useState<number | null>(null)
  const close = () => setOpenId(null)
  /** Opening a dimension from a trigger or a chip: the property dimension carries the condition it edits. */
  const openMenu = (id: string, index: number | null = null) => {
    setConditionIndex(index)
    setOpenId(id)
  }

  return (
    <div className="toolbar" role="group" aria-label={uiText('library.filters')}>
      {view === 'all' && (
        <FilterMenu id="type" openId={openId} onOpen={openMenu} onClose={close} icon={LayoutGrid} label={uiText('library.filter.type')}>
          <OptionList
            label={uiText('library.filter.type')}
            options={[
              { value: 'clip', label: uiText('library.clips'), icon: Bookmark },
              { value: 'screenshot', label: uiText('library.screenshots'), icon: Scan },
            ]}
            selected={filters.type ? new Set([filters.type]) : new Set()}
            onToggle={value => {
              onChange({ type: filters.type === value ? '' : (value as FilterState['type']) })
              close()
            }}
          />
        </FilterMenu>
      )}
      {view === 'highlights' && (
        <FilterMenu id="color" openId={openId} onOpen={openMenu} onClose={close} icon={Droplet} label={uiText('library.filter.color')}>
          <OptionList
            label={uiText('library.filter.color')}
            options={HIGHLIGHT_FILTER_COLORS.map(color => ({ value: color, label: uiText(`library.color.${color}` as 'library.color.yellow'), dot: color }))}
            selected={new Set(filters.colors)}
            multiple
            onToggle={value => {
              onChange({ colors: filters.colors.includes(value) ? filters.colors.filter(item => item !== value) : [...filters.colors, value] })
            }}
          />
        </FilterMenu>
      )}
      {hosts.length > 0 && (
        <FilterMenu id="host" openId={openId} onOpen={openMenu} onClose={close} icon={Globe} label={uiText('library.filter.host')}>
          <SearchableOptions
            dimensionLabel={uiText('library.filter.host')}
            candidates={hosts}
            selected={new Set(filters.hosts)}
            onToggle={value => {
              onChange({ hosts: filters.hosts.includes(value) ? filters.hosts.filter(item => item !== value) : [...filters.hosts, value] })
            }}
          />
        </FilterMenu>
      )}
      {tags.length > 0 && (
        <FilterMenu id="tag" openId={openId} onOpen={openMenu} onClose={close} icon={Tag} label={uiText('library.filter.tag')}>
          <SearchableOptions
            dimensionLabel={uiText('library.filter.tag')}
            candidates={tags}
            selected={new Set(filters.tags)}
            onToggle={value => {
              onChange({ tags: filters.tags.includes(value) ? filters.tags.filter(item => item !== value) : [...filters.tags, value] })
            }}
          />
        </FilterMenu>
      )}
      <FilterMenu id="time" openId={openId} onOpen={openMenu} onClose={close} icon={Calendar} label={uiText('library.filter.time')}>
        <TimePopover filters={filters} onChange={onChange} />
      </FilterMenu>
      {registry.length > 0 && (
        <FilterMenu
          id="prop"
          openId={openId}
          onOpen={openMenu}
          onClose={close}
          icon={SlidersHorizontal}
          label={uiText('library.filter.property')}
          focusKey={conditionIndex === null ? 'pick' : `edit-${conditionIndex}-${filters.conditions[conditionIndex]?.prop ?? ''}`}
        >
          <PropertyPopover
            registry={registry}
            condition={conditionIndex !== null ? (filters.conditions[conditionIndex] ?? null) : null}
            onPick={name => {
              const def = registry.find(item => item.name === name)
              onChange({ conditions: [...filters.conditions, { prop: name, op: def ? OPERATORS[def.type][0]!.op : '', val: '', val2: '' }] })
              setConditionIndex(filters.conditions.length)
            }}
            onPatch={patch => {
              if (conditionIndex === null) return
              onChange({ conditions: filters.conditions.map((item, at) => (at === conditionIndex ? { ...item, ...patch } : item)) })
            }}
          />
        </FilterMenu>
      )}

      {view === 'all' && filters.type && (
        <FilterChip
          icon={LayoutGrid}
          label={uiText('library.filter.chip.type', { name: uiText(filters.type === 'clip' ? 'library.clips' : 'library.screenshots') })}
          onOpen={() => openMenu('type')}
          onRemove={() => onChange({ type: '' })}
        />
      )}
      {view === 'highlights' &&
        filters.colors.map(color => (
          <FilterChip
            key={`color-${color}`}
            dot={color as HighlightColor}
            label={uiText(`library.color.${color}` as 'library.color.yellow')}
            onOpen={() => openMenu('color')}
            onRemove={() => onChange({ colors: filters.colors.filter(item => item !== color) })}
          />
        ))}
      {filters.hosts.map(host => (
        <FilterChip
          key={`host-${host}`}
          icon={Globe}
          label={uiText('library.filter.chip.host', { name: host })}
          onOpen={() => openMenu('host')}
          onRemove={() => onChange({ hosts: filters.hosts.filter(item => item !== host) })}
        />
      ))}
      {filters.tags.map(tag => (
        <FilterChip
          key={`tag-${tag}`}
          icon={Tag}
          label={uiText('library.filter.chip.tag', { name: tag })}
          onOpen={() => openMenu('tag')}
          onRemove={() => onChange({ tags: filters.tags.filter(item => item !== tag) })}
        />
      ))}
      {(filters.from || filters.to) && <FilterChip icon={Calendar} label={timeLabel(filters)} onOpen={() => openMenu('time')} onRemove={() => onChange({ from: '', to: '' })} />}
      {filters.conditions.map((condition, index) =>
        condition.prop ? (
          <FilterChip
            key={`cond-${condition.prop}-${index}`}
            icon={SlidersHorizontal}
            label={conditionLabel(condition, registry)}
            onOpen={() => openMenu('prop', index)}
            onRemove={() => onChange({ conditions: filters.conditions.filter((_, at) => at !== index) })}
          />
        ) : null,
      )}

      <span className="count" data-testid="list-count">
        {countLabel}
      </span>
      {hasActiveFilter({ view, ...filters }) && (
        <button type="button" className="link" onClick={() => onChange({ ...EMPTY_FILTERS })}>
          {uiText('library.clearFilters')}
        </button>
      )}
    </div>
  )
}
