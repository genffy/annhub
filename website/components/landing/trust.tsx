import { ArrowUpRight, Ban, Database, FileArchive, Globe, HardDrive, Info, Lock, MousePointerClick, ShieldCheck, WifiOff } from 'lucide-react'
import type { LandingCopy } from '@/lib/copy'
import Logo from '../logo'
import { Container, RichText, SectionTitle } from './shared'
import { PRIVACY_URL } from './links'

const ITEM_ICONS = [WifiOff, ShieldCheck, MousePointerClick, FileArchive]

/** Where your material lives, drawn as a boundary: everything inside the browser, nothing leaving by default. */
function Boundary({ copy }: { copy: LandingCopy }) {
  const d = copy.trust.diagram
  const box = 'rounded-md border border-line bg-surface-2 px-3.5 py-3'
  return (
    <div role="img" aria-label={`${d.browser}: ${d.entries}; ${d.settings}. ${d.server}: ${d.none}.`} className="mx-auto w-full max-w-[460px]">
      <div className="relative rounded-lg border border-dashed border-line-2 bg-surface p-4 pt-9 sm:p-5 sm:pt-10">
        <span className="absolute left-4 top-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand-text sm:left-5">
          <Lock size={13} aria-hidden="true" />
          {d.browser}
        </span>
        <div className="flex items-center gap-2.5">
          <Logo className="h-7 w-7 text-brand" />
          <span className="text-[15px] font-bold tracking-[-0.01em] text-fg">AnnHub</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className={box}>
            <Database size={16} className="text-fg-3" aria-hidden="true" />
            <p className="mt-2 text-[12.5px] leading-5 text-fg-2">{d.entries}</p>
          </div>
          <div className={box}>
            <HardDrive size={16} className="text-fg-3" aria-hidden="true" />
            <p className="mt-2 text-[12.5px] leading-5 text-fg-2">{d.settings}</p>
          </div>
        </div>
        <div className="mx-auto my-3 flex h-9 w-px flex-col items-center border-l border-dotted border-fg-4" aria-hidden="true" />
        <div className={`${box} flex items-start gap-3`}>
          <Globe size={16} className="mt-0.5 flex-none text-fg-3" aria-hidden="true" />
          <div>
            <p className="text-[12.5px] font-semibold leading-5 text-fg-2">{d.page}</p>
            <p className="mt-0.5 text-[12px] leading-5 text-fg-3">{d.fetch}</p>
          </div>
        </div>
      </div>
      <div className="mx-auto flex h-12 w-px items-center border-l border-dashed border-line-2" aria-hidden="true">
        <span className="-ml-[11px] flex h-[22px] w-[22px] items-center justify-center rounded-full border border-line-2 bg-surface text-fg-3">
          <Ban size={13} />
        </span>
      </div>
      <div className="rounded-lg border border-dashed border-line-2 px-4 py-3.5 text-center text-[13px] text-fg-3">
        <span className="font-semibold text-fg-2">{d.server}</span>
        <span className="mx-2 text-fg-4">·</span>
        {d.none}
      </div>
    </div>
  )
}

/** Privacy and ownership, the one dark band of the page: the product's own dark tokens (docs/design/v2 tokens.css). */
export default function Trust({ copy }: { copy: LandingCopy }) {
  const { trust } = copy
  return (
    <section id="local" aria-labelledby="local-title" className="theme-dark anchor-target bg-[#0d1017] py-20 text-fg sm:py-28">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
          <div>
            <p className="text-[12.5px] font-semibold uppercase tracking-[0.14em] text-brand-text">{trust.eyebrow}</p>
            <SectionTitle id="local-title" className="mt-4 max-w-[640px]">
              {trust.title}
            </SectionTitle>
            <p className="mt-5 max-w-[600px] text-[16.5px] leading-8 text-fg-2">
              <RichText text={trust.body} />
            </p>

            <ul className="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2">
              {trust.items.map((item, i) => {
                const Icon = ITEM_ICONS[i]!
                return (
                  <li key={item.title} className="flex gap-3.5">
                    <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-md bg-surface-3 text-brand-text">
                      <Icon size={16} aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="text-[16px] font-semibold text-fg">{item.title}</h3>
                      <p className="mt-1 text-[14px] leading-6 text-fg-3">{item.body}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="lg:pt-6">
            <Boundary copy={copy} />
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 rounded-lg border border-line bg-surface p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="flex gap-3.5">
            <Info size={18} className="mt-1 flex-none text-fg-3" aria-hidden="true" />
            <div>
              <h3 className="text-[15px] font-semibold text-fg">{trust.exception.title}</h3>
              <p className="mt-1 max-w-[760px] text-[14px] leading-6 text-fg-3">{trust.exception.body}</p>
            </div>
          </div>
          <a
            href={PRIVACY_URL}
            className="inline-flex h-10 flex-none items-center gap-1.5 self-start rounded-md border border-line-2 px-3.5 text-[13.5px] font-semibold text-fg-2 transition-colors hover:border-brand-text hover:text-brand-text"
          >
            {trust.link}
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
      </Container>
    </section>
  )
}
