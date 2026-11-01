/**
 * The settings segmented control: a `role="radiogroup"` of native radios, one
 * per segment. The radios stay real inputs, so the arrow keys walk the group
 * and Space picks a segment without any script of ours; the checked segment
 * is the one visually raised.
 */
import { useId } from 'react'

export function SettingsSegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
}: {
  value: T
  options: readonly { value: T; label: string }[]
  onChange(next: T): void
  ariaLabel: string
  disabled?: boolean
}) {
  // one group per control: the name ties the radios together for the arrow keys
  const name = useId()
  return (
    <span className="seg" role="radiogroup" aria-label={ariaLabel}>
      {options.map(option => (
        <label key={option.value} className={`seg-opt${option.value === value ? ' is-on' : ''}`}>
          <input type="radio" className="seg-in" name={name} value={option.value} checked={option.value === value} disabled={disabled} onChange={() => onChange(option.value)} />
          <span>{option.label}</span>
        </label>
      ))}
    </span>
  )
}
