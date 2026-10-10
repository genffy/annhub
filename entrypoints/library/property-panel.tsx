/**
 * The property panel shared by the detail drawer and the reading view's
 * side column (extension.md §4.1). Every row is the type icon, the name
 * and a value editor for the type; values save on blur, clearing equals
 * unset (entry.md §5.3.7). Adding a name autocompletes from the registry;
 * an unknown name asks for its type first and registers in the same write.
 * System fields show read-only; `type` and `id` are not properties at all.
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import MessageUtils from '../../utils/message'
import type { EntryRecord, PropertyDefinition, PropertyType, PropertyValue } from '../../learning-core/types'
import { PROPERTY_TYPE_ICONS } from '../../utils/entry-icons'
import { normalizeTags, PROPERTY_LIST_ITEM_MAX, PROPERTY_LIST_ITEMS_MAX, PROPERTY_TEXT_MAX, TAG_LENGTH_MAX, TAGS_MAX } from '../../learning-core/properties'
import { PROPERTY_TYPES } from '../../learning-core/types'
import { entryErrorText, uiText } from '../../utils/ui-text'

interface Props {
  entry: EntryRecord
  registry: PropertyDefinition[]
  onEntryChanged(entry: EntryRecord): void
}

export interface PropertyPanelHandle {
  flush(): Promise<boolean>
}

interface EditorHandle {
  flush(): Promise<boolean>
}

export const PropertyPanel = forwardRef<PropertyPanelHandle, Props>(function PropertyPanel({ entry, registry, onEntryChanged }, ref) {
  const [adding, setAdding] = useState<{ name: string; type: PropertyType } | null>(null)
  const [pending, setPending] = useState<{ name: string; type: PropertyType } | null>(null)
  const [error, setError] = useState('')
  const editors = useRef(new Map<string, EditorHandle>())

  useImperativeHandle(ref, () => ({
    flush: async () => {
      for (const editor of [...editors.current.values()]) if (!(await editor.flush())) return false
      return true
    },
  }))

  const byKey = useMemo(() => new Map(registry.map(def => [def.name.toLowerCase(), def] as const)), [registry])

  /** Sends a field-level properties patch; resolves false on failure so the draft can stay. */
  async function persist(patch: { set?: Record<string, PropertyValue>; unset?: string[]; newDefinitions?: PropertyDefinition[] }): Promise<boolean> {
    const value = Object.values(patch.set ?? {})[0]
    if (typeof value === 'string' && value.length > PROPERTY_TEXT_MAX) {
      setError(uiText('property.error.textTooLong', { limit: PROPERTY_TEXT_MAX, excess: value.length - PROPERTY_TEXT_MAX }))
      return false
    }
    if (patch.unset?.includes('title')) {
      setError(uiText('property.error.titleRequired'))
      return false
    }
    const response = await MessageUtils.sendMessage<{ entry: EntryRecord }>({
      type: 'UPDATE_ENTRY',
      id: entry.id,
      patch: { properties: patch },
    })
    if (!response.success || !response.data?.entry) {
      setError(entryErrorText(response.error))
      return false
    }
    setError('')
    onEntryChanged(response.data.entry)
    const editedName = Object.keys(patch.set ?? {})[0] ?? patch.unset?.[0] ?? patch.newDefinitions?.[0]?.name
    const definition = patch.newDefinitions?.[0] ?? (editedName ? byKey.get(editedName.toLowerCase()) : undefined)
    if (patch.set || patch.unset) {
      void MessageUtils.sendMessage({
        type: 'RECORD_EVENT',
        name: 'entry.property_edited',
        props: { scope: definition?.builtin ? 'builtin' : 'custom', property_type: definition?.type ?? 'text' },
      })
    }
    return true
  }

  const setValue = async (name: string, value: PropertyValue | undefined): Promise<boolean> => {
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
      return persist({ unset: [name] })
    }
    return persist({ set: { [name]: value } })
  }

  const addProperty = async (name: string, type: PropertyType): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) return
    const existing = byKey.get(trimmed.toLowerCase())
    if (existing) {
      // already in the registry: the row opens for editing, the value arrives on commit
      setPending({ name: existing.name, type: existing.type })
      setAdding(null)
      return
    }
    // the definition registers now; the row waits for its first real value
    const saved = await persist({ newDefinitions: [{ name: trimmed, type, builtin: false, presets: [] }] })
    if (!saved) return
    setPending({ name: trimmed, type })
    setAdding(null)
  }

  const commitPending = async (value: PropertyValue | undefined): Promise<boolean> => {
    const row = pending
    if (!row) return true
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
      setPending(null)
      return true
    }
    const ok = await persist({ set: { [row.name]: value } })
    if (ok) setPending(null)
    return ok
  }

  const names = Object.keys(entry.properties)
  const PendingIcon = PROPERTY_TYPE_ICONS[pending?.type ?? 'text']

  return (
    <div className="prop-panel" data-testid="prop-panel">
      {names.map(name => {
        const def = byKey.get(name.toLowerCase())
        const type = def?.type ?? 'text'
        const inputId = `property-${entry.id}-${encodeURIComponent(name)}`
        const TypeIcon = PROPERTY_TYPE_ICONS[type]
        return (
          <div key={name} className="prop-row">
            <label className="prop-name" title={type} htmlFor={inputId}>
              <TypeIcon size={14} aria-hidden /> {name}
            </label>
            <DraftEditor
              ref={handle => {
                if (handle) editors.current.set(name, handle)
                else editors.current.delete(name)
              }}
              inputId={inputId}
              name={name}
              type={type}
              value={entry.properties[name]}
              listLimit={def?.name === 'tags' ? 'tags' : 'list'}
              onCommit={value => setValue(name, value)}
            />
          </div>
        )
      })}

      {pending && (
        <div className="prop-row" data-testid="prop-row-pending">
          <label className="prop-name" title={pending.type} htmlFor={`property-${entry.id}-pending`}>
            <PendingIcon size={14} aria-hidden /> {pending.name}
          </label>
          <PendingEditor
            ref={handle => {
              if (handle) editors.current.set('__pending', handle)
              else editors.current.delete('__pending')
            }}
            inputId={`property-${entry.id}-pending`}
            type={pending.type}
            autoFocus
            onCommit={commitPending}
          />
        </div>
      )}

      {adding ? (
        <div className="prop-add">
          <input
            autoFocus
            list="prop-names"
            placeholder={uiText('property.name')}
            value={adding.name}
            aria-label={uiText('property.name')}
            onChange={event => setAdding({ ...adding, name: event.target.value })}
            onKeyDown={event => {
              if (event.key === 'Enter') addProperty(adding.name, adding.type)
              if (event.key === 'Escape') setAdding(null)
            }}
          />
          <select value={adding.type} aria-label={uiText('property.type')} onChange={event => setAdding({ ...adding, type: event.target.value as PropertyType })}>
            {PROPERTY_TYPES.map((type: PropertyType) => (
              <option key={type} value={type}>
                {uiText(`property.type.${type}` as 'property.type.text')}
              </option>
            ))}
          </select>
          <button type="button" className="ghost" onClick={() => addProperty(adding.name, adding.type)}>
            {uiText('common.save')}
          </button>
          <button type="button" className="ghost" onClick={() => setAdding(null)}>
            {uiText('common.cancel')}
          </button>
        </div>
      ) : (
        <button type="button" className="link prop-add-button" data-testid="add-property" onClick={() => setAdding({ name: '', type: 'text' })}>
          + {uiText('property.add')}
        </button>
      )}
      <datalist id="prop-names">
        {registry.map(def => (
          <option key={def.name} value={def.name}>
            {uiText(`property.type.${def.type}`)}
          </option>
        ))}
      </datalist>

      <dl className="drawer-system">
        <dt>{uiText('property.type')}</dt>
        <dd>{uiText(entry.type === 'clip' ? 'library.clips' : 'library.screenshots')}</dd>
        <dt>{uiText('property.system.source')}</dt>
        <dd>
          <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer">
            {entry.sourceHost}
          </a>
        </dd>
        <dt>{uiText('property.system.created')}</dt>
        <dd>{new Date(entry.createdAt).toLocaleString()}</dd>
        <dt>{uiText('property.system.updated')}</dt>
        <dd>{new Date(entry.updatedAt).toLocaleString()}</dd>
      </dl>
      {error && <p className="warn">{error}</p>}
    </div>
  )
})

