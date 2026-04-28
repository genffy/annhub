import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '../../../components/utils'

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
        {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-2xl border border-slate-200 bg-white p-6 shadow-sm', className)}>{children}</section>
}

export function SettingsSection({ title, description, children }: { title: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-slate-100 py-6 last:border-b-0 first:pt-0 last:pb-0">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-950">{title}</h3>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

export function Field({ label, hint, children, align = 'center' }: { label: ReactNode; hint?: ReactNode; children: ReactNode; align?: 'center' | 'start' }) {
  return (
    <label className={cn('grid gap-2 md:grid-cols-[220px_minmax(0,1fr)] md:gap-4', align === 'center' ? 'md:items-center' : 'md:items-start')}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span>
        {children}
        {hint && <small className="mt-1.5 block text-xs leading-5 text-slate-500">{hint}</small>}
      </span>
    </label>
  )
}

export function CheckboxField({ label, hint, checked, onChange }: { label: ReactNode; hint?: ReactNode; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-slate-950" />
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {hint && <small className="mt-1 block text-xs leading-5 text-slate-500">{hint}</small>}
      </span>
    </label>
  )
}

const controlClassName =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500'

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClassName, className)} {...props} />
}

export function SelectInput({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(controlClassName, className)} {...props} />
}

export function TextareaInput({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClassName, 'min-h-24 resize-y', className)} {...props} />
}

export function StatusMessage({ children, tone = 'success', className }: { children: ReactNode; tone?: 'success' | 'error'; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-3 text-sm',
        tone === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700',
        className,
      )}
    >
      {children}
    </div>
  )
}
