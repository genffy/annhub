import { ArrowDown, CircleCheck, FileArchive, FileText, Library, WifiOff } from 'lucide-react'
import type { LandingCopy } from '@/lib/copy'
import { PropertyRows } from '../product/detail'
import { EntryList } from '../product/library'
import { Ic, PROPERTY_ICON } from '../product/parts'
import { entryById, getSample } from '../product/sample'
import type { PropertyType } from '../product/types'
import { Container, SectionTitle } from './shared'

const TYPES: PropertyType[] = ['text', 'list', 'number', 'checkbox', 'date', 'datetime']

function Visual({ kind, copy }: { kind: LandingCopy['diff']['items'][number]['visual']; copy: LandingCopy }) {
  const { ui, diff } = copy
  const sample = getSample(copy.locale)

  if (kind === 'entry') {
    // Clips and screenshots side by side in one list: the same row, the same source, the same properties.
    return (
      <div className="ah ah-win bg-surface-2 p-3 sm:p-4" aria-hidden="true">
        <EntryList entries={['storm', 'p99', 'idempotency'].map(id => entryById(sample, id))} ui={ui} />
      </div>
    )
  }

  if (kind === 'obsidian') {
    const node = 'flex items-center gap-3 rounded-lg border border-line bg-white px-4 py-3.5 shadow-card'
    const icon = 'flex h-9 w-9 flex-none items-center justify-center rounded-md bg-surface-3 text-fg-3'
    return (
      <div className="ah mx-auto flex max-w-[420px] flex-col items-stretch gap-2" aria-hidden="true">
        <div className={node}>
          <span className={icon} style={{ background: 'color-mix(in oklab, var(--brand) 10%, var(--surface))', color: 'var(--brand)' }}>
            <Ic icon={Library} size={18} />
          </span>
          <span className="text-[14px] font-semibold leading-snug text-fg">{diff.flow.library}</span>
        </div>
        <ArrowDown size={18} className="mx-auto flex-none text-fg-4" />
        <div className={node}>
          <span className={icon}>
            <Ic icon={FileArchive} size={18} />
          </span>
          <span className="text-[14px] font-semibold leading-snug text-fg">{diff.flow.zip}</span>
        </div>
        <ArrowDown size={18} className="mx-auto flex-none text-fg-4" />
        <div className={node}>
          <span className={icon}>
            <Ic icon={FileText} size={18} />
          </span>
          <span className="text-[14px] font-semibold leading-snug text-fg">{diff.flow.tool}</span>
        </div>
      </div>
    )
  }

  if (kind === 'properties') {
    return (
      <div className="ah" aria-hidden="true">
        <div className="mb-3 flex flex-wrap gap-2">
          {TYPES.map(type => (
            <span key={type} className="ah-chip">
              <Ic icon={PROPERTY_ICON[type]} />
              {ui.props.types[type]}
            </span>
          ))}
        </div>
        <div className="ah-win bg-surface p-2">
          <PropertyRows entry={entryById(sample, 'storm')} registry={sample.registry} ui={ui} system={false} />
        </div>
      </div>
    )
  }

  return (
    <div className="ah rounded-lg border border-line bg-white p-5 shadow-card" aria-hidden="true">
      <span className="ah-chip" style={{ height: 26, fontSize: 12.5 }}>
        <Ic icon={WifiOff} size={14} />
        {diff.offline.label}
      </span>
      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {diff.offline.steps.map(step => (
          <li key={step} className="flex items-center gap-2.5 rounded-md bg-surface-2 px-3 py-2.5 text-[13.5px] font-medium text-fg-2">
            <Ic icon={CircleCheck} size={17} className="text-ok" />
            {step}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Four deliberate choices, each next to a picture from the product (website.md §9). No numbers, no superlatives. */
export default function Differences({ copy }: { copy: LandingCopy }) {
  const { diff } = copy
  return (
    <section id="diff" aria-labelledby="diff-title" className="anchor-target bg-white py-20 sm:py-28">
      <Container>
        <SectionTitle id="diff-title" className="max-w-[760px]">
          {diff.title}
        </SectionTitle>
        <div className="mt-12 divide-y divide-line border-y border-line">
          {diff.items.map((item, i) => (
            <div key={item.title} className="grid items-center gap-8 py-10 lg:grid-cols-2 lg:gap-16 lg:py-12">
              <div className={i % 2 ? 'lg:order-2' : ''}>
                <h3 className="text-[26px] font-bold leading-tight text-fg sm:text-[30px]">{item.title}</h3>
                <p className="mt-3 max-w-[500px] text-[16.5px] leading-7 text-fg-3">{item.body}</p>
              </div>
              <div className={i % 2 ? 'lg:order-1' : ''}>
                <Visual kind={item.visual} copy={copy} />
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}
