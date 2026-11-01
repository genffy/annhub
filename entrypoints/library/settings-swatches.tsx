/**
 * The beautify background picker: the eight backgrounds as swatch radios —
 * the fills come from the output side's own `backgroundCss`, so the swatches
 * and the painted picture can never drift apart. "None" draws the striped
 * no-background swatch.
 */
import { useId } from 'react'
import { Ban } from 'lucide-react'

export function SettingsSwatches<T extends string>({
  value,
  swatches,
  onChange,
  ariaLabel,
}: {
  value: T
  swatches: readonly { value: T; label: string; css: string }[]
  onChange(next: T): void
  ariaLabel: string
}) {
  const name = useId()
  return (
    <span className="bz-sws" role="radiogroup" aria-label={ariaLabel}>
      {swatches.map(swatch => (
        <label
          key={swatch.value}
          className={`bz-sw${swatch.value === value ? ' is-on' : ''}${swatch.css ? '' : ' bz-none'}`}
          style={swatch.css ? { background: swatch.css } : undefined}
          title={swatch.label}
        >
          <input type="radio" className="bz-in" name={name} checked={swatch.value === value} onChange={() => onChange(swatch.value)} aria-label={swatch.label} />
          {!swatch.css && <Ban size={12} aria-hidden />}
        </label>
      ))}
    </span>
  )
}
