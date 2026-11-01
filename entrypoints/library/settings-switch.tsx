/**
 * The settings switch (extension.md §2.5): a native checkbox wearing `role="switch"`, drawn
 * entirely by CSS. Space toggles it and the focus ring is the global one; its
 * accessible name is the row's feature name, passed in via `nameId` — never
 * "on"/"off" — with the row's description riding along as `aria-describedby`.
 */
export function SettingsSwitch({
  checked,
  onChange,
  nameId,
  describedBy,
  testId,
  disabled = false,
}: {
  checked: boolean
  onChange(next: boolean): void
  /** The id of the row's name element (aria-labelledby). */
  nameId: string
  /** The id of the row's description element, when there is one. */
  describedBy?: string
  testId?: string
  disabled?: boolean
}) {
  return (
    <input
      type="checkbox"
      role="switch"
      className="sw"
      checked={checked}
      disabled={disabled}
      onChange={event => onChange(event.target.checked)}
      aria-labelledby={nameId}
      aria-describedby={describedBy}
      data-testid={testId}
    />
  )
}
