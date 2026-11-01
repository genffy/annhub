/**
 * The corner picker (the watermark's position): a small box with one radio in
 * each corner, named by the corner it picks. Native radios again — the arrow
 * keys walk the four corners.
 */
import { useId } from 'react'

export function SettingsCornerPicker<T extends string>({
  value,
  corners,
  onChange,
  ariaLabel,
}: {
  value: T
  corners: readonly { value: T; label: string; corner: 'tl' | 'tr' | 'bl' | 'br' }[]
  onChange(next: T): void
  ariaLabel: string
}) {
  const name = useId()
  return (
    <span className="posbox" role="radiogroup" aria-label={ariaLabel}>
      {corners.map(corner => (
        <label key={corner.value} className={`pos-cell pos-${corner.corner}${corner.value === value ? ' is-on' : ''}`}>
          <input type="radio" className="pos-in" name={name} checked={corner.value === value} onChange={() => onChange(corner.value)} aria-label={corner.label} />
        </label>
      ))}
    </span>
  )
}
