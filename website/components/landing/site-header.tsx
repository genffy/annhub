import Link from 'next/link'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import Logo from '../logo'
import type { LandingCopy } from '@/lib/copy'
import { LIBRARY_URL, STORE_URL } from './links'

/**
 * A floating white bar (docs/product/website.md §5). Plain links, so there is no script and no hidden menu to reach. The install
 * entry appears from 640px up: a phone cannot install the extension (§4).
 */
export default function SiteHeader({ copy }: { copy: LandingCopy }) {
  const { header } = copy
  return (
    <header className="fixed inset-x-3 top-3 z-50 sm:inset-x-5 sm:top-4">
      <div className="mx-auto flex h-14 max-w-page items-center justify-between gap-3 rounded-lg border border-line bg-white/95 px-3 shadow-[0_14px_40px_-12px_rgba(48,41,70,0.22)] backdrop-blur-md sm:px-4">
        <Link href={`/${copy.locale}`} prefetch={false} aria-label={header.home} className="flex items-center gap-2.5 rounded-md py-1 pr-2 font-bold text-fg">
          <Logo className="h-7 w-7 text-brand" />
          <span className="text-[15px] tracking-[-0.01em] sm:text-[16px]">AnnHub</span>
        </Link>

        <nav aria-label={header.navLabel} className="hidden items-center gap-1 lg:flex">
          {header.nav.map(item => (
            <a key={item.id} href={`#${item.id}`} className="rounded-md px-3 py-2 text-[13px] font-medium text-fg-3 transition-colors hover:bg-surface-2 hover:text-fg">
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={header.language.href}
            hrefLang={header.language.href === '/en' ? 'en' : 'zh-CN'}
            lang={header.language.href === '/en' ? 'en' : 'zh-CN'}
            aria-label={header.language.aria}
            className="flex h-9 min-w-9 items-center justify-center rounded-md border border-line-2 px-2.5 text-[12px] font-semibold text-fg-2 transition-colors hover:border-brand hover:text-brand-text"
          >
            {header.language.label}
          </a>
          <a
            href={STORE_URL}
            className="hidden h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-line-2 bg-white px-3.5 text-[13px] font-semibold text-fg-2 transition-colors hover:border-brand hover:text-brand-text sm:inline-flex"
          >
            {header.install}
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
          <a
            href={LIBRARY_URL}
            className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md bg-brand px-2.5 text-[12px] font-semibold text-brand-fg transition-colors hover:bg-[color-mix(in_oklab,var(--brand)_86%,#000)] sm:px-3.5 sm:text-[13px]"
          >
            {header.cta}
            <ArrowRight size={15} aria-hidden="true" className="hidden sm:block" />
          </a>
        </div>
      </div>
    </header>
  )
}
