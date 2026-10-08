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
  const [error, setError] = useState('')

  const byKey = useMemo(() => new Map(registry.map(def => [def.name.toLowerCase(), def] as const)), [registry])

  async function persist(properties: Record<string, PropertyValue>, newDefinition?: PropertyDefinition) {
    const response = await MessageUtils.sendMessage<{ entry: EntryRecord }>({
      type: 'UPDATE_ENTRY',
      id: entry.id,
      patch: { properties, ...(newDefinition ? { newDefinitions: [newDefinition] } : {}) },
    })
    if (!response.success || !response.data?.entry) {
      setError(errorText(response.error))
      return
    }
    setError('')
    onEntryChanged(response.data.entry)
    void MessageUtils.sendMessage({
      type: 'RECORD_EVENT',
      name: 'entry.property_edited',
      props: { scope: newDefinition ? 'custom' : 'builtin', property_type: newDefinition?.type ?? 'text' },
    })
  }

  const setValue = (name: string, value: PropertyValue | undefined) => {
    const properties = { ...entry.properties }
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) delete properties[name]
    else properties[name] = value
    void persist(properties, undefined)
  }

  const addProperty = (name: string, type: PropertyType) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const existing = byKey.get(trimmed.toLowerCase())
    if (existing) {
      // set on this entry; the type is the registry's, unchanged
      setValue(existing.name, defaultValueFor(existing.type))
      setAdding(null)
      return
    }
    const definition: PropertyDefinition = { name: trimmed, type, builtin: false, presets: [] }
    void persist({ ...entry.properties, [trimmed]: defaultValueFor(type) }, definition)
    setAdding(null)
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

function defaultValueFor(type: PropertyType): PropertyValue {
  if (type === 'checkbox') return true
  if (type === 'list') return []
  if (type === 'number') return 0
  return ''
}

function ValueEditor({ type, value, onChange }: { type: PropertyType; value: PropertyValue | undefined; onChange(value: PropertyValue | undefined): void }) {
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
    return <input type="date" value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value || undefined)} />
  }
  if (type === 'datetime') {
    return <input type="datetime-local" value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value || undefined)} />
  }
  if (type === 'number') {
    return <input type="number" value={typeof value === 'number' ? value : ''} onChange={event => onChange(event.target.value === '' ? undefined : Number(event.target.value))} />
  }
  return <input type="text" value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value || undefined)} />
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
