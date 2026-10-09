import { GitBranch } from 'lucide-react'
import type { LandingCopy } from '@/lib/copy'
import { fill } from '@/lib/copy'
import Logo from '../logo'
import { Container } from './shared'
import { PRIVACY_URL, PROGRESS_URL, REPO_URL, TERMS_URL } from './links'

export default function SiteFooter({ copy }: { copy: LandingCopy }) {
  const { footer } = copy
  const link = 'text-[13px] font-medium text-fg-3 transition-colors hover:text-brand-text'
  return (
    <footer className="border-t border-line bg-canvas-2 py-12">
      <Container>
        <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5 text-[18px] font-bold tracking-[-0.01em] text-fg">
              <Logo className="h-8 w-8 text-brand" />
              AnnHub
            </div>
            <p className="mt-4 max-w-[420px] text-[14px] leading-6 text-fg-3">{footer.line}</p>
          </div>
          <nav aria-label={footer.navLabel} className="flex flex-wrap gap-x-6 gap-y-3">
            <a href={PROGRESS_URL} target="_blank" rel="noopener noreferrer" className={`${link} inline-flex items-center gap-1.5`}>
              <GitBranch size={14} aria-hidden="true" />
              {footer.roadmap}
            </a>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={link}>
              {footer.github}
            </a>
            {/* plain anchors: these are static pages in public/, not routes of this app */}
            <a href={PRIVACY_URL} className={link}>
              {footer.privacy}
            </a>
            <a href={TERMS_URL} className={link}>
              {footer.terms}
            </a>
          </nav>
        </div>
        <p className="mt-8 border-t border-line-2 pt-5 text-[12px] text-fg-3">{fill(footer.copyright, { year: new Date().getFullYear() })}</p>
      </Container>
    </footer>
  )
}
