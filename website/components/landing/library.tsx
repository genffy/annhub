import type { LandingCopy } from '@/lib/copy'
import { Container, SectionTitle } from './shared'
import TourWindow from './tour-window'

/** The introduction describes the task; the scope and controls stay beside the interactive sample. */
export default function LibrarySection({ copy }: { copy: LandingCopy }) {
  const { tour } = copy
  return (
    <section id="library" aria-labelledby="library-title" className="anchor-target bg-canvas-2 py-14 sm:py-20">
      <Container>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-end lg:gap-16">
          <SectionTitle id="library-title">{tour.title}</SectionTitle>
          <p className="max-w-[520px] text-[16px] leading-7 text-fg-3 sm:text-[17px]">{tour.intro}</p>
        </div>
        <p className="mt-6 text-[14px] leading-6 text-fg-2">{tour.hint}</p>
        <div className="mt-6">
          <TourWindow copy={copy} />
        </div>
        <p className="mt-4 text-[12px] leading-5 text-fg-3">
          {tour.sketch} · {tour.scope}
        </p>
      </Container>
    </section>
  )
}
