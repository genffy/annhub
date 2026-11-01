/**
 * The properties page — the registry's management view (extension.md §2.4):
 * one grid table of name+type, default value, usage count, the per-type preset
 * checkboxes and deletion (unused, non-builtin only), a rules banner on top,
 * "delete unused (N)" and "add property" in the page head. `tags` sits on top
 * and stays locked; a new definition opens as a form in the table's last row.
 */
import { useCallback, useEffect, useState } from 'react'
import MessageUtils from '../../utils/message'
import { CircleAlert, Info, Lock, Plus, Trash2 } from 'lucide-react'
import type { EntryValidationError, EntryType, PropertyDefinition, PropertyType, PropertyValue } from '../../learning-core/types'
import { propertyStorageKey, validatePropertyName } from '../../learning-core/properties'
import { PROPERTY_TYPE_ICONS } from '../../utils/entry-icons'
import { entryErrorText, uiText } from '../../utils/ui-text'
import { isFixedProperty, orderRegistry } from './property-order'
import { PropertyTypePicker } from './property-type-picker'
import { SettingsCheckChip } from './settings-check-chip'

interface CreatingProperty {
  name: string
  type: PropertyType
  defaultInput: string
  presets: EntryType[]
}

function defaultValueFor(creating: CreatingProperty): PropertyValue | undefined {
  const value = creating.defaultInput.trim()
  if (!value) return undefined
  if (creating.type === 'list')
    return value
      .split(/[,，]/)
      .map(item => item.trim())
      .filter(Boolean)
  if (creating.type === 'number') return Number(value)
  if (creating.type === 'checkbox') return value === 'true'
  if (creating.type === 'datetime' && value.length === 16) return `${value}:00`
  return value
}

/** The same rules the backend applies, asked up front so the button can grey out instead of answering with an error:
 * the name's shape and reserved list come from the registry's own validator, the type binding from the loaded registry. */
function creatingError(creating: CreatingProperty, registry: PropertyDefinition[]): string {
  try {
    validatePropertyName(creating.name)
  } catch (error) {
    return entryErrorText((error as EntryValidationError).code)
  }
  const existing = registry.find(def => propertyStorageKey(def.name) === propertyStorageKey(creating.name))
  if (existing && existing.type !== creating.type) return uiText('property.error.type')
  return ''
}

