import type { ReactNode } from 'react'
import { cn } from '../../../components/utils'

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-ann-text">{title}</h2>
        {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-ann-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function SettingsSection({ title, description, children }: { title: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-ann-border py-6 last:border-b-0 first:pt-0 last:pb-0">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-ann-text">{title}</h3>
        {description && <p className="mt-1 text-sm text-ann-muted">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

export function StatusMessage({ children, tone = 'success', className }: { children: ReactNode; tone?: 'success' | 'error'; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-3 text-sm',
        tone === 'error' ? 'border-ann-danger bg-ann-danger-bg text-ann-danger' : 'border-ann-success bg-ann-success-bg text-ann-success',
        className,
      )}
    >
      {children}
    </div>
  )
}
