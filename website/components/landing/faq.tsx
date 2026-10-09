import { ChevronRight } from 'lucide-react'
import type { LandingCopy } from '@/lib/copy'
import { Container, RichText, SectionTitle } from './shared'

/** The questions a careful reader asks first. Comparisons carry the date they were checked (website.md §13). */
export default function Faq({ copy }: { copy: LandingCopy }) {
  const { faq } = copy
  return (
    <section id="faq" aria-labelledby="faq-title" className="anchor-target bg-canvas py-20 sm:py-28">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionTitle id="faq-title">{faq.title}</SectionTitle>
            <p className="mt-4 text-[16px] leading-7 text-fg-3">{faq.lead}</p>
          </div>
          <div className="divide-y divide-line-2 border-y border-line-2">
            {faq.items.map(item => (
              <details key={item.q} className="group py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[17px] font-semibold leading-snug text-fg marker:hidden [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <ChevronRight size={18} aria-hidden="true" className="flex-none text-fg-3 transition-transform duration-200 group-open:rotate-90 group-open:text-brand" />
                </summary>
                <div className="max-w-[680px] pb-6 text-[15.5px] leading-7 text-fg-3">
                  <p>
                    <RichText text={item.a} />
                  </p>
                  {item.note ? <p className="mt-3 text-[12.5px] leading-5 text-fg-3">{item.note}</p> : null}
                </div>
              </details>
            ))}
          </div>
        </div>
      </Container>
    </section>
  )
}
