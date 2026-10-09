import { Inter, Source_Serif_4 } from 'next/font/google'
import { i18n } from '@/i18n/config'
import { getLandingCopy } from '@/lib/copy'
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import type { Metadata, Viewport } from 'next'

import './globals.css'
import '@/components/product/product-page.css'
import '@/components/product/product-app.css'
import '@/components/landing/landing.css'

export async function generateStaticParams() {
  return i18n.locales.map(locale => ({ locale }))
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f2f0f8',
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const { meta, locale: lang } = getLandingCopy(locale)
  return {
    metadataBase: new URL('https://annhub.org'),
    title: meta.title,
    description: meta.description,
    alternates: {
      canonical: `/${lang}`,
      languages: { 'zh-CN': '/zh-CN', 'en': '/en', 'x-default': '/zh-CN' },
    },
    icons: {
      icon: '/icon.png',
      shortcut: '/icon.png',
      apple: '/icon.png',
    },
    openGraph: {
      title: meta.ogTitle,
      description: meta.ogDescription,
      type: 'website',
      siteName: 'AnnHub',
      url: `/${lang}`,
      locale: lang === 'zh-CN' ? 'zh_CN' : 'en_US',
      alternateLocale: lang === 'zh-CN' ? ['en_US'] : ['zh_CN'],
    },
  }
}

// The product windows use the interface font plus a serif for "the user's web page": the serif tells a page of ours
// apart from a page of theirs (docs/design/v2/README.md).
const inter = Inter({
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  subsets: ['latin'],
  variable: '--font-inter',
})

const sourceSerif = Source_Serif_4({
  weight: ['400', '600', '700'],
  display: 'swap',
  subsets: ['latin'],
  variable: '--font-source-serif',
})

type RootLayoutProps = {
  params: Promise<{ locale: string }>
  children: React.ReactNode
}

export default async function RootLayout({ params, children }: RootLayoutProps) {
  const { locale } = await params
  if (!hasLocale(i18n.locales, locale)) notFound()
  // Tells next-intl the locale up front, so it does not read request headers and the page can be prerendered.
  setRequestLocale(locale)
  const messages = (await import(`@/i18n/messages/${locale}.json`)).default

  return (
    // globals.css smooth-scrolls in-page anchors. With this attribute Next switches that off while it changes pages (the
    // language link), so the new page opens at the top at once instead of animating a ~1s scroll up the whole page.
    <html lang={locale} data-scroll-behavior="smooth" className={`${inter.variable} ${sourceSerif.variable}`}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
