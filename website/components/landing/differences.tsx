import { FileText, Library, Tags, WifiOff } from 'lucide-react'
import type { LandingCopy } from '@/lib/copy'
import { Container, SectionTitle } from './shared'

const ICONS = { entry: Library, obsidian: FileText, properties: Tags, offline: WifiOff }

/** A concise set of choices; the product and its workflow have already demonstrated them. */
export default function Differences({ copy }: { copy: LandingCopy }) {
  const { diff } = copy
  return (
    <section id="diff" aria-labelledby="diff-title" className="anchor-target bg-white py-14 sm:py-20">
      <Container>
        <div className="grid gap-8 lg:grid-cols-[4fr_8fr] lg:gap-16">
          <SectionTitle id="diff-title">{diff.title}</SectionTitle>
          <dl className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {diff.items.map(item => {
              const Icon = ICONS[item.visual]
              return (
                <div key={item.title} className="border-t border-line pt-5">
                  <dt className="flex items-start gap-2.5 text-[18px] font-semibold leading-snug text-fg">
                    <Icon size={19} className="mt-0.5 flex-none text-brand" aria-hidden="true" />
                    {item.title}
                  </dt>
                  <dd className="mt-3 text-[15px] leading-7 text-fg-3">{item.body}</dd>
                </div>
              )
            })}
          </dl>
        </div>
      </Container>
    </section>
  )
}