export function PropertiesView({ onRegistryChanged }: { onRegistryChanged(): void }) {
  const [registry, setRegistry] = useState<PropertyDefinition[]>([])
  const [usage, setUsage] = useState<Record<string, number>>({})
  const [creating, setCreating] = useState<CreatingProperty | null>(null)
  const [submitError, setSubmitError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    // usage comes from the whole library via the backend (RV-LIB-07)
    const defs = await MessageUtils.sendMessage<{ definitions: PropertyDefinition[]; usage: Record<string, number> }>({ type: 'LIST_PROPERTIES', includeUsage: true })
    if (!defs.success) return
    setRegistry(defs.data!.definitions)
    setUsage(defs.data!.usage ?? {})
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function upsert(def: PropertyDefinition, onFailure?: (code?: string) => void): Promise<boolean> {
    const response = await MessageUtils.sendMessage<{ definitions: PropertyDefinition[] }>({ type: 'UPSERT_PROPERTY', def })
    if (!response.success) {
      // the open form answers under its own name input; a preset toggle has no form and answers on the page
      if (onFailure) onFailure(response.error)
      else setError(entryErrorText(response.error))
      return false
    }
    setError('')
    setRegistry(response.data!.definitions)
    onRegistryChanged()
    return true
  }

  async function remove(name: string) {
    const response = await MessageUtils.sendMessage<{ definitions: PropertyDefinition[] }>({ type: 'DELETE_PROPERTY', name })
    if (!response.success) {
      setError(entryErrorText(response.error))
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
      setError(entryErrorText(response.error))
      return
    }
    setError('')
    setNotice(`${uiText('settings.remove')}: ${response.data!.removed.join(', ')}`)
    setRegistry(response.data!.definitions)
    onRegistryChanged()
  }

  const sorted = orderRegistry(registry)
  const unusedCount = registry.filter(def => !def.builtin && (usage[def.name] ?? 0) === 0).length
  const builtinCount = registry.filter(def => def.builtin).length
  const liveError = creating ? creatingError(creating, registry) : ''

  return (
    <div className="props-page" data-testid="props-page">
      <header className="page-head">
        <div className="page-titles">
          <h1 className="page-title">{uiText('library.properties')}</h1>
          <p className="page-sub">{uiText('property.subtitle', { total: registry.length, builtin: builtinCount, custom: registry.length - builtinCount })}</p>
        </div>
        {!creating && (
          <div className="page-actions">
            <button type="button" className="ghost" data-testid="delete-unused" disabled={unusedCount === 0} onClick={() => void deleteUnused()}>
              <Trash2 size={14} aria-hidden /> {uiText('property.deleteUnusedCount', { count: unusedCount })}
            </button>
            <button
              type="button"
              className="primary"
              data-testid="new-property"
              onClick={() => {
                setSubmitError('')
                setCreating({ name: '', type: 'text', defaultInput: '', presets: [] })
              }}
            >
              <Plus size={14} aria-hidden /> {uiText('property.add')}
            </button>
          </div>
        )}
      </header>
      <div className="page-body">
        <p className="banner banner-info">
          <Info size={15} aria-hidden />{' '}
          <span>
            <b>{uiText('property.rulesHint.lead')}</b>
            {uiText('property.rulesHint')}
          </span>
        </p>
        {notice && (
          <p className="banner banner-ok" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="banner banner-danger" role="alert">
            {error}
          </p>
        )}
        <datalist id="existing-names">
          {registry.map(def => (
            <option key={def.name} value={def.name} />
          ))}
        </datalist>
        <div className="props-scroll">
          <table className="props-table" role="table">
            <thead role="rowgroup">
              <tr role="row">
                <th scope="col" role="columnheader">
                  {uiText('property.name')}
                </th>
                <th scope="col" role="columnheader">
                  {uiText('property.type')}
                </th>
                <th scope="col" role="columnheader">
                  {uiText('property.defaultValue')}
                </th>
                <th scope="col" role="columnheader" className="num">
                  {uiText('property.usage')}
                </th>
                <th scope="col" role="columnheader" className="ctr">
                  {uiText('library.clips')}
                </th>
                <th scope="col" role="columnheader" className="ctr">
                  {uiText('library.screenshots')}
                </th>
                <th scope="col" role="columnheader">
                  <span className="sr-only">{uiText('library.delete')}</span>
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {sorted.map(def => {
                const count = usage[def.name] ?? 0
                const fixed = isFixedProperty(def.name)
                const TypeIcon = PROPERTY_TYPE_ICONS[def.type]
                // a delete that cannot happen says why, in words next to it: a greyed-out button alone explains nothing (extension.md §2.4)
                const blocked: 'property.deleteBuiltin' | 'property.deleteInUse' | null = def.builtin ? 'property.deleteBuiltin' : count > 0 ? 'property.deleteInUse' : null
                return (
                  <tr key={def.name} data-prop={def.name} role="row">
                    <td role="cell">
                      <span className="prop-name-cell">
                        <TypeIcon size={16} aria-hidden />
                        <span className="prop-name-text">{def.name}</span>
                        {fixed ? (
                          <span className="tag tag-fixed" data-testid={`fixed-${def.name}`}>
                            <Lock size={11} aria-hidden /> {uiText('property.fixed')}
                          </span>
                        ) : (
                          def.builtin && <span className="tag">{uiText('property.builtin')}</span>
                        )}
                      </span>
                    </td>
                    <td role="cell" className="prop-type" data-testid={`type-${def.name}`}>
                      {uiText(`property.type.${def.type}` as 'property.type.text')}
                    </td>
                    <td role="cell" className="prop-default">
                      {def.defaultValue === undefined ? '—' : String(def.defaultValue)}
                    </td>
                    <td role="cell" className="num" data-testid={`usage-${def.name}`}>
                      {count}
                    </td>
                    {(['clip', 'screenshot'] as const).map(type => (
                      <td key={type} role="cell" className="ctr">
                        <input
                          type="checkbox"
                          className="prop-check"
                          checked={def.presets.includes(type)}
                          disabled={fixed}
                          title={fixed ? uiText('property.fixedPreset') : undefined}
                          aria-label={`${def.name} ${uiText(type === 'clip' ? 'library.type.clip' : 'library.type.screenshot')}`}
                          onChange={event => {
                            const presets = event.target.checked ? [...def.presets, type] : def.presets.filter(item => item !== type)
                            void upsert({ ...def, presets })
                          }}
                        />
                      </td>
                    ))}
                    <td role="cell" className="c-action">
                      <button
                        type="button"
                        className="prop-delete"
                        disabled={blocked !== null}
                        title={blocked ? uiText(blocked) : undefined}
                        aria-describedby={blocked ? `delete-reason-${encodeURIComponent(def.name)}` : undefined}
                        aria-label={uiText('library.delete')}
                        data-testid={`delete-${def.name}`}
                        onClick={() => void remove(def.name)}
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                      {blocked && (
                        /* the visible word is short; the whole sentence stays for the reader of the button and
                           the tooltip (extension.md §2.4) */
                        <span className="prop-reason">
                          <span className="sr-only" id={`delete-reason-${encodeURIComponent(def.name)}`}>
                            {uiText(blocked)}
                          </span>
                          <span data-testid={`delete-reason-${def.name}`}>{uiText(def.builtin ? 'property.builtin' : 'property.inUse')}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {creating && (
                <tr role="row" className="prop-new-row">
                  <td role="cell" colSpan={7} className="prop-new-cell">
                    <div className="prop-new-top">
                      <div className="prop-new-name">
                        <input
                          autoFocus
                          className="prop-new-input"
                          list="existing-names"
                          placeholder={uiText('property.name')}
                          value={creating.name}
                          aria-label={uiText('property.name')}
                          onChange={event => setCreating({ ...creating, name: event.target.value })}
                        />
                        {(liveError || submitError) && (
                          <p className="prop-new-error" role="alert">
                            <CircleAlert size={13} aria-hidden /> {liveError || submitError}
                          </p>
                        )}
                      </div>
                      <div className="prop-new-types">
                        <PropertyTypePicker value={creating.type} ariaLabel={uiText('property.type')} onChange={type => setCreating({ ...creating, type, defaultInput: '' })} />
                      </div>
                    </div>
                    <div className="prop-new-extra">
                      {creating.type === 'checkbox' ? (
                        <select
                          className="prop-new-input"
                          value={creating.defaultInput}
                          aria-label={uiText('property.defaultValue')}
                          onChange={event => setCreating({ ...creating, defaultInput: event.target.value })}
                        >
                          <option value="">{uiText('property.defaultValue')}: —</option>
                          <option value="true">{uiText('library.value.yes')}</option>
                          <option value="false">{uiText('library.value.no')}</option>
                        </select>
                      ) : (
                        <input
                          className="prop-new-input"
                          type={creating.type === 'number' ? 'number' : creating.type === 'date' ? 'date' : creating.type === 'datetime' ? 'datetime-local' : 'text'}
                          value={creating.defaultInput}
                          aria-label={uiText('property.defaultValue')}
                          placeholder={uiText('property.defaultValue')}
                          onChange={event => setCreating({ ...creating, defaultInput: event.target.value })}
                        />
                      )}
                      {(['clip', 'screenshot'] as const).map(type => (
                        <SettingsCheckChip
                          key={type}
                          checked={creating.presets.includes(type)}
                          onChange={checked => setCreating({ ...creating, presets: checked ? [...creating.presets, type] : creating.presets.filter(item => item !== type) })}
                          label={uiText(type === 'clip' ? 'library.clips' : 'library.screenshots')}
                        />
                      ))}
                    </div>
                    <div className="prop-new-actions">
                      <button
                        type="button"
                        className="ghost sm quiet"
                        onClick={() => {
                          setCreating(null)
                          setSubmitError('')
                        }}
                      >
                        {uiText('common.cancel')}
                      </button>
                      <button
                        type="button"
                        className="primary sm"
                        disabled={!creating.name.trim() || liveError !== ''}
                        onClick={() => {
                          const value = defaultValueFor(creating)
                          void upsert(
                            {
                              name: creating.name.trim(),
                              type: creating.type,
                              builtin: false,
                              presets: creating.presets,
                              ...(value === undefined ? {} : { defaultValue: value }),
                            },
                            code => setSubmitError(entryErrorText(code)),
                          ).then(ok => {
                            if (ok) {
                              setCreating(null)
                              setSubmitError('')
                            }
                          })
                        }}
                      >
                        {uiText('common.save')}
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
