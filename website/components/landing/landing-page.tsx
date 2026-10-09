import type { LandingCopy } from '@/lib/copy'
import Differences from './differences'
import Faq from './faq'
import Hero from './hero'
import LibrarySection from './library'
import Problem from './problem'
import Progress from './progress'
import SiteFooter from './site-footer'
import SiteHeader from './site-header'
import Story from './story'
import Trust from './trust'
import Ways from './ways'

/** Order follows docs/v2/website.md §3: hero, problem, the three ways, one real story, the product, differences, trust, FAQ, progress. */
export default function LandingPage({ copy }: { copy: LandingCopy }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-[14px] focus:font-semibold focus:text-brand-text focus:shadow-pop"
      >
        {copy.header.skip}
      </a>
      <SiteHeader copy={copy} />
      <main id="main">
        <Hero copy={copy} />
        <Problem copy={copy} />
        <Ways copy={copy} />
        <Story copy={copy} />
        <LibrarySection copy={copy} />
        <Differences copy={copy} />
        <Trust copy={copy} />
        <Faq copy={copy} />
        <Progress copy={copy} />
      </main>
      <SiteFooter copy={copy} />
    </>
  )
}
