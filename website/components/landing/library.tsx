import type { LandingCopy } from '@/lib/copy'
import Fit from '../product/fit'
import { SHOT_STEPS, SHOT_STITCH, ShotStepsScene, ShotStitchScene } from '../product/shot-scene'
import { Caption, Container, SectionTitle } from './shared'
import TourWindow from './tour-window'

/**
 * The introduction describes the task; the scope and controls stay beside the interactive sample. Under the window
 * sit the editor's static illustrations (docs/product/website.md §11) — nothing in them can be clicked.
 */
export default function LibrarySection({ copy }: { copy: LandingCopy }) {
  const { tour } = copy
  const scenes = { steps: ShotStepsScene, stitch: ShotStitchScene } as const
  const sizes = { steps: SHOT_STEPS, stitch: SHOT_STITCH } as const
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
        <div className="mt-12 border-t border-line pt-8">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-fg-3">{tour.statics.lead}</p>
          <div className="mt-5 grid gap-10 lg:grid-cols-2 lg:gap-14">
            {tour.statics.items.map(item => {
              const Scene = scenes[item.visual]
              const size = sizes[item.visual]
              return (
                <figure key={item.visual} className="m-0" role="img" aria-label={`${item.title}：${item.body}`}>
                  <div aria-hidden="true" inert>
                    <Fit width={size.width} height={size.height}>
                      <Scene ui={copy.ui} />
                    </Fit>
                  </div>
                  <figcaption>
                    <p className="mt-3 text-[15px] font-semibold text-fg">{item.title}</p>
                    <Caption className="mt-1">{item.body}</Caption>
                  </figcaption>
                </figure>
              )
            })}
          </div>
        </div>
      </Container>
    </section>
  )
}