function normalizeListItems(items: string[], limit: 'tags' | 'list' | undefined): string[] {
  if (limit === 'list') {
    // other lists use the type's own limits (entry.md §5.2): 50 items, 100 chars
    const seen = new Set<string>()
    const out: string[] = []
    for (const raw of items) {
      const item = raw.trim()
      if (!item || item.length > PROPERTY_LIST_ITEM_MAX) continue
      const key = item.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(item)
      if (out.length >= PROPERTY_LIST_ITEMS_MAX) break
    }
    return out
  }
  return normalizeTags(items) // tags: 20 items, 1-32 chars each
}

interface ValueEditorHandle {
  flushInput(): boolean
}

const ValueEditor = forwardRef<
  ValueEditorHandle,
  {
    inputId: string
    type: PropertyType
    value: PropertyValue | undefined
    onChange(value: PropertyValue | undefined): void
    onListEnter?(): void
    autoFocus?: boolean
    listLimit?: 'tags' | 'list'
  }
>(function ValueEditor({ inputId, type, value, onChange, onListEnter, autoFocus, listLimit }, ref) {
  const [listInput, setListInput] = useState('')
  const listInputRef = useRef('')
  const [listError, setListError] = useState('')
  const appendInput = (): boolean => {
    if (type !== 'list') return true
    const added = listInputRef.current.trim()
    if (!added) return true
    const limit = listLimit === 'tags' ? TAG_LENGTH_MAX : PROPERTY_LIST_ITEM_MAX
    const maxItems = listLimit === 'tags' ? TAGS_MAX : PROPERTY_LIST_ITEMS_MAX
    if (added.length > limit) {
      setListError(uiText('property.error.listItemTooLong', { limit, excess: added.length - limit }))
      return false
    }
    const items = Array.isArray(value) ? value : []
    if (items.length >= maxItems && !items.some(item => item.toLowerCase() === added.toLowerCase())) {
      setListError(uiText('property.error.listTooMany', { limit: maxItems }))
      return false
    }
    onChange(normalizeListItems([...items, added], listLimit))
    listInputRef.current = ''
    setListInput('')
    setListError('')
    return true
  }
  useImperativeHandle(ref, () => ({ flushInput: appendInput }))

  if (type === 'checkbox') {
    return <input id={inputId} type="checkbox" checked={value === true} onChange={event => onChange(event.target.checked ? true : undefined)} />
  }
  if (type === 'list') {
    const items = Array.isArray(value) ? value : []
    return (
      <span className="prop-list">
        {items.map(item => (
          <span key={item} className="tag">
            {item}
            <button
              type="button"
              className="tag-remove"
              aria-label={uiText('settings.remove')}
              onClick={() =>
                onChange(
                  normalizeListItems(
                    items.filter(candidate => candidate !== item),
                    listLimit,
                  ),
                )
              }
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={inputId}
          type="text"
          placeholder={uiText('property.addItem')}
          aria-label={uiText('property.addItem')}
          value={listInput}
          onChange={event => {
            listInputRef.current = event.target.value
            setListInput(event.target.value)
            setListError('')
          }}
          onBlur={() => {
            appendInput()
          }}
          onKeyDown={event => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            event.stopPropagation()
            if (appendInput()) onListEnter?.()
          }}
        />
        {listError && (
          <span className="warn" role="alert">
            {listError}
          </span>
        )}
      </span>
    )
  }
  if (type === 'date') {
    return <input id={inputId} type="date" autoFocus={autoFocus} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value || undefined)} />
  }
  if (type === 'datetime') {
    return (
      <input
        id={inputId}
        type="datetime-local"
        autoFocus={autoFocus}
        value={typeof value === 'string' ? value : ''}
        onChange={event => onChange(datetimeToStored(event.target.value))}
      />
    )
  }
  if (type === 'number') {
    return (
      <input
        type="number"
        id={inputId}
        autoFocus={autoFocus}
        value={typeof value === 'number' ? value : ''}
        onChange={event => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
      />
    )
  }
  return <input id={inputId} type="text" autoFocus={autoFocus} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value || undefined)} />
})

