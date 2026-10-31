import { ArrowRight, ArrowUpRight, FileText, Lock, Puzzle, WifiOff } from 'lucide-react'
import type { LandingCopy } from '@/lib/copy'
import { BrowserFrame } from '../product/browser'
import { Reader } from '../product/detail'
import { AppShell, EntryList, PageHead, SearchBox } from '../product/library'
import { Anchored, HeroArticle, SelectionMenu } from '../product/page-scenes'
import { plural } from '../product/parts'
import { entryById, getSample } from '../product/sample'
import { Clauses, Container } from './shared'
import { LIBRARY_URL, STORE_URL } from './links'

const FACT_ICONS = [WifiOff, Lock, FileText]

/** On a phone a scaled-down window is unreadable, so the first picture is the page itself at natural size. */
function HeroPhone({ copy }: { copy: LandingCopy }) {
  return (
    <div className="mt-7 sm:hidden" role="img" aria-label={copy.hero.captions.page}>
      <div aria-hidden="true" inert className="ah ah-pg ah-win">
        <div className="flex items-center gap-2 border-b border-[#ececec] px-4 py-2.5 text-[12px] text-[#6b6965]" style={{ fontFamily: 'var(--font-ui)' }}>
          <Lock size={12} aria-hidden="true" />
          engineering.example.com
        </div>
        <div className="px-5 pb-6 pt-6">
          <div className="text-[24px] font-bold leading-tight tracking-[-0.01em] text-[#1c1b1a]">Backpressure in Streams</div>
          <p className="mt-1 text-[12px] text-[#77736d]" style={{ fontFamily: 'var(--font-ui)' }}>
            Platform Engineering · Updated Sep 28 · 9 min read
          </p>
          <p className="mt-[88px] text-[16px] leading-[1.7] text-[#26241f]">
            <span className="ah-sel ah-anchor">
              <b>Backpressure</b> is how a system pushes that pain back where it belongs.
              <Anchored place="above">
                <SelectionMenu ui={copy.ui} hover={0} />
              </Anchored>
            </span>{' '}
            Instead of letting buffers absorb the mismatch indefinitely, the consumer signals demand upstream so the producer slows down.
          </p>
        </div>
      </div>
    </div>
  )
}

/** First screen: the name, the result, one primary action, and a board of real product scenes (website.md §4, §5). */
export default function Hero({ copy }: { copy: LandingCopy }) {
  const { hero, ui } = copy
  const sample = getSample(copy.locale)
  const reading = entryById(sample, sample.hero)
  const listed = ['backpressure', 'p99', 'backoff'].map(id => entryById(sample, id))

  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden bg-canvas">
      <Container className="hero-layout relative pb-10 pt-28 sm:pt-32 lg:pb-16">
        <div className="hero-copy relative z-10 max-w-[500px]">
          <p className="inline-flex items-center gap-2 rounded-md border border-line-2 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-fg-2">
            <Puzzle size={14} className="text-brand" aria-hidden="true" />
            {hero.chip}
          </p>
          <h1 id="hero-title" className="display mt-5 text-[48px] font-bold leading-none text-brand sm:text-[64px] lg:text-[72px]">
            AnnHub
          </h1>
          <p className="display mt-5 text-[26px] font-semibold leading-[1.28] text-fg sm:text-[32px] xl:text-[34px]">
            <Clauses text={hero.lead} />
          </p>
          <p className="mt-4 max-w-[440px] text-[16px] leading-[1.75] text-fg-3 sm:max-w-[500px] sm:text-[17px] lg:max-w-[440px]">
            <Clauses text={hero.body} />
          </p>

          {/* The note belongs to the library button: it stays under it when the install button wraps to its own line (§4). */}
          <div className="mt-6 flex flex-wrap items-start gap-3">
            <div>
              <a
                href={LIBRARY_URL}
                className="inline-flex h-12 items-center gap-2 rounded-lg bg-brand px-5 text-[15px] font-semibold text-brand-fg shadow-[0_8px_20px_-8px_rgba(103,58,184,0.7)] transition-colors hover:bg-[color-mix(in_oklab,var(--brand)_86%,#000)]"
              >
                {hero.cta}
                <ArrowRight size={17} aria-hidden="true" />
              </a>
              <p className="mt-2.5 text-[12px] text-fg-3">{hero.demo}</p>
            </div>
            <a
              href={STORE_URL}
              className="inline-flex h-12 items-center gap-2 rounded-lg border border-line-2 bg-white px-5 text-[15px] font-semibold text-fg-2 transition-colors hover:border-brand hover:text-brand-text"
            >
              {hero.install}
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          </div>
          <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-[12px] text-fg-3">
            {hero.facts.map((fact, i) => {
              const Icon = FACT_ICONS[i]!
              return (
                <li key={fact} className="inline-flex items-center gap-1.5">
                  <Icon size={14} className="text-fg-3" aria-hidden="true" />
                  {fact}
                </li>
              )
            })}
          </ul>
          <p className="mt-3 text-[12.5px] text-fg-3">{hero.audience}</p>
        </div>

        <HeroPhone copy={copy} />

        {/* The product board: one large selection scene in front, the reading view and the library behind it.
            Every window is drawn at the size it is laid out for and cropped, never scaled — a scaled-down window's
            text cannot be read. The caption stays with the board it describes. */}
        <div className="hb-wrap">
          <div className="hb" role="img" aria-label={`${hero.captions.page}; ${hero.captions.reader}; ${hero.captions.library}`}>
            <div className="hb-in" aria-hidden="true" inert>
              <span className="hb-label hb-label-b">{hero.captions.reader}</span>
              <span className="hb-label hb-label-a">{hero.captions.page}</span>

              <div className="hb-w hb-b">
                <BrowserFrame title={`${reading.title} · AnnHub`} url={`chrome-extension://annhub/app.html#/read/${reading.id}`}>
                  <AppShell ui={ui} active="clip" counts={sample.counts} rail>
                    <Reader entry={reading} registry={sample.registry} ui={ui} tab="properties" />
                  </AppShell>
                </BrowserFrame>
              </div>

              <div className="hb-w hb-a">
                <BrowserFrame title="Backpressure in Streams" url="engineering.example.com/posts/backpressure-in-streams">
                  <HeroArticle ui={ui} />
                </BrowserFrame>
              </div>

              <div className="hb-w hb-c">
                <BrowserFrame title={`${ui.nav.all} · AnnHub`} url="chrome-extension://annhub/app.html#/all">
                  <AppShell ui={ui} active="all" counts={sample.counts}>
                    <PageHead title={ui.nav.all} sub={plural(sample.counts.all, ui.list.count, ui.list.countOne)} right={<SearchBox ui={ui} />} />
                    <div className="ah-pbody">
                      <EntryList entries={listed} ui={ui} hoverId="backpressure" />
                    </div>
                  </AppShell>
                </BrowserFrame>
              </div>
            </div>
          </div>
          <p data-hero-caption className="hb-caption">
            {hero.sketch}
          </p>
        </div>
      </Container>
    </section>
  )
}
