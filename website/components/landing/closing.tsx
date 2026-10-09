import { ArrowRight } from 'lucide-react'
import type { LandingCopy } from '@/lib/copy'
import { LIBRARY_URL, WORKFLOW_URL } from './links'
import { Container, SectionTitle } from './shared'

export default function Closing({ copy }: { copy: LandingCopy }) {
  const { closing } = copy
  return (
    <section aria-labelledby="closing-title" className="bg-white py-20 sm:py-24">
      <Container>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
          <div>
            <SectionTitle id="closing-title" className="max-w-[720px]">
              {closing.title}
            </SectionTitle>
            <p className="mt-5 max-w-[660px] text-[16px] leading-8 text-fg-3 sm:text-[17px]">{closing.body}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:flex-none">
            <a
              href={LIBRARY_URL}
              className="inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-lg bg-brand px-5 text-[15px] font-semibold text-brand-fg transition-colors hover:bg-[color-mix(in_oklab,var(--brand)_86%,#000)]"
            >
              {closing.primary}
              <ArrowRight size={17} aria-hidden="true" />
            </a>
            <a
              href={WORKFLOW_URL}
              className="inline-flex h-12 items-center whitespace-nowrap rounded-lg border border-line-2 px-5 text-[15px] font-semibold text-fg-2 transition-colors hover:border-brand hover:text-brand-text"
            >
              {closing.secondary}
            </a>
          </div>
        </div>
      </Container>
    </section>
  )
}
