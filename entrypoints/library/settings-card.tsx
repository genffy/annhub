/**
 * The settings card syntax (extension.md §2.5): a card of titled rows, each
 * row a name with an optional one-line description on the left and its
 * control on the right. The row hands the control its name's id (and its
 * description's), so a switch is announced as the feature it switches — that
 * handoff is the point of the render-prop child.
 */
import { useId, type ReactNode } from 'react'

export function SettingsCard({ title, testId, children }: { title: string; testId?: string; children: ReactNode }) {
  return (
    <section className="set" data-testid={testId}>
      <div className="set-h">
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  )
}

export function SettingsRow({ name, desc, children }: { name: string; desc?: string; children: ReactNode | ((ids: { nameId: string; descId?: string }) => ReactNode) }) {
  const nameId = useId()
  const descId = useId()
  return (
    <div className="set-r">
      <div className="set-l" id={nameId}>
        <b>{name}</b>
        {desc && <small id={descId}>{desc}</small>}
      </div>
      <div className="set-ctl">{typeof children === 'function' ? children({ nameId, descId }) : children}</div>
    </div>
  )
}
