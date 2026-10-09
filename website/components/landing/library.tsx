import type { LandingCopy } from '@/lib/copy'
import { Container, SectionTitle } from './shared'
import LibraryTour from './library-tour'

/** The library, as a window you can use (website.md §10). The interaction lives in LibraryTour. */
export default function LibrarySection({ copy }: { copy: LandingCopy }) {
  const { tour } = copy
  return (
    <section id="library" aria-labelledby="library-title" className="anchor-target bg-canvas-2 py-20 sm:py-28">
      <Container>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-end lg:gap-16">
          <SectionTitle id="library-title">{tour.title}</SectionTitle>
          <p className="max-w-[520px] text-[16px] leading-7 text-fg-3 sm:text-[17px]">{tour.intro}</p>
        </div>
        <div className="mt-10">
          <LibraryTour copy={copy} />
        </div>
        <p className="mt-6 text-[12px] text-fg-3">{tour.sketch}</p>
      </Container>
    </section>
  )
}
