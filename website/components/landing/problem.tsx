import { Bookmark, CircleHelp, FileText, FolderOpen, Highlighter } from 'lucide-react'
import type { LandingCopy } from '@/lib/copy'
import { Container, SectionTitle } from './shared'

/** One small picture of each problem, drawn in muted neutrals: these are other tools' leftovers, not AnnHub. */
function Evidence({ index, items }: { index: number; items: string[] }) {
  const chip = 'inline-flex items-center gap-2 rounded-md border border-dashed border-line-2 bg-surface-2 px-3 py-2 text-[12.5px] text-fg-3'
  if (index === 0) {
    const icons = [Bookmark, Highlighter, FolderOpen]
    return (
      <div className="mt-5 flex flex-wrap gap-2" aria-hidden="true">
        {items.map((label, i) => {
          const Icon = icons[i]!
          return (
            <span key={label} className={chip}>
              <Icon size={14} />
              {label}
            </span>
          )
        })}
      </div>
    )
  }
  if (index === 1) {
    return (
      <div className="mt-5 flex flex-wrap items-center gap-3" aria-hidden="true">
        <span className="max-w-[360px] border-l-[3px] border-line-2 py-0.5 pl-3 font-serif text-[15px] leading-6 text-fg-2">{items[0]}</span>
        <span className={chip}>
          <CircleHelp size={14} />
          {items[1]}
        </span>
      </div>
    )
  }
  return (
    <div className="mt-5 flex flex-wrap gap-2" aria-hidden="true">
      {items.map(label => (
        <span key={label} className={chip}>
          <FileText size={14} />
          {label}
        </span>
      ))}
    </div>
  )
}

/** "Saving is easy. Finding it again is not." Typographic on purpose: the hero above it is all pictures. */
export default function Problem({ copy }: { copy: LandingCopy }) {
  const { problem } = copy
  return (
    <section id="problem" aria-labelledby="problem-title" className="anchor-target bg-white py-20 sm:py-28">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[5fr_7fr] lg:gap-20">
          <SectionTitle id="problem-title" className="lg:sticky lg:top-28 lg:self-start">
            {problem.title}
          </SectionTitle>
          <ol className="border-y border-line">
            {problem.items.map((item, i) => (
              <li key={item.title} className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-4 border-b border-line py-8 last:border-b-0 sm:grid-cols-[56px_minmax(0,1fr)]">
                <span className="pt-1.5 font-mono text-[13px] text-fg-4">0{i + 1}</span>
                <div>
                  <h3 className="text-[21px] font-semibold leading-snug text-fg sm:text-[24px]">{item.title}</h3>
                  <p className="mt-2 max-w-[520px] text-[16px] leading-7 text-fg-3">{item.body}</p>
                  <Evidence index={i} items={item.evidence} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  )
}
