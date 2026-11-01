/**
 * The settings slider: a native range plus its numeric readout. The draft
 * semantics stay as they were (RV-LIB-05): dragging moves only the local
 * value, the commit happens on pointer release, key release or blur, and a
 * failed commit leaves the local value in place for the next try.
 */
import { useEffect, useState, type CSSProperties } from 'react'

export function SettingsSlider({
  value,
  min,
  max,
  step,
  onCommit,
  format,
  nameId,
  disabled = false,
}: {
  /** The saved value the knob starts from. */
  value: number
  min: number
  max: number
  step: number
  onCommit(next: number): void
  format(value: number): string
  nameId: string
  disabled?: boolean
}) {
  const [draft, setDraft] = useState(value)
  // a saved change arrives from outside; a failed commit changes nothing, so the draft survives it
  useEffect(() => setDraft(value), [value])

  const commit = (element: HTMLInputElement): void => {
    const next = Number(element.value)
    if (next !== value) onCommit(next)
  }
  const fill = ((draft - min) / (max - min)) * 100
  return (
    <span className="sl">
      <input
        type="range"
        className="sl-in"
        min={min}
        max={max}
        step={step}
        value={draft}
        disabled={disabled}
        aria-labelledby={nameId}
        style={{ '--sl-fill': `${fill}%` } as CSSProperties}
        onChange={event => setDraft(Number(event.target.value))}
        onPointerUp={event => commit(event.currentTarget)}
        onKeyUp={event => commit(event.currentTarget)}
        onBlur={event => commit(event.currentTarget)}
      />
      <span className="sl-val">{format(draft)}</span>
    </span>
  )
}
