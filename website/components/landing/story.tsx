import type { ReactNode } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import type { LandingCopy, StoryStep } from '@/lib/copy'
import { BrowserFrame } from '../product/browser'
import { Drawer, HighlightBar, Reader } from '../product/detail'
import ExportFile from '../product/export-file'
import Fit from '../product/fit'
import { AppShell, EntryList, FilterBar, PageHead, SearchBox } from '../product/library'
import { rangeOf } from '../product/markdown'
import { plural } from '../product/parts'
import { RetriesArticle } from '../product/page-scenes'
import { entryById, getSample } from '../product/sample'
import { ShotScene } from '../product/shot-scene'
import { Container, SectionTitle } from './shared'
import StoryStepper from './story-stepper'

/** One week, six moments (docs/v2/examples.md §2): read and clip, organise, find, take away. */
export default function Story({ copy }: { copy: LandingCopy }) {
  const { story, ui } = copy
  const sample = getSample(copy.locale)
  const page = sample.retries
  const url = 'engineering.example.com/posts/retries'
  const reading = entryById(sample, sample.reading)
  const hit = entryById(sample, sample.search.hits[0]!)

  const web = (focus: 'select' | 'block', offset: number) => (
    <Fit width={840} height={500}>
      <BrowserFrame title={page.title} url={url} width={840} height={500}>
        <RetriesArticle ui={ui} page={page} focus={focus} offset={offset} />
      </BrowserFrame>
    </Fit>
  )

  const app = (route: string, title: string, children: ReactNode, active: 'all' | 'clip' = 'all') => (
    <Fit width={880} height={540}>
      <BrowserFrame title={`${title} · AnnHub`} url={`chrome-extension://annhub/app.html#/${route}`} width={880} height={540}>
        <AppShell ui={ui} active={active} counts={sample.counts} rail>
          {children}
        </AppShell>
      </BrowserFrame>
    </Fit>
  )

  const scenes: Record<StoryStep['id'], ReactNode> = {
    select: web('select', 70),
    block: web('block', 300),
    shot: (
      <Fit width={760} height={470}>
        <ShotScene ui={ui} mode="edit" className="ah-win" />
      </Fit>
    ),
    read: app(
      `read/${reading.id}`,
      reading.title,
      <Reader
        entry={reading}
        registry={sample.registry}
        ui={ui}
        tab="highlights"
        selection={rangeOf(reading.content, page.backoff.bold)}
        selectionOverlay={<HighlightBar ui={ui} hover={0} />}
      />,
      'clip',
    ),
    find: app(
      'all',
      ui.nav.all,
      <>
        <PageHead title={ui.nav.all} sub={plural(1, ui.list.count, ui.list.countOne)} />
        {/* the drawer is 440px wide: leave its width free so the search, the filter chip and the row wrap beside it */}
        <div className="ah-pbody" style={{ paddingRight: 472 }}>
          <SearchBox ui={ui} query={sample.search.query} focus />
          <FilterBar ui={ui} active={[{ icon: SlidersHorizontal, label: sample.search.propertyChip }]} count={1} />
          <EntryList entries={[hit]} ui={ui} selectedId={hit.id} hoverId={hit.id} />
        </div>
        <Drawer entry={hit} registry={sample.registry} ui={ui} />
      </>,
    ),
    export: (
      <Fit width={760} height={450}>
        <div className="ah-win" style={{ width: 760, height: 450, background: 'var(--surface)' }}>
          <ExportFile file={sample.exportFile} ui={ui} />
        </div>
      </Fit>
    ),
  }

  return (
    <section id="story" aria-labelledby="story-title" className="anchor-target bg-white py-20 sm:py-28">
      <Container>
        <SectionTitle id="story-title" className="max-w-[820px]">
          {story.title}
        </SectionTitle>
        <p className="mt-5 max-w-[720px] text-[16px] leading-7 text-fg-3 sm:text-[17px]">{story.intro}</p>
        <StoryStepper steps={story.steps} scenes={scenes} labels={{ stepOf: story.stepOf, prev: story.prev, next: story.next }} />
        <p className="mt-8 border-t border-line pt-6 text-[15px] font-medium text-fg-2">{story.outro}</p>
      </Container>
    </section>
  )
}
