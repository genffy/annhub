import { ArrowRight, FileText, Library, MessageSquareText, Search, Tags } from 'lucide-react'
import type { LandingCopy } from '@/lib/copy'
import { HighlightBar, markdownLabels } from '../product/detail'
import Fit from '../product/fit'
import { Markdown } from '../product/markdown'
import { Anchored, FeedPost, SelectionMenu } from '../product/page-scenes'
import { Ic, TypeChip, TypeTile } from '../product/parts'
import { entryById, getSample } from '../product/sample'
import { ShotMini } from '../product/shot-scene'
import type { EntryType } from '../product/types'
import { Container, RichText, SectionTitle } from './shared'

function ClipMini({ copy }: { copy: LandingCopy }) {
  const { ui } = copy
  return (
    <div className="ah ah-pg overflow-hidden rounded-md border border-line px-5 pb-5 pt-[70px]">
      <p className="m-0 font-serif text-[15.5px] leading-[1.7] text-[#26241f]">
        Instead of letting buffers absorb the mismatch indefinitely,{' '}
        <span className="ah-sel ah-anchor">
          the consumer signals demand upstream
          <Anchored place="above">
            <SelectionMenu ui={ui} hover={0} />
          </Anchored>
        </span>{' '}
        so the producer slows down, pauses, or drops work it cannot deliver.
      </p>
      <div className="mt-9">
        <FeedPost
          ui={ui}
          hovered
          text="Retries without a budget are just a slower way to take your dependency down. A short thread on what we changed ↓"
          link="example.com/retry-budgets"
        />
      </div>
    </div>
  )
}

function HighlightMini({ copy }: { copy: LandingCopy }) {
  const { ui } = copy
  const sample = getSample(copy.locale)
  const entry = entryById(sample, 'storm')
  return (
    <div className="ah overflow-hidden rounded-md border border-line bg-surface">
      <div className="px-5 pb-4 pt-[62px]">
        <div className="mb-14 flex items-center gap-2">
          <TypeChip type="clip" label={ui.types.clip} small />
          <span className="ah-muted ah-truncate text-[12px]">
            {entry.host}
            {entry.path}
          </span>
        </div>
        <Markdown
          source={entry.content}
          highlights={entry.highlights}
          selection={{ start: 0, end: entry.content.search(/[,，]/) }}
          selectionOverlay={<HighlightBar ui={ui} hover={0} />}
          className="ah-md-sm"
          labels={markdownLabels(ui)}
          colorNames={ui.colors}
        />
      </div>
      <div className="border-t border-line bg-surface-2">
        {entry.highlights.map(h => (
          <div key={h.id} className={`ah-hli ah-c-${h.color}`}>
            <i className="bar" />
            <div>
              <div className="q">{h.quote}</div>
              {h.note ? (
                <div className="n">
                  <Ic icon={MessageSquareText} />
                  <span>{h.note}</span>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The three actions of the product in one sentence each, each with the picture of its moment (website.md §7). */
function Scene({ kind, copy }: { kind: EntryType | 'highlight'; copy: LandingCopy }) {
  if (kind === 'clip') return <ClipMini copy={copy} />
  if (kind === 'screenshot') {
    return (
      <Fit width={400} height={290}>
        <ShotMini ui={copy.ui} />
      </Fit>
    )
  }
  return <HighlightMini copy={copy} />
}

/** Clips, screenshots and highlights meet in one library, one set of properties, one export. */
function Unified({ copy }: { copy: LandingCopy }) {
  const { ui } = copy
  const node = 'rounded-md border border-line-2 bg-white px-3.5 py-3 shadow-card'
  return (
    <div className="mt-8 grid items-center gap-8 rounded-lg border border-line bg-white p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-14">
      <p className="max-w-[600px] text-[18px] leading-8 text-fg sm:text-[20px] sm:leading-9">
        <RichText text={copy.ways.unified.lead} />
      </p>
      <div className="ah flex flex-wrap items-center gap-3" aria-hidden="true">
        <div className={`${node} flex flex-col gap-1.5`}>
          <TypeChip type="clip" label={ui.types.clip} />
          <TypeChip type="screenshot" label={ui.types.screenshot} />
        </div>
        <Ic icon={ArrowRight} className="text-fg-4" />
        <div className={`${node} flex flex-col gap-2`}>
          <span className="flex items-center gap-2 text-[13px] font-semibold text-fg">
            <Ic icon={Library} className="text-brand" />
            {ui.nav.library}
          </span>
          <span className="flex items-center gap-1.5 text-[12px] text-fg-3">
            <Ic icon={Tags} size={13} />
            {ui.nav.properties}
            <Ic icon={Search} size={13} className="ml-1.5" />
            {ui.list.search.replace('…', '')}
          </span>
        </div>
        <Ic icon={ArrowRight} className="text-fg-4" />
        <div className={`${node} flex flex-col gap-1.5`}>
          <span className="flex items-center gap-2 text-[13px] font-semibold text-fg">
            <Ic icon={FileText} className="text-fg-3" />
            Markdown
          </span>
          <span className="font-mono text-[11.5px] text-fg-3">frontmatter · ==…==</span>
        </div>
      </div>
    </div>
  )
}

export default function Ways({ copy }: { copy: LandingCopy }) {
  const { ways } = copy
  return (
    <section id="ways" aria-labelledby="ways-title" className="anchor-target bg-canvas py-20 sm:py-28">
      <Container>
        <SectionTitle id="ways-title" className="max-w-[860px]">
          {ways.title}
        </SectionTitle>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {ways.kinds.map(kind => (
            <article key={kind.id} className="flex flex-col overflow-hidden rounded-lg border border-line bg-white shadow-card">
              <div className="p-6 sm:p-7">
                <div className="flex items-center gap-3">
                  <TypeTile type={kind.id} />
                  <h3 className="text-[24px] font-bold leading-none" style={{ color: `color-mix(in oklab, var(--t-${kind.id}) 78%, var(--fg))` }}>
                    {kind.name}
                  </h3>
                </div>
                <p className="mt-4 text-[16px] leading-7 text-fg-2">{kind.body}</p>
              </div>
              <div className="mt-auto flex flex-1 flex-col justify-center border-t border-line bg-canvas p-4 sm:p-5 lg:min-h-[390px]" role="img" aria-label={kind.caption}>
                <Scene kind={kind.id} copy={copy} />
              </div>
            </article>
          ))}
        </div>
        <Unified copy={copy} />
      </Container>
    </section>
  )
}
