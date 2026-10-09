import type { ReactNode } from 'react'

/** The page's content column. */
export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-page px-5 sm:px-8 lg:px-10 ${className}`}>{children}</div>
}

/** Text with `inline code` between backticks. Copy stays plain strings, so each one can be translated whole. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('`') && part.endsWith('`') ? (
          <code key={i} className="rounded-[5px] bg-surface-3 px-1.5 py-0.5 font-mono text-[0.86em] text-fg-2">
            {part.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

/**
 * Chinese has no spaces to break at, so a heading can split in the middle of a phrase. Wrapping each clause in an
 * inline-block lets lines break only after 。，、；. Text without such punctuation (English) is returned unchanged.
 */
export function Clauses({ text }: { text: string }) {
  // clauses end with their punctuation; written without lookbehind, which older Safari rejects at parse time
  const clauses = text.match(/[^。，、；：！？]*[。，、；：！？]|[^。，、；：！？]+$/g) ?? [text]
  if (clauses.length < 2) return <>{text}</>
  return (
    <>
      {clauses.map((clause, i) => (
        <span key={i} className="inline-block">
          {clause}
        </span>
      ))}
    </>
  )
}

/** Section headline: large, tight, never preceded by a pill or an eyebrow unless the section really needs one. */
export function SectionTitle({ id, children, className = '' }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <h2 id={id} className={`display text-[30px] font-bold leading-[1.12] text-fg sm:text-[38px] lg:text-[46px] ${className}`}>
      {typeof children === 'string' ? <Clauses text={children} /> : children}
    </h2>
  )
}

/** The small caption under a product picture: what it shows, and that it is a sketch. */
export function Caption({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-[12.5px] leading-5 text-fg-3 ${className}`}>{children}</p>
}
