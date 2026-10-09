/**
 * The property panel shared by the detail drawer and the reading view's
 * side column (extension.md §4.1). Every row is the type icon, the name
 * and a value editor for the type; values save on blur, clearing equals
 * unset (entry.md §5.3.7). Adding a name autocompletes from the registry;
 * an unknown name asks for its type first and registers in the same write.
 * System fields show read-only; `type` and `id` are not properties at all.
 */
import { useMemo, useState } from 'react'
import MessageUtils from '../../utils/message'
import type { EntryRecord, PropertyDefinition, PropertyType, PropertyValue } from '../../learning-core/types'
import { normalizeTags } from '../../learning-core/properties'
import { PROPERTY_TYPES } from '../../learning-core/types'
import { uiText } from '../../utils/ui-text'

const TYPE_ICON: Record<PropertyType, string> = { text: '𝐓', list: '≔', number: '#', checkbox: '☑', date: '📅', datetime: '🕰' }

interface Props {
  entry: EntryRecord
  registry: PropertyDefinition[]
  onEntryChanged(entry: EntryRecord): void
}

export function PropertyPanel({ entry, registry, onEntryChanged }: Props) {
  const [adding, setAdding] = useState<{ name: string; type: PropertyType } | null>(null)
  const [pending, setPending] = useState<{ name: string; type: PropertyType } | null>(null)
  const [error, setError] = useState('')

  const byKey = useMemo(() => new Map(registry.map(def => [def.name.toLowerCase(), def] as const)), [registry])

  /** Sends a field-level properties patch; the store fills the rest from the entry it reads in-transaction. */
  async function persist(patch: { set?: Record<string, PropertyValue>; unset?: string[]; newDefinitions?: PropertyDefinition[] }) {
    const response = await MessageUtils.sendMessage<{ entry: EntryRecord }>({
      type: 'UPDATE_ENTRY',
      id: entry.id,
      patch: { properties: patch },
    })
    if (!response.success || !response.data?.entry) {
      setError(errorText(response.error))
      return
    }
    setError('')
    onEntryChanged(response.data.entry)
    const definition = patch.newDefinitions?.[0]
    void MessageUtils.sendMessage({
      type: 'RECORD_EVENT',
      name: 'entry.property_edited',
      props: { scope: definition ? 'custom' : 'builtin', property_type: definition?.type ?? 'text' },
    })
  }

  const setValue = (name: string, value: PropertyValue | undefined) => {
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
      void persist({ unset: [name] })
      return
    }
    void persist({ set: { [name]: value } })
  }

  const addProperty = (name: string, type: PropertyType) => {
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
    void persist({ newDefinitions: [{ name: trimmed, type, builtin: false, presets: [] }] })
    setPending({ name: trimmed, type })
    setAdding(null)
  }

  const commitPending = (value: PropertyValue | undefined): void => {
    const row = pending
    setPending(null)
    if (row && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)) {
      void persist({ set: { [row.name]: value } })
    }
  }

  const names = Object.keys(entry.properties)

  return (
    <div className="prop-panel" data-testid="prop-panel">
      {names.map(name => {
        const def = byKey.get(name.toLowerCase())
        const type = def?.type ?? 'text'
        return (
          <label key={name} className="prop-row">
            <span className="prop-name" title={type}>
              <span aria-hidden>{TYPE_ICON[type]}</span> {name}
            </span>
            <ValueEditor type={type} value={entry.properties[name]} onChange={value => setValue(name, value)} />
          </label>
        )
      })}

      {pending && (
        <label className="prop-row" data-testid="prop-row-pending">
          <span className="prop-name" title={pending.type}>
            <span aria-hidden>{TYPE_ICON[pending.type]}</span> {pending.name}
          </span>
          <PendingEditor type={pending.type} autoFocus onCommit={commitPending} />
        </label>
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

      <p className="drawer-system">
        {uiText('library.backToSource')}:{' '}
        <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer">
          {entry.sourceHost}
        </a>{' '}
        · {new Date(entry.createdAt).toLocaleDateString()}
      </p>
      {error && <p className="warn">{error}</p>}
    </div>
  )
}

function ValueEditor({
  type,
  value,
  onChange,
  autoFocus,
}: {
  type: PropertyType
  value: PropertyValue | undefined
  onChange(value: PropertyValue | undefined): void
  autoFocus?: boolean
}) {
  if (type === 'checkbox') {
    return <input type="checkbox" checked={value === true} onChange={event => onChange(event.target.checked ? true : undefined)} />
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
              onClick={() => onChange(normalizeTags(items.filter(candidate => candidate !== item)))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          placeholder={uiText('property.addItem')}
          aria-label={uiText('property.addItem')}
          onKeyDown={event => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            const added = (event.target as HTMLInputElement).value.trim()
            if (added) onChange(normalizeTags([...items, added]))
            ;(event.target as HTMLInputElement).value = ''
          }}
        />
      </span>
    )
  }
  if (type === 'date') {
    return <input type="date" autoFocus={autoFocus} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value || undefined)} />
  }
  if (type === 'datetime') {
    return <input type="datetime-local" autoFocus={autoFocus} value={typeof value === 'string' ? value : ''} onChange={event => onChange(datetimeToStored(event.target.value))} />
  }
  if (type === 'number') {
    return (
      <input
        type="number"
        autoFocus={autoFocus}
        value={typeof value === 'number' ? value : ''}
        onChange={event => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
      />
    )
  }
  return <input type="text" autoFocus={autoFocus} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value || undefined)} />
}

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
function PendingEditor({ type, autoFocus, onCommit }: { type: PropertyType; autoFocus?: boolean; onCommit(value: PropertyValue | undefined): void }) {
  const [draft, setDraft] = useState<PropertyValue | undefined>(undefined)
  const commit = (): void => onCommit(draft)
  return (
    <span
      onBlur={commit}
      onKeyDown={event => {
        if (event.key === 'Enter') commit()
      }}
    >
      {type === 'checkbox' ? (
        <input type="checkbox" autoFocus={autoFocus} checked={draft === true} onChange={event => onCommit(event.target.checked ? true : undefined)} />
      ) : (
        <ValueEditor type={type} value={draft} autoFocus={autoFocus} onChange={setDraft} />
      )}
    </span>
  )
}

/** Stable, readable messages for the entry error codes the panel can hit. */
function errorText(code: string | undefined): string {
  switch (code) {
    case 'PROPERTY_NAME_INVALID':
      return uiText('property.error.name')
    case 'PROPERTY_TYPE_MISMATCH':
      return uiText('property.error.type')
    case 'PROPERTY_VALUE_INVALID':
      return uiText('property.error.value')
    case 'PROPERTY_LIMIT_EXCEEDED':
      return uiText('property.error.limit')
    default:
      return code ?? uiText('toast.saveFailed')
  }
}