/** datetime-local gives minutes; the stored format needs seconds (entry.md §5.2). */
function datetimeToStored(value: string): string | undefined {
  if (!value) return undefined
  return value.length === 16 ? `${value}:00` : value
}

/**
 * Draft-first editor for a row with no stored value yet (RV-LIB-06): the
 * value is kept locally and committed once — on blur, Enter or (for
 * checkbox) the flip. An empty commit drops the row without writing.
 */
const PendingEditor = forwardRef<EditorHandle, { inputId: string; type: PropertyType; autoFocus?: boolean; onCommit(value: PropertyValue | undefined): Promise<boolean> }>(
  function PendingEditor({ inputId, type, autoFocus, onCommit }, ref) {
    const [draft, setDraft] = useState<PropertyValue | undefined>(undefined)
    const draftRef = useRef<PropertyValue | undefined>(undefined)
    const valueEditor = useRef<ValueEditorHandle>(null)
    const writing = useRef<Promise<boolean> | null>(null)
    const commit = async (): Promise<boolean> => {
      // a checkbox row has no ValueEditor and so no typed-but-unadded input to fold in
      if (valueEditor.current && !valueEditor.current.flushInput()) return false
      if (writing.current) return writing.current
      const task = onCommit(draftRef.current)
      writing.current = task
      const ok = await task
      writing.current = null
      return ok
    }
    useImperativeHandle(ref, () => ({ flush: commit }))
    return (
      <span
        onBlur={() => void commit()}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) void commit()
        }}
      >
        {type === 'checkbox' ? (
          <input id={inputId} type="checkbox" autoFocus={autoFocus} checked={draft === true} onChange={event => void onCommit(event.target.checked ? true : undefined)} />
        ) : (
          <ValueEditor
            ref={valueEditor}
            inputId={inputId}
            type={type}
            value={draft}
            autoFocus={autoFocus}
            onListEnter={() => void commit()}
            onChange={next => {
              draftRef.current = next
              setDraft(next)
            }}
          />
        )}
      </span>
    )
  },
)

