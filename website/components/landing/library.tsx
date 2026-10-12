import { Download, Highlighter, Link as LinkIcon, PanelLeft, Tags } from 'lucide-react'
import type { LandingCopy } from '@/lib/copy'
import { Container, SectionTitle } from './shared'
import TourWindow from './tour-window'

const PIN_ICONS = [PanelLeft, LinkIcon, Highlighter, Tags, Download]

/**
 * The library, as a window you can use (website.md §10). The interaction lives in LibraryTour; the pins and the hint are
 * page content and stay in the build output (docs/v2/seo-geo.md §4.3), where clicking a pin drives the mounted window.
 */
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
          <TourWindow copy={copy} />
        </div>
        <p className="mt-4 text-[13.5px] leading-6 text-fg-2">{tour.hint}</p>
        <ol className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          {tour.pins.map((pin, i) => {
            const Icon = PIN_ICONS[i]!
            return (
              <li key={pin.title}>
                {/* The mounted tour marks the pin it is showing with aria-pressed (see library-tour.tsx). */}
                <button
                  type="button"
                  data-tour-pin={i}
                  aria-pressed={i === 0}
                  className="group h-full w-full rounded-lg border border-line bg-white/60 p-4 text-left transition-colors hover:border-line-2 hover:bg-white aria-pressed:border-brand aria-pressed:bg-white aria-pressed:shadow-card"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-3 text-fg-3 group-aria-pressed:bg-brand group-aria-pressed:text-brand-fg">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <span className="mt-3 block text-[15px] font-semibold leading-snug text-fg">{pin.title}</span>
                  <span className="mt-1.5 block text-[13px] leading-6 text-fg-3">{pin.body}</span>
                </button>
              </li>
            )
          })}
        </ol>
        <p className="mt-6 text-[12px] text-fg-3">{tour.sketch}</p>
      </Container>
    </section>
  )
}
