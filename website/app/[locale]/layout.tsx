import { Inter } from 'next/font/google'
import { i18n } from '@/i18n/config'
import { NextIntlClientProvider } from 'next-intl'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import './globals.css'

export async function generateStaticParams() {
  return i18n.locales.map(locale => ({ locale }))
}

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  const zh = locale === 'zh-CN'
  return {
    metadataBase: new URL('https://annhub.org'),
    title: zh ? 'AnnHub - 把网页中的知识变成工作中用得上的能力' : 'AnnHub - Turn web knowledge into something you can use',
    description: zh
      ? '在浏览器中连同语境采集概念、论点和方法，在 Mac 上按类型复习。本地优先，AI 可选。'
      : 'Capture concepts, claims, and procedures with context in the browser. Review them by type on Mac. Local-first, AI optional.',
    icons: {
      icon: '/icon.png',
      shortcut: '/icon.png',
      apple: '/icon.png',
    },
    openGraph: {
      title: zh ? 'AnnHub - 知识碎片采集与内化系统' : 'AnnHub - Knowledge capture and retrieval',
      description: zh ? '从网页选区到一次主动回忆。' : 'From a web selection to an act of recall.',
      type: 'website',
      siteName: 'AnnHub',
    },
  }
}

const inter = Inter({
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  subsets: ['latin'],
})

type RootLayoutProps = {
  params: { locale: string }
  children: React.ReactNode
}

export default async function RootLayout({ params: { locale }, children }: RootLayoutProps) {
  let messages
  try {
    messages = (await import(`@/i18n/messages/${locale}.json`)).default
  } catch {
    notFound()
  }

  return (
    <html lang={locale}>
      <body className={inter.className}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
