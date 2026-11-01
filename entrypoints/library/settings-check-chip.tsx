/**
 * The checkbox chip: a native checkbox dressed as a small chip, with the check
 * mark and — for the ratio presets — the little aspect-ratio box the design
 * draws. Clicking the chip toggles the box inside it.
 */
import { Check } from 'lucide-react'

export function SettingsCheckChip({
  checked,
  onChange,
  label,
  ratio,
  testId,
}: {
  checked: boolean
  onChange(next: boolean): void
  label: string
  /** The ratio the chip stands for, drawn as a w×h outline at 13px on its long side. */
  ratio?: { w: number; h: number }
  testId?: string
}) {
  const longest = ratio ? Math.max(ratio.w, ratio.h) : 1
  return (
    <label className={`rcheck${checked ? ' is-on' : ''}`}>
      <input type="checkbox" className="rcheck-in" checked={checked} onChange={event => onChange(event.target.checked)} data-testid={testId} />
      {checked && <Check size={13} strokeWidth={3} aria-hidden />}
      {ratio && <i className="rg" style={{ width: Math.round((ratio.w * 13) / longest), height: Math.round((ratio.h * 13) / longest) }} aria-hidden />}
      {label}
    </label>
  )
}
