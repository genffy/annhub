import { ShieldCheck } from 'lucide-react'
import type { LandingCopy } from '@/lib/copy'
import { ANNOTATE, ANNOTATE_EDITOR, ANNOTATE_RECORD, AnnotateEditorScene, AnnotateRecordScene, AnnotateScene } from '../product/annotate-scene'
import Fit from '../product/fit'
import { Caption, Container, SectionTitle } from './shared'

/**
 * Page annotation and tab recording (docs/product/website.md §8): draw on the tab you are explaining, then take a
 * screenshot with the ink or record the tab as a local video. The pictures are static sketches, not the interactive
 * sample: nothing in them can be clicked.
 */
export default function Annotate({ copy }: { copy: LandingCopy }) {
  const { annotate } = copy
  return (
    <section aria-labelledby="annotate-title" className="anchor-target bg-canvas py-14 sm:py-20">
      <Container>
        <SectionTitle id="annotate-title" className="max-w-[860px]">
          {annotate.title}
        </SectionTitle>
        <p className="mt-5 max-w-[720px] text-[16px] leading-7 text-fg-3 sm:text-[17px]">{annotate.lead}</p>
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
          <div>
            <ol className="divide-y divide-line border-y border-line">
              {annotate.points.map((point, i) => (
                <li key={point.title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 py-5">
                  <span className="pt-1 font-mono text-[12px] text-fg-3">0{i + 1}</span>
                  <div>
                    <h3 className="text-[19px] font-semibold text-fg">{point.title}</h3>
                    <p className="mt-1 text-[15px] leading-6 text-fg-3">{point.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-6 flex gap-2.5 text-[13.5px] leading-6 text-fg-3">
              <ShieldCheck size={16} aria-hidden="true" className="mt-0.5 flex-none text-brand" />
              {annotate.boundary}
            </p>
          </div>
          <div role="img" aria-label={annotate.captions.annotate}>
            <div aria-hidden="true" inert>
              <Fit width={ANNOTATE.width} height={ANNOTATE.height}>
                <AnnotateScene ui={copy.ui} />
              </Fit>
            </div>
          </div>
        </div>
        <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:gap-14">
          <figure className="m-0" role="img" aria-label={annotate.captions.editor}>
            <div aria-hidden="true" inert>
              <Fit width={ANNOTATE_EDITOR.width} height={ANNOTATE_EDITOR.height}>
                <AnnotateEditorScene />
              </Fit>
            </div>
            <figcaption>
              <Caption className="mt-3">{annotate.captions.editor}</Caption>
            </figcaption>
          </figure>
          <figure className="m-0" role="img" aria-label={annotate.captions.record}>
            <div aria-hidden="true" inert>
              <Fit width={ANNOTATE_RECORD.width} height={ANNOTATE_RECORD.height}>
                <AnnotateRecordScene ui={copy.ui} />
              </Fit>
            </div>
            <figcaption>
              <Caption className="mt-3">{annotate.captions.record}</Caption>
            </figcaption>
          </figure>
        </div>
        <Caption className="mt-6">{annotate.sketch}</Caption>
      </Container>
    </section>
  )
}
