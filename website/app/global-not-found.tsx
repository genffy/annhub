// The branded 404 (docs/product/website.md §20). `experimental.globalNotFound` (next.config.js) makes Next use this
// file for every address the router does not know. It bypasses the root layout — which lives under the [locale]
// segment — so it renders <html> and <body> itself and imports the global styles and fonts the layout would have.
// The page cannot know the visitor's language, so it shows both, each section with its own `lang` and its own
// exits; no analytics and no consent card load here.
import './[locale]/globals.css'
import '@/components/landing/landing.css'
import { Inter, Source_Serif_4 } from 'next/font/google'
import { ArrowRight } from 'lucide-react'
import Logo from '@/components/logo'
import { getLandingCopy } from '@/lib/copy'
import type { Metadata } from 'next'

const inter = Inter({ weight: ['400', '500', '600', '700'], display: 'swap', subsets: ['latin'], variable: '--font-inter' })
const sourceSerif = Source_Serif_4({ weight: ['400', '600', '700'], display: 'swap', subsets: ['latin'], variable: '--font-source-serif' })

export const metadata: Metadata = { title: '404 · AnnHub', robots: { index: false } }

export default function GlobalNotFound() {
  const blocks = (['zh-CN', 'en'] as const).map(locale => ({ locale, copy: getLandingCopy(locale).notFound }))
  return (
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable}`}>
      <body>
        <main className="mx-auto flex min-h-screen max-w-[720px] flex-col px-6 py-10">
          <div className="flex items-center gap-2.5 font-bold text-fg">
            <Logo className="h-7 w-7 text-brand" />
            <span className="text-[16px]">AnnHub</span>
          </div>
          <p className="display mt-16 text-[96px] font-bold leading-none text-brand">404</p>
          {blocks.map(({ locale, copy }) => (
            <section key={locale} lang={locale} className="mt-8">
              <h1 className="text-[24px] font-semibold text-fg">{copy.title}</h1>
              <p className="mt-2 text-[15px] text-fg-2">{copy.reason}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a href={`/${locale}#library`} className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-5 text-[15px] font-semibold text-brand-fg">
                  {copy.library}
                  <ArrowRight size={17} aria-hidden="true" />
                </a>
                <a href={`/${locale}`} className="inline-flex h-11 items-center rounded-lg border border-line-2 bg-white px-5 text-[15px] font-semibold text-fg-2">
                  {copy.home}
                </a>
              </div>
            </section>
          ))}
        </main>
      </body>
    </html>
  )
}
