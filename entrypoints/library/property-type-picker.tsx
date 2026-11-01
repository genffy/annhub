/**
 * The six property types as a grid of selectable chips (visual.md §3: icon and name together,
 * the colour only assisting). One radiogroup: an arrow key moves the selection in one press,
 * Home and End reach the ends. The drawer's "add property" and the properties page's "new"
 * both pick a type here.
 */
import { useRef } from 'react'
import { PROPERTY_TYPES, type PropertyType } from '../../learning-core/types'
import { PROPERTY_TYPE_ICONS } from '../../utils/entry-icons'
import { uiText } from '../../utils/ui-text'

/** Where a key press inside the grid lands, or null when the key is not the group's: left and
 * right step by one, up and down by a row (three columns), both wrapping; Home and End reach
 * the ends. A disabled group answers nothing. */
export function nextPropertyType(current: PropertyType, key: string, disabled = false): PropertyType | null {
  if (disabled) return null
  const count = PROPERTY_TYPES.length
  const index = PROPERTY_TYPES.indexOf(current)
  const wrapped = (step: number): PropertyType => PROPERTY_TYPES[(index + step + count) % count]!
  switch (key) {
    case 'ArrowRight':
      return wrapped(1)
    case 'ArrowLeft':
      return wrapped(-1)
    case 'ArrowDown':
      return wrapped(3)
    case 'ArrowUp':
      return wrapped(-3)
    case 'Home':
      return PROPERTY_TYPES[0]!
    case 'End':
      return PROPERTY_TYPES[count - 1]!
    default:
      return null
  }
}

export function PropertyTypePicker({
  value,
  onChange,
  ariaLabel,
  disabled = false,
}: {
  value: PropertyType
  onChange: (type: PropertyType) => void
  ariaLabel: string
  disabled?: boolean
}) {
  const groupRef = useRef<HTMLDivElement>(null)

  const onKeyDown = (event: React.KeyboardEvent): void => {
    const next = nextPropertyType(value, event.key, disabled)
    if (!next) return
    event.preventDefault()
    onChange(next)
    // the roving tab stop follows the arrows, and so does the focus itself
    requestAnimationFrame(() => groupRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus())
  }

  return (
    <div ref={groupRef} className="ptypes" role="radiogroup" aria-label={ariaLabel} onKeyDown={onKeyDown}>
      {PROPERTY_TYPES.map(type => {
        const Icon = PROPERTY_TYPE_ICONS[type]
        const checked = type === value
        return (
          <button key={type} type="button" role="radio" aria-checked={checked} tabIndex={checked ? 0 : -1} disabled={disabled} className="ptype" onClick={() => onChange(type)}>
            <Icon size={14} aria-hidden />
            {uiText(`property.type.${type}` as 'property.type.text')}
          </button>
        )
      })}
    </div>
  )
}