/**
 * Draft-first editor for a stored row (RV-LIB-05): keystrokes stay local;
 * one commit happens on blur or Enter — never mid-composition. A failed
 * commit restores the stored value while the error is showing.
 */
const DraftEditor = forwardRef<
  EditorHandle,
  {
    inputId: string
    name: string
    type: PropertyType
    value: PropertyValue | undefined
    listLimit?: 'tags' | 'list'
    onCommit(value: PropertyValue | undefined): Promise<boolean> | boolean
  }
>(function DraftEditor({ inputId, name, type, value, listLimit, onCommit }, ref) {
  const [draft, setDraft] = useState<PropertyValue | undefined>(value)
  const draftRef = useRef<PropertyValue | undefined>(value)
  const dirty = useRef(false)
  const writing = useRef<Promise<boolean> | null>(null)
  const valueEditor = useRef<ValueEditorHandle>(null)

  useEffect(() => {
    if (!dirty.current) {
      draftRef.current = value
      setDraft(value)
    }
  }, [value])

  const commit = async (): Promise<boolean> => {
    // a checkbox row has no ValueEditor and so no typed-but-unadded input to fold in
    if (valueEditor.current && !valueEditor.current.flushInput()) return false
    if (writing.current) {
      const ok = await writing.current
      return ok ? commit() : false
    }
    if (!dirty.current) return true
    const submitted = draftRef.current
    const task = Promise.resolve(onCommit(submitted))
    writing.current = task
    const ok = await task
    writing.current = null
    if (ok && draftRef.current === submitted) dirty.current = false
    if (!ok && name === 'title' && (submitted === undefined || submitted === '')) {
      draftRef.current = value
      setDraft(value)
      dirty.current = false
    }
    return ok && (!dirty.current || commit())
  }
  useImperativeHandle(ref, () => ({ flush: commit }))

  if (type === 'checkbox') {
    return <input id={inputId} type="checkbox" checked={value === true} onChange={event => void onCommit(event.target.checked ? true : undefined)} />
  }
  return (
    <span
      onBlur={() => void commit()}
      onKeyDown={event => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) void commit()
      }}
    >
      <ValueEditor
        ref={valueEditor}
        inputId={inputId}
        type={type}
        value={draft}
        listLimit={listLimit}
        onListEnter={() => void commit()}
        onChange={next => {
          dirty.current = true
          draftRef.current = next
          setDraft(next)
        }}
      />
    </span>
  )
})
