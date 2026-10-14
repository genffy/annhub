import type { LandingCopy, StoryStep } from '@/lib/copy'
import { HighlightBar, markdownLabels } from '../product/detail'
import ExportFile from '../product/export-file'
import Fit from '../product/fit'
import { SearchBox } from '../product/library'
import { Markdown, rangeOf } from '../product/markdown'
import { Anchored, BlockOutline, BlockPill, SelectionMenu } from '../product/page-scenes'
import { TypeChip } from '../product/parts'
import { entryById, getSample } from '../product/sample'
import { ShotMini } from '../product/shot-scene'

/** At narrow widths show the relevant piece at reading size, using the same sample and product components. */
export default function StoryFocus({ step, copy }: { step: StoryStep['id']; copy: LandingCopy }) {
  const { ui } = copy
  const sample = getSample(copy.locale)
  const page = sample.retries
  const reading = entryById(sample, sample.reading)
  const hit = entryById(sample, sample.search.hits[0]!)

  if (step === 'shot')
    return (
      <Fit width={400} height={290}>
        <ShotMini ui={ui} />
      </Fit>
    )

  if (step === 'export') {
    const file = {
      ...sample.exportFile,
      frontmatter: sample.exportFile.frontmatter.filter(([key]) => ['title', 'project', 'tags'].includes(key)),
      body: { ...sample.exportFile.body, lines: sample.exportFile.body.lines.slice(0, 5) },
    }
    return <ExportFile file={file} ui={ui} className="story-file" />
  }

  if (step === 'find')
    return (
      <div className="ah story-focus">
        <SearchBox ui={ui} query={sample.search.query} />
        <p className="mb-5 mt-3 text-[13px] text-brand-text">{sample.search.propertyChip}</p>
        <TypeChip type="clip" label={ui.types.clip} />
        <h4 className="mt-3 text-[19px] font-semibold">{hit.title}</h4>
        <p className="mt-2 text-[15px] leading-7 text-fg-2">{hit.content.split('\n\n').find(p => !p.startsWith('#'))}</p>
        <p className="mt-5 break-all border-t border-line pt-3 text-[12px] text-fg-3">
          {hit.host}
          {hit.path}
        </p>
      </div>
    )

  if (step === 'read')
    return (
      <div className="ah story-focus">
        <div className="mb-8">
          <TypeChip type="clip" label={ui.types.clip} />
        </div>
        <Markdown
          source={reading.content.split('\n\n').slice(0, 3).join('\n\n')}
          highlights={reading.highlights}
          selection={rangeOf(reading.content, page.backoff.bold)}
          selectionOverlay={<HighlightBar ui={ui} hover={0} preview />}
          className="ah-md-sm"
          labels={markdownLabels(ui)}
          colorNames={ui.colors}
        />
      </div>
    )

  if (step === 'block')
    return (
      <div className="ah ah-pg story-focus">
        <p className="mb-12 text-[12px] text-fg-3">engineering.example.com</p>
        <section className="ah-sx p-3">
          <BlockOutline />
          <BlockPill ui={ui} corner="tl" />
          <h4 className="mb-3 text-[18px] font-bold">{page.backoff.heading}</h4>
          <ol className="list-decimal space-y-2 pl-5 text-[15px] leading-6">
            {page.backoff.steps.map(s => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>
      </div>
    )

  return (
    <div className="ah ah-pg story-focus">
      <p className="text-[12px] text-fg-3">engineering.example.com</p>
      <h4 className="mt-3 text-[19px] font-bold">{page.storm.heading}</h4>
      <p className="mt-16 text-[16px] leading-8">
        <span className="ah-sel ah-anchor">
          {page.storm.selection}
          <Anchored place="above">
            <SelectionMenu ui={ui} hover={0} />
          </Anchored>
        </span>
      </p>
    </div>
  )
}
