/**
 * The properties page — the registry's management view (extension.md §2.4):
 * name+type, default value, usage count, per-type preset checkboxes and
 * deletion (unused, non-builtin only), plus "delete unused" in one go and a
 * new-definition form. `tags` sits on top and stays locked.
 */
import { useCallback, useEffect, useState } from 'react'
import MessageUtils from '../../utils/message'
import { PROPERTY_TYPES, type PropertyDefinition, type PropertyType } from '../../learning-core/types'
import { uiText } from '../../utils/ui-text'

const TYPE_ICON: Record<PropertyType, string> = { text: '𝐓', list: '≔', number: '#', checkbox: '☑', date: '📅', datetime: '🕰' }

export function PropertiesView({ onRegistryChanged }: { onRegistryChanged(): void }) {
  const [registry, setRegistry] = useState<PropertyDefinition[]>([])
  const [usage, setUsage] = useState<Record<string, number>>({})
  const [creating, setCreating] = useState<{ name: string; type: PropertyType } | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    // usage comes from the whole library via the backend (RV-LIB-07)
    const defs = await MessageUtils.sendMessage<{ definitions: PropertyDefinition[]; usage: Record<string, number> }>({ type: 'LIST_PROPERTIES' })
    if (!defs.success) return
    setRegistry(defs.data!.definitions)
    setUsage(defs.data!.usage ?? {})
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function upsert(def: PropertyDefinition) {
    const response = await MessageUtils.sendMessage<{ definitions: PropertyDefinition[] }>({ type: 'UPSERT_PROPERTY', def })
    if (!response.success) {
      setError(response.error ?? uiText('toast.saveFailed'))
      return
    }
    setError('')
    setRegistry(response.data!.definitions)
    onRegistryChanged()
  }

  async function remove(name: string) {
    const response = await MessageUtils.sendMessage<{ definitions: PropertyDefinition[] }>({ type: 'DELETE_PROPERTY', name })
    if (!response.success) {
      setError(response.error === 'PROPERTY_IN_USE' ? uiText('property.error.inUse') : (response.error ?? uiText('toast.saveFailed')))
      return
    }
    setError('')
    setRegistry(response.data!.definitions)
    onRegistryChanged()
  }

  async function deleteUnused() {
    const doomed = registry.filter(def => !def.builtin && (usage[def.name] ?? 0) === 0)
    if (doomed.length === 0) return
    if (!window.confirm(uiText('property.willDelete', { names: doomed.map(def => def.name).join(', ') }))) return
    const response = await MessageUtils.sendMessage<{ removed: string[]; definitions: PropertyDefinition[] }>({ type: 'DELETE_UNUSED_PROPERTIES' })
    if (!response.success) {
      setError(response.error ?? uiText('toast.saveFailed'))
      return
    }
    setError('')
    setNotice(`${uiText('settings.remove')}: ${response.data!.removed.join(', ')}`)
    setRegistry(response.data!.definitions)
    onRegistryChanged()
  }

  const sorted = [...registry].sort((a, b) => Number(b.builtin) - Number(a.builtin) || a.name.localeCompare(b.name))

  return (
    <div className="props-page" data-testid="props-page">
      <header className="props-toolbar">
        {creating ? (
          <span className="prop-add">
            <input
              autoFocus
              list="existing-names"
              placeholder={uiText('property.name')}
              value={creating.name}
              aria-label={uiText('property.name')}
              onChange={event => setCreating({ ...creating, name: event.target.value })}
            />
            <select value={creating.type} aria-label={uiText('property.type')} onChange={event => setCreating({ ...creating, type: event.target.value as PropertyType })}>
              {PROPERTY_TYPES.map((type: PropertyType) => (
                <option key={type} value={type}>
                  {uiText(`property.type.${type}` as 'property.type.text')}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="ghost"
              onClick={() => void upsert({ name: creating.name.trim(), type: creating.type, builtin: false, presets: [] }).then(() => setCreating(null))}
            >
              {uiText('common.save')}
            </button>
            <button type="button" className="ghost" onClick={() => setCreating(null)}>
              {uiText('common.cancel')}
            </button>
          </span>
        ) : (
          <button type="button" className="ghost" data-testid="new-property" onClick={() => setCreating({ name: '', type: 'text' })}>
            + {uiText('property.add')}
          </button>
        )}
        <span className="props-spacer" />
        <button type="button" className="ghost" data-testid="delete-unused" onClick={() => void deleteUnused()}>
          {uiText('property.deleteUnused')}
        </button>
      </header>
      <datalist id="existing-names">
        {registry.map(def => (
          <option key={def.name} value={def.name} />
        ))}
      </datalist>

      <table className="props-table">
        <thead>
          <tr>
            <th>{uiText('property.name')}</th>
            <th>{uiText('property.defaultValue')}</th>
            <th>{uiText('property.usage')}</th>
            <th>{uiText('property.presets')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sorted.map(def => {
            const count = usage[def.name] ?? 0
            const fixed = def.name === 'title' || def.name === 'tags'
            return (
              <tr key={def.name} data-prop={def.name}>
                <td>
                  <span aria-hidden>{TYPE_ICON[def.type]}</span> {def.name}
                  {def.builtin && <span className="tag">{uiText('property.builtin')}</span>}
                </td>
                <td>{def.defaultValue === undefined ? '—' : String(def.defaultValue)}</td>
                <td data-testid={`usage-${def.name}`}>{count}</td>
                <td>
                  {(['clip', 'screenshot'] as const).map(type => (
                    <label key={type} className="prop-preset">
                      <input
                        type="checkbox"
                        checked={def.presets.includes(type)}
                        disabled={fixed}
                        aria-label={`${def.name} ${type}`}
                        onChange={event => {
                          const presets = event.target.checked ? [...def.presets, type] : def.presets.filter(item => item !== type)
                          void upsert({ ...def, presets })
                        }}
                      />
                      {uiText(type === 'clip' ? 'library.clips' : 'library.screenshots')}
                    </label>
                  ))}
                </td>
                <td>
                  {!def.builtin && (
                    <button type="button" className="danger" disabled={count > 0} data-testid={`delete-${def.name}`} onClick={() => void remove(def.name)}>
                      {uiText('library.delete')}
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {notice && <p className="hint">{notice}</p>}
      {error && <p className="warn">{error}</p>}
    </div>
  )
}
