import type { LandingCopy } from '@/lib/copy'
import { Container, SectionTitle } from './shared'

/** Three concrete problems, kept short enough to read before reaching the product. */
export default function Problem({ copy }: { copy: LandingCopy }) {
  const { problem } = copy
  return (
    <section id="problem" aria-labelledby="problem-title" className="anchor-target bg-white py-14 sm:py-20">
      <Container>
        <div className="grid gap-8 lg:grid-cols-[5fr_7fr] lg:gap-20">
          <SectionTitle id="problem-title">{problem.title}</SectionTitle>
          <ol className="divide-y divide-line border-y border-line">
            {problem.items.map((item, i) => (
              <li key={item.title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 py-5">
                <span className="pt-1 font-mono text-[12px] text-fg-3">0{i + 1}</span>
                <div>
                  <h3 className="text-[19px] font-semibold text-fg">{item.title}</h3>
                  <p className="mt-1 text-[15px] leading-6 text-fg-3">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  )
}
